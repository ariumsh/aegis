import { Queue } from 'bullmq';
import { Redis } from 'ioredis';
import { container } from '@sapphire/framework';
import { prisma } from '../database/db';
import { deleteMatching } from '../database/CacheManager';

// Guild data retention ──────────────────
//
// Aegis stores Discord user ids and moderator-written reasons indefinitely, and
// until now nothing ever removed them. Removing the bot from a server left its
// entire moderation history, ticket records and permission tables in the
// database forever, with no way for the operator to get rid of them short of
// writing SQL.
//
// Departure is the clearest possible signal that a guild's data is no longer
// needed, so it is what triggers deletion. Not immediately, though: being
// removed and re-added is common -- a permissions mistake, a server rebuild, a
// brief argument -- and wiping a moderation record because somebody kicked the
// bot for ten minutes would be its own kind of failure. The delay gives that
// case room to resolve itself.

export const RETENTION_QUEUE = 'guild-retention';
export const RETENTION_QUEUE_PREFIX = 'aegis-retention';

const DEFAULT_GRACE_DAYS = 30;

export interface GuildPurgeJob {
    guildId: string;
}

/**
 * How long a guild's data outlives the bot's departure.
 *
 * Zero is honoured and means purge immediately, for operators who would rather
 * hold nothing. A negative or unparseable value falls back to the default
 * rather than being treated as zero, because silently deleting everything is
 * the worst possible reading of a typo.
 */
export function graceDays(): number {
    const raw = Number(process.env.GUILD_DATA_RETENTION_DAYS);
    return Number.isFinite(raw) && raw >= 0 ? raw : DEFAULT_GRACE_DAYS;
}

let queue: Queue<GuildPurgeJob> | null = null;

export function getRetentionQueue(): Queue<GuildPurgeJob> {
    if (!queue) {
        const connection = new Redis({
            ...container.redis?.options,
            maxRetriesPerRequest: null
        });

        queue = new Queue<GuildPurgeJob>(RETENTION_QUEUE, {
            connection: connection as never,
            prefix: RETENTION_QUEUE_PREFIX
        });
    }

    return queue;
}

const jobId = (guildId: string) => `purge:${guildId}`;

/** Queues the deletion, replacing any pending one for the same guild. */
export async function scheduleGuildPurge(guildId: string): Promise<void> {
    try {
        const existing = await getRetentionQueue().getJob(jobId(guildId)).catch(() => null);
        if (existing) await existing.remove().catch(() => undefined);

        const delay = graceDays() * 24 * 60 * 60 * 1000;

        await getRetentionQueue().add(
            'purge-guild',
            { guildId },
            {
                jobId: jobId(guildId),
                delay,
                attempts: 3,
                backoff: { type: 'exponential', delay: 60_000 },
                removeOnComplete: true,
                removeOnFail: { count: 20 }
            }
        );

        container.logger.info(
            `[RETENTION] Data for guild ${guildId} scheduled for deletion in ${graceDays()} day(s).`
        );
    } catch (error) {
        container.logger.error(`[RETENTION] Could not schedule purge for ${guildId}:`, error);
    }
}

/** Called when the bot rejoins, so a return inside the grace period costs nothing. */
export async function cancelGuildPurge(guildId: string): Promise<void> {
    try {
        const existing = await getRetentionQueue().getJob(jobId(guildId)).catch(() => null);
        if (!existing) return;

        await existing.remove();
        container.logger.info(`[RETENTION] Purge cancelled for guild ${guildId}; the bot is back.`);
    } catch (error) {
        container.logger.error(`[RETENTION] Could not cancel purge for ${guildId}:`, error);
    }
}

/**
 * Deletes everything Aegis holds for a guild.
 *
 * Ordered so the tables carrying personal data go first: if this fails partway,
 * what survives should be configuration rather than moderation history.
 */
export async function purgeGuildData(guildId: string): Promise<Record<string, number>> {
    const where = { guildId };

    const [modLogs, thresholds, mutes, tempBans, silentBans, tickets, permissions, commanders] =
        await prisma.$transaction([
            prisma.modLog.deleteMany({ where }),
            prisma.modThreshold.deleteMany({ where }),
            prisma.activeMute.deleteMany({ where }),
            prisma.activeTempBan.deleteMany({ where }),
            prisma.silentBan.deleteMany({ where }),
            prisma.ticket.deleteMany({ where }),
            prisma.modPermission.deleteMany({ where }),
            prisma.botCommander.deleteMany({ where })
        ]);

    // Last, and outside the transaction above only in the sense that it is the
    // row everything else hangs off: with it gone the guild is unknown again.
    await prisma.guildConfig.deleteMany({ where });

    // Cached configuration and runtime keys. SCAN rather than KEYS -- this can
    // run while the bot is serving other guilds.
    const cached = await deleteMatching(`*:${guildId}`);
    const scoped = await deleteMatching(`*:${guildId}:*`);

    const counts = {
        modLogs: modLogs.count,
        thresholds: thresholds.count,
        mutes: mutes.count,
        tempBans: tempBans.count,
        silentBans: silentBans.count,
        tickets: tickets.count,
        permissions: permissions.count,
        commanders: commanders.count,
        redisKeys: cached + scoped
    };

    container.logger.info(`[RETENTION] Purged guild ${guildId}: ${JSON.stringify(counts)}`);
    return counts;
}
