import { Worker, type Job } from 'bullmq';
import { Redis } from 'ioredis';
import { container } from '@sapphire/framework';
import {
    RETENTION_QUEUE,
    RETENTION_QUEUE_PREFIX,
    purgeGuildData,
    type GuildPurgeJob
} from '../services/GuildRetentionService';

// Retention worker ──────────────────
//
// Runs the deletion once the grace period has elapsed. Queue-backed rather than
// a sweep for the same reasons sanction expiry is: the delay is per guild, and
// exactly one instance should do the deleting.

export function setupRetentionWorker() {
    const { logger } = container;

    const connection = new Redis({
        ...container.redis?.options,
        maxRetriesPerRequest: null
    });

    const worker = new Worker<GuildPurgeJob>(
        RETENTION_QUEUE,
        async (job: Job<GuildPurgeJob>) => {
            const { guildId } = job.data;

            // The bot may have been re-added after this was queued. Rejoining
            // cancels the job, but a cancellation can be missed -- Redis
            // unreachable at the moment of the GuildCreate, say -- so this is
            // checked again at the last possible moment. Deleting a live
            // guild's moderation history is not a mistake worth risking on one
            // signal.
            if (container.client.guilds.cache.has(guildId)) {
                logger.info(`[RETENTION] Skipping purge for ${guildId}: the bot is in the guild.`);
                return;
            }

            await purgeGuildData(guildId);
        },
        {
            connection: connection as never,
            prefix: RETENTION_QUEUE_PREFIX,
            concurrency: 1,
            lockDuration: 120_000,
            lockRenewTime: 60_000,
            removeOnComplete: { count: 0 },
            removeOnFail: { count: 50 }
        }
    );

    worker.on('failed', (job, error) => {
        logger.error(`[RETENTION] Job ${job?.id} failed: ${error.message}`);
    });

    worker.on('closed', async () => {
        await connection.quit();
        logger.info('[RETENTION] Redis connection closed.');
    });

    logger.info('[WORKER] Initialized successfully - Guild Data Retention');

    return worker;
}
