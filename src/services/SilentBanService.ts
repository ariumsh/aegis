import { prisma } from '../database/db';
import { redis as redisConnection } from '../database/Redis';
import { silentBanQueue } from '../lib/utils/SilentBanQueue';
import type { SilentBan } from '@prisma/client';
import { container } from '@sapphire/framework';


// Silent ban service ──────────────────

const REDIS_PREFIX = 'silentban';

function redisKey(guildId: string, userId: string): string {
    return `${REDIS_PREFIX}:${guildId}:${userId}`;
}


// In-memory index ──────────────────
//
// Enforcement has to answer "is this user silent banned?" for every message in
// every guild the bot is in. Asking Redis each time adds a round trip to the
// hot path of the busiest event the gateway produces, so the active set is held
// in memory instead and consulted synchronously.
//
// It is small by nature — silent bans are rare and only unexpired ones are kept
// — and it is authoritative because every write path below updates it. Redis
// and PostgreSQL remain the durable stores; this is only a read accelerator,
// rebuilt from PostgreSQL on every boot.

/** guildId -> userId -> expiry in epoch ms, or null when permanent. */
const activeBans = new Map<string, Map<string, number | null>>();

/**
 * False until the index has been loaded from PostgreSQL.
 *
 * Enforcement treats an unloaded index as "nobody is banned" rather than
 * blocking, so a slow start delays enforcement instead of stalling the gateway.
 */
let indexReady = false;

function indexAdd(guildId: string, userId: string, expiresAt: Date | null): void {
    let guild = activeBans.get(guildId);
    if (!guild) {
        guild = new Map();
        activeBans.set(guildId, guild);
    }
    guild.set(userId, expiresAt ? expiresAt.getTime() : null);
}

function indexRemove(guildId: string, userId: string): void {
    const guild = activeBans.get(guildId);
    if (!guild) return;
    guild.delete(userId);
    if (guild.size === 0) activeBans.delete(guildId);
}

/**
 * Synchronous lookup for the enforcement path. No I/O.
 *
 * Expiry is checked on read as well as being swept by the queue, so a ban still
 * lapses on time even if the expiry job was lost — the queue is durable, but a
 * user should not stay silenced because a job went missing.
 */
export function isSilentBannedCached(guildId: string, userId: string): boolean {
    if (!indexReady) return false;

    const guild = activeBans.get(guildId);
    if (!guild) return false;

    const expiresAt = guild.get(userId);
    if (expiresAt === undefined) return false;

    if (expiresAt !== null && expiresAt <= Date.now()) {
        indexRemove(guildId, userId);
        return false;
    }

    return true;
}

/**
 * Rebuilds the index from PostgreSQL. Called once from the Ready listener.
 *
 * Failure is not fatal: the bot runs with enforcement inactive rather than
 * refusing to start, which is the same trade-off isSilentBanned makes when the
 * datastores are unreachable.
 */
export async function loadSilentBanIndex(): Promise<number> {
    try {
        const bans = await prisma.silentBan.findMany({
            where: {
                OR: [
                    { expiresAt: null },
                    { expiresAt: { gt: new Date() } }
                ]
            }
        });

        activeBans.clear();
        for (const ban of bans) indexAdd(ban.guildId, ban.userId, ban.expiresAt);
        indexReady = true;

        container.logger.info(`[SILENTBAN] Index loaded: ${bans.length} active ban(s).`);
        return bans.length;
    } catch (error) {
        container.logger.error('[SILENTBAN] Could not load the index; enforcement stays inactive:', error);
        return 0;
    }
}


// Returns whether a user is currently silent banned, checking Redis first then DB ──────────

