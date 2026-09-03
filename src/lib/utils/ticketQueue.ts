import { Queue } from 'bullmq';
import { Redis } from 'ioredis';
import { container } from '@sapphire/framework';


// Ticket auto-close queue ──────────────────

export interface AutoCloseJobData {
    guildId: string;
    ticketId: number;
    channelId: string;
    userId: string;
}

let _ticketQueue: Queue | null = null;


export function getTicketQueue(): Queue {
    if (!_ticketQueue) {
        const conn = new Redis({
            ...(container.redis as any)?.options,
            maxRetriesPerRequest: null
        });
        _ticketQueue = new Queue('tickets-autoclose', {
            connection: conn as any,
            prefix: 'aegis-tickets'
        });
    }
    return _ticketQueue;
}


export async function scheduleAutoClose(data: AutoCloseJobData, delayMs: number): Promise<string> {
    const queue = getTicketQueue();
    const job = await queue.add('auto-close', data, {
        delay: delayMs,
        removeOnComplete: true,
        removeOnFail: { count: 5 }
    });
    return job.id!;
}


export async function cancelAutoClose(jobId: string): Promise<void> {
    const queue = getTicketQueue();
    const job = await queue.getJob(jobId);
    if (job) await job.remove();
}
