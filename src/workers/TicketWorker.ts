import { Worker, type Job } from 'bullmq';
import { Redis } from 'ioredis';
import { container } from '@sapphire/framework';
import { prisma } from '../database/db';
import { getTicketConfig, closeTicket } from '../lib/utils/ticketUtils';


// Ticket auto-close worker ──────────────────

export function setupTicketWorker() {
    const { logger } = container;

    logger.info('[WORKER] Initialized successfully - Ticket Auto-Close');

    const workerConnection = new Redis({
        ...(container.redis as any)?.options,
        maxRetriesPerRequest: null
    });

    const worker = new Worker(
        'tickets-autoclose',
        async (job: Job) => {
            try {
                if (job.name !== 'auto-close') return;
                const { guildId, ticketId } = job.data;

                const ticket = await prisma.ticket.findUnique({ where: { id: ticketId } });
                if (!ticket || ticket.status !== 'open' || ticket.autoCloseJobId !== job.id) return;

                const guild = container.client.guilds.cache.get(guildId);
                if (!guild) return;

                const config = await getTicketConfig(guildId);
                await closeTicket(ticket, guild, config, null, 'auto_close');
            } catch (error) {
                logger.error(`[TICKET_WORKER] Critical failure in job ${job.id}:`, error);
                throw error;
            }
        },
        {
            connection: workerConnection as any,
            prefix: 'aegis-tickets',
            concurrency: 3,
            lockDuration: 60000,
            lockRenewTime: 30000,
            stalledInterval: 60000,
            maxStalledCount: 1,
            removeOnComplete: { count: 0 },
            removeOnFail: { count: 50 }
        }
    );

    worker.on('failed', (job, err) => {
        logger.error(`[TICKET_WORKER] Job ${job?.id} failed: ${err.message}`);
    });

    worker.on('closed', async () => {
        await workerConnection.quit();
        logger.info('[TICKET_WORKER] Redis connection closed');
    });

    return worker;
}
