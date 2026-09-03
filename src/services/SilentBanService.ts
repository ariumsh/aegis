import { prisma } from '../database/db';
import { redis as redisConnection } from '../database/Redis';
import { silentBanQueue } from '../lib/utils/SilentBanQueue';
import type { SilentBan } from '@prisma/client';


// Silent ban service ──────────────────

const REDIS_PREFIX = 'silentban';

function redisKey(guildId: string, userId: string): string {
    return `${REDIS_PREFIX}:${guildId}:${userId}`;
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
        console.error(`[SILENTBAN] ❌ Error in isSilentBanned (primary): ${err.message}`);
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
            console.error(`[SILENTBAN] ❌ Error in isSilentBanned (DB fallback): ${dbErr.message}`);
            return true;
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
            console.warn(`[SILENTBAN] Failed to remove previous expire job for ${userId} in ${guildId}: ${error?.message ?? error}`);
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

    console.info(`[SILENTBAN] 🔇 Silent ban applied to ${userId} in ${guildId}${expiresAt ? ` (expires: ${expiresAt.toISOString()})` : ' (permanent)'}`);

    silentBanQueue.add(
        'voice_disconnect',
        { guildId, userId },
        { jobId: `vcdis-ban-${guildId}-${userId}`, removeOnComplete: true, removeOnFail: true, attempts: 1 }
    ).catch((error: any) => {
        console.warn(`[SILENTBAN] Failed to enqueue voice disconnect job for ${userId} in ${guildId}: ${error?.message ?? error}`);
    });

    return ban;
}


// Removes a silent ban from DB and Redis, and cancels any pending expiry job ──────────

export async function removeSilentBan(guildId: string, userId: string): Promise<void> {
    await prisma.silentBan.deleteMany({ where: { guildId, userId } });
    await redisConnection.del(redisKey(guildId, userId));

    const job = await silentBanQueue.getJob(`expire-${guildId}-${userId}`).catch(() => null);
    if (job) await job.remove().catch(() => {});

    console.info(`[SILENTBAN] 🔊 Silent ban removed for ${userId} in ${guildId}`);
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


// Warms the Redis cache with all active silent bans for a guild ──────────

export async function warmCache(guildId: string): Promise<void> {
    try {
        const bans = await prisma.silentBan.findMany({
            where: {
                guildId,
                OR: [
                    { expiresAt: null },
                    { expiresAt: { gt: new Date() } }
                ]
            }
        });

        const pipeline = redisConnection.pipeline();
        for (const ban of bans) {
            if (ban.expiresAt) {
                const ttl = Math.max(1, Math.floor((ban.expiresAt.getTime() - Date.now()) / 1000));
                pipeline.set(redisKey(ban.guildId, ban.userId), '1', 'EX', ttl);
            } else {
                pipeline.set(redisKey(ban.guildId, ban.userId), '1');
            }
        }
        await (pipeline as any).exec();

        console.info(`[SILENTBAN] 🔥 Cache warmed: ${bans.length} active bans loaded.`);
    } catch (err: any) {
        console.error(`[SILENTBAN] ❌ Error warming cache: ${err.message}`);
    }
}
