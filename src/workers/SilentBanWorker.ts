import { Worker, type Job } from 'bullmq';
import { container } from '@sapphire/framework';
import { Redis } from 'ioredis';
import { removeSilentBan } from '../services/SilentBanService';


// Silent ban worker ──────────────────

export function setupSilentBanWorker() {
    const { logger, client } = container;

    logger.info('[WORKER] Initialized successfully - Silent Ban System');

    const workerConnection = new Redis({
        ...container.redis?.options,
        maxRetriesPerRequest: null
    });

    // Job handler ──────────

    const worker = new Worker(
        'silentBanQueue',
        async (job: Job) => {
            try {
                switch (job.name) {

                    // Delete message from silentbanned user ──────────

                    case 'message_delete': {
                        const { channelId, messageId, guildId } = job.data;
                        const guild = client.guilds.cache.get(guildId)
                            ?? await client.guilds.fetch(guildId).catch(() => null);
                        if (!guild) return;

                        const channel = guild.channels.cache.get(channelId)
                            ?? await guild.channels.fetch(channelId).catch(() => null);
                        if (!channel || !channel.isTextBased()) return;

                        const message = await channel.messages.fetch(messageId).catch(() => null);
                        if (message?.deletable) {
                            await message.delete().catch((err) =>
                                logger.warn(`[SILENTBAN] Failed to delete message in #${(channel as any).name}: ${err.message}`)
                            );
                            logger.info(`[SILENTBAN] Message deleted from ${message.author?.tag ?? 'unknown'}`);
                        }
                        break;
                    }

                    // Disconnect silentbanned user from voice ──────────

                    case 'voice_disconnect': {
                        const { guildId, userId } = job.data;
                        const guild = client.guilds.cache.get(guildId)
                            ?? await client.guilds.fetch(guildId).catch(() => null);
                        if (!guild) return;

                        const member = await guild.members.fetch(userId).catch(() => null);
                        if (member?.voice.channel) {
                            await member.voice.disconnect('Silent Ban').catch(() => null);
                            logger.info(`[SILENTBAN] ${member.user.tag} disconnected from voice`);
                        }
                        break;
                    }

                    // Remove expired silent ban ──────────

                    case 'expire_ban': {
                        const { guildId, userId } = job.data;
                        await removeSilentBan(guildId, userId);
                        logger.info(`[SILENTBAN] Ban expired for ${userId} in ${guildId}`);
                        break;
                    }

                    default:
                        logger.warn(`[SILENTBAN] Unknown job name: ${job.name}`);
                }
            } catch (err: any) {
                logger.error(`[SILENTBAN-WORKER] Job ${job.id} (${job.name}): ${err.message}`);
                throw err;
            }
        },
        {
            connection: workerConnection as any,
            prefix: 'aegis-silentban',
            concurrency: 5,
            lockDuration: 60000,
            lockRenewTime: 30000,
            removeOnComplete: { count: 100 },
            removeOnFail: { count: 500 }
        }
    );

    // Events ──────────

    worker.on('failed', (job, err) => {
        logger.error(`[SILENTBAN-WORKER] Job ${job?.id} failed: ${err.message}`);
    });

    worker.on('closed', async () => {
        await workerConnection.quit();
        logger.info('[SILENTBAN-WORKER] Redis connection closed');
    });

    return worker;
}