export async function isSilentBanned(guildId: string, userId: string): Promise<boolean> {
    try {
        const cached = await redisConnection.get(redisKey(guildId, userId));
        if (cached === '1') return true;
        if (cached === '0') return false;

        const ban = await prisma.silentBan.findFirst({
            where: {
                guildId,
                userId,
                OR: [
                    { expiresAt: null },
                    { expiresAt: { gt: new Date() } }
                ]
            }
        });

        if (ban) {
            const ttl = ban.expiresAt
                ? Math.max(1, Math.floor((ban.expiresAt.getTime() - Date.now()) / 1000))
                : 0;

            if (ttl > 0) {
                await redisConnection.set(redisKey(guildId, userId), '1', 'EX', ttl);
            } else {
                await redisConnection.set(redisKey(guildId, userId), '1');
            }
            return true;
        }

        await redisConnection.set(redisKey(guildId, userId), '0', 'EX', 300);
        return false;
    } catch (err: any) {
        container.logger.error(`[SILENTBAN] ❌ Error in isSilentBanned (primary): ${err.message}`);
        try {
            const ban = await prisma.silentBan.findFirst({
                where: {
                    guildId,
                    userId,
                    OR: [
                        { expiresAt: null },
                        { expiresAt: { gt: new Date() } }
                    ]
                }
            });
            return !!ban;
        } catch (dbErr: any) {
            // Fail open. With both Redis and PostgreSQL unreachable there is no
            // way to tell a sanctioned user from anyone else, and this answer
            // decides whether to delete someone's messages and disconnect them
            // from voice. Returning true would apply that to every user in every
            // guild for the duration of the outage, turning a database incident
            // into a mass moderation incident.
            //
            // Letting a silent ban lapse while the datastores are down is the
            // cheaper failure by a wide margin, and it self-corrects the moment
            // either store recovers.
            container.logger.error(
                `[SILENTBAN] Cache and database both unavailable for ${userId} in ${guildId}; treating as not banned: ${dbErr.message}`
            );
            return false;
        }
    }
}


// Creates or updates a silent ban and schedules expiry if needed ──────────

export async function addSilentBan(
    guildId: string,
    userId: string,
    moderatorId: string,
    reason: string | null,
    durationMs: number | null,
): Promise<SilentBan> {
    const expiresAt = durationMs ? new Date(Date.now() + durationMs) : null;

    const ban = await prisma.$transaction(async (tx) => {
        const config = await tx.guildConfig.update({
            where: { guildId },
            data: { caseCount: { increment: 1 } },
            select: { caseCount: true }
        });

        return tx.silentBan.upsert({
            where:  { guild_user_unique: { guildId, userId } },
            create: { guildId, userId, moderatorId, reason, expiresAt, caseNumber: config.caseCount },
            update: { moderatorId, reason, expiresAt, caseNumber: config.caseCount },
        });
    });

    const oldJob = await silentBanQueue.getJob(`expire-${guildId}-${userId}`).catch(() => null);
    if (oldJob) {
        await oldJob.remove().catch((error: any) => {
            container.logger.warn(`[SILENTBAN] Failed to remove previous expire job for ${userId} in ${guildId}: ${error?.message ?? error}`);
        });
    }

    if (expiresAt && durationMs) {
        const ttl = Math.max(1, Math.floor(durationMs / 1000));
        await redisConnection.set(redisKey(guildId, userId), '1', 'EX', ttl);

        await silentBanQueue.add(
            'expire_ban',
            { guildId, userId },
            {
                jobId: `expire-${guildId}-${userId}`,
                delay: durationMs,
                removeOnComplete: true,
                removeOnFail: true,
            }
        );
    } else {
        await redisConnection.set(redisKey(guildId, userId), '1');
    }

    indexAdd(guildId, userId, expiresAt);

    container.logger.info(`[SILENTBAN] 🔇 Silent ban applied to ${userId} in ${guildId}${expiresAt ? ` (expires: ${expiresAt.toISOString()})` : ' (permanent)'}`);

    silentBanQueue.add(
        'voice_disconnect',
        { guildId, userId },
        { jobId: `vcdis-ban-${guildId}-${userId}`, removeOnComplete: true, removeOnFail: true, attempts: 1 }
    ).catch((error: any) => {
        container.logger.warn(`[SILENTBAN] Failed to enqueue voice disconnect job for ${userId} in ${guildId}: ${error?.message ?? error}`);
    });

    return ban;
}


// Removes a silent ban from DB and Redis, and cancels any pending expiry job ──────────

export async function removeSilentBan(guildId: string, userId: string): Promise<void> {
    await prisma.silentBan.deleteMany({ where: { guildId, userId } });
    await redisConnection.del(redisKey(guildId, userId));

    const job = await silentBanQueue.getJob(`expire-${guildId}-${userId}`).catch(() => null);
    if (job) await job.remove().catch(() => {});

    indexRemove(guildId, userId);

    container.logger.info(`[SILENTBAN] 🔊 Silent ban removed for ${userId} in ${guildId}`);
}


// Returns all active silent bans for a guild ──────────

export async function listSilentBans(guildId: string): Promise<SilentBan[]> {
    return prisma.silentBan.findMany({
        where: {
            guildId,
            OR: [
                { expiresAt: null },
                { expiresAt: { gt: new Date() } }
            ]
        },
        orderBy: { createdAt: 'desc' },
    });
}
