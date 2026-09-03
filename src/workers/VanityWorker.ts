import { Worker, type Job } from 'bullmq';
import { container } from '@sapphire/framework';
import { checkVanity } from '../lib/utils/vanity';
import { Redis } from 'ioredis';


// Vanity worker ──────────────────

export function setupVanityWorker() {
    const { logger } = container;

    logger.info('[WORKER] Initialized successfully - Vanity Tracker');

    const workerConnection = new Redis({
        ...container.redis?.options,
        maxRetriesPerRequest: null
    });

    // Job handler ──────────

    const worker = new Worker(
        'vanity-roles',
        async (job: Job) => {
            try {
                const guild = await container.client.guilds.fetch(job.data.guildId).catch(() => null);
                if (!guild) return;

                const member = await guild.members.fetch(job.data.memberId).catch(() => null);
                if (!member) return;

                await checkVanity(member, job.data.hasVanity);
            } catch (error) {
                logger.error(`[VANITY-WORKER] Critical failure in job ${job.id}:`, error);
                throw error;
            }
        },
        {
            connection: workerConnection as any,
            prefix: 'aegis-vanity',
            concurrency: 1,
            lockDuration: 60000,
            lockRenewTime: 30000,
            stalledInterval: 60000,
            maxStalledCount: 0,
            removeOnComplete: { count: 0 },
            removeOnFail: { count: 100 }
        }
    );

    // Events ──────────

    worker.on('failed', (job, err) => {
        logger.error(`[VANITY-WORKER] Job ${job?.id} failed: ${err.message}`);
    });

    worker.on('closed', async () => {
        await workerConnection.quit();
        logger.info('[VANITY-WORKER] Redis connection closed');
    });

    return worker;
}
