import { Queue } from 'bullmq';
import { redis } from '../../database/Redis';


// Silent ban queue ──────────────────

export interface SilentBanJobData {
    guildId: string;
    userId?: string;
    channelId?: string;
    messageId?: string;
}

export const silentBanQueue = new Queue<SilentBanJobData>('silentBanQueue', {
    connection: redis as any,
    prefix: 'aegis-silentban',
    defaultJobOptions: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 1000 },
        removeOnComplete: true,
        removeOnFail: true,
    }
});