import { Worker, type Job } from 'bullmq';
import { Redis } from 'ioredis';
import { container } from '@sapphire/framework';
import { prisma } from '../database/db';
import { CacheManager } from '../database/CacheManager';
import {
    SANCTION_QUEUE,
    SANCTION_QUEUE_PREFIX,
    type SanctionExpiryJob
} from '../services/SanctionExpiryService';

// Sanction expiry worker ──────────────────
//
// Replaces the two setInterval sweeps this used to run on. Each job lifts one
// sanction at the moment it is due, and BullMQ guarantees exactly one consumer
// takes it — so running several instances is now safe, which it was not before.

/**
 * Lifts a mute. Removes the timeout and, when the guild uses a muted role, the
 * role as well: /mute grants a role while /timeout uses Discord's own timeout,
 * and both write the same ActiveMute row, so lifting has to undo either.
 */
async function liftMute(guildId: string, userId: string): Promise<void> {
    const { client, logger } = container;

    const guild = client.guilds.cache.get(guildId) ?? (await client.guilds.fetch(guildId).catch(() => null));

    if (!guild) {
        // The bot is no longer in the guild, so there is nothing to lift and the
        // row is unreachable state. Dropping it is the correct outcome.
        logger.warn(`[SANCTION_EXPIRY] Guild ${guildId} unavailable; dropping mute record for ${userId}.`);
        await prisma.activeMute.deleteMany({ where: { guildId, userId } });
        return;
    }

    const member = await guild.members.fetch(userId).catch(() => null);

    if (member) {
        if (member.isCommunicationDisabled()) {
            await member
                .timeout(null, 'Mute expired')
                .catch((error) =>
                    logger.warn(`[SANCTION_EXPIRY] Could not lift timeout for ${userId} in ${guildId}: ${error.message}`)
                );
        }

        const { mutedRoleId } = await CacheManager.getModConfig(guildId);
        if (mutedRoleId && member.roles.cache.has(mutedRoleId)) {
            await member.roles
                .remove(mutedRoleId, 'Mute expired')
                .catch((error) =>
                    logger.warn(`[SANCTION_EXPIRY] Could not remove muted role for ${userId} in ${guildId}: ${error.message}`)
                );
        }

        logger.info(`[SANCTION_EXPIRY] Mute lifted for ${member.user.tag} in ${guild.name}.`);
    }

    await prisma.activeMute.deleteMany({ where: { guildId, userId } });
}

async function liftBan(guildId: string, userId: string): Promise<void> {
    const { client, logger } = container;

    const guild = client.guilds.cache.get(guildId) ?? (await client.guilds.fetch(guildId).catch(() => null));

    if (!guild) {
        logger.warn(`[SANCTION_EXPIRY] Guild ${guildId} unavailable; dropping tempban record for ${userId}.`);
        await prisma.activeTempBan.deleteMany({ where: { guildId, userId } });
        return;
    }

    await guild.bans
        .remove(userId, 'Tempban expired')
        .catch((error) =>
            // Unknown Ban simply means somebody unbanned them first, which is a
            // normal outcome rather than a failure.
            logger.warn(`[SANCTION_EXPIRY] Could not unban ${userId} in ${guildId}: ${error.message}`)
        );

    logger.info(`[SANCTION_EXPIRY] Tempban lifted for ${userId} in ${guild.name}.`);
    await prisma.activeTempBan.deleteMany({ where: { guildId, userId } });
}

export function setupSanctionExpiryWorker() {
    const { logger } = container;

    const connection = new Redis({
        ...container.redis?.options,
        maxRetriesPerRequest: null
    });

    const worker = new Worker<SanctionExpiryJob>(
        SANCTION_QUEUE,
        async (job: Job<SanctionExpiryJob>) => {
            const { kind, guildId, userId } = job.data;

            // The database is authoritative. A job can outlive the sanction it
            // was scheduled for — an early /unmute, or a reconciliation pass
            // that re-queued something already handled — and acting on a row
            // that is gone would lift a sanction somebody has since re-applied.
            if (kind === 'unmute') {
                const active = await prisma.activeMute.findFirst({ where: { guildId, userId } });
                if (!active) return;
                await liftMute(guildId, userId);
                return;
            }

            const active = await prisma.activeTempBan.findFirst({ where: { guildId, userId } });
            if (!active) return;
            await liftBan(guildId, userId);
        },
        {
            connection: connection as never,
            prefix: SANCTION_QUEUE_PREFIX,
            concurrency: 5,
            lockDuration: 60_000,
            lockRenewTime: 30_000,
            removeOnComplete: { count: 0 },
            removeOnFail: { count: 100 }
        }
    );

    worker.on('failed', (job, error) => {
        logger.error(`[SANCTION_EXPIRY] Job ${job?.id} failed: ${error.message}`);
    });

    worker.on('closed', async () => {
        await connection.quit();
        logger.info('[SANCTION_EXPIRY] Redis connection closed.');
    });

    logger.info('[WORKER] Initialized successfully - Sanction Expiry');

    return worker;
}
