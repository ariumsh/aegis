import { container } from '@sapphire/framework';
import { prisma } from '../database/db';


// Constants ──────────────────

const INTERVAL_MS = 60_000;


// Mute worker ──────────────────

export function setupMuteWorker() {
    const { logger, client } = container;

    logger.info('[WORKER] Initialized successfully - Mute System');

    // Tick: lifts all expired mutes ──────────

    const tick = async () => {
        try {
            const expiredMutes = await prisma.activeMute.findMany({
                where: {
                    expiresAt: {
                        lte: new Date(),
                        not: null,
                    }
                }
            });

            if (expiredMutes.length === 0) return;

            logger.info(`[MUTE-WORKER] Found ${expiredMutes.length} expired mute(s) to lift`);

            for (const mute of expiredMutes) {
                try {
                    const guild = client.guilds.cache.get(mute.guildId)
                        ?? await client.guilds.fetch(mute.guildId).catch(() => null);

                    if (!guild) {
                        logger.warn(`[MUTE-WORKER] Guild ${mute.guildId} not found, removing mute record`);
                        await prisma.activeMute.delete({ where: { id: mute.id } });
                        continue;
                    }

                    const member = await guild.members.fetch(mute.userId).catch(() => null);

                    if (member) {
                        await member.timeout(null, 'Mute expired').catch((err) =>
                            logger.warn(`[MUTE-WORKER] Failed to lift timeout for ${mute.userId}: ${err.message}`)
                        );
                        logger.info(`[MUTE-WORKER] Lifted mute for ${member.user.tag} in ${guild.name}`);
                    } else {
                        logger.info(`[MUTE-WORKER] Member ${mute.userId} not in guild, removing record`);
                    }

                    await prisma.activeMute.delete({ where: { id: mute.id } });
                } catch (err: any) {
                    logger.error(`[MUTE-WORKER] Error processing mute ${mute.userId} in ${mute.guildId}: ${err.message}`);
                }
            }
        } catch (err: any) {
            logger.error(`[MUTE-WORKER] Tick error: ${err.message}`);
        }
    };

    const interval = setInterval(tick, INTERVAL_MS);
    tick();

    logger.info(`[MUTE-WORKER] Running, checking every ${INTERVAL_MS / 1000}s`);

    return {
        stop: () => {
            clearInterval(interval);
            logger.info('[MUTE-WORKER] Stopped');
        }
    };
}
