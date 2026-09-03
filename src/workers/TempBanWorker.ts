import { container } from '@sapphire/framework';
import { prisma } from '../database/db';

const INTERVAL_MS = 60_000;

export function setupTempBanWorker() {
    const { logger, client } = container;

    logger.info('[WORKER] Initialized successfully - TempBan System');

    const tick = async () => {
        try {
            const expiredBans = await prisma.activeTempBan.findMany({
                where: {
                    expiresAt: {
                        lte: new Date(),
                    }
                }
            });

            if (expiredBans.length === 0) return;

            logger.info(`[TEMPBAN-WORKER] Found ${expiredBans.length} expired ban(s) to lift`);

            for (const ban of expiredBans) {
                try {
                    const guild = client.guilds.cache.get(ban.guildId)
                        ?? await client.guilds.fetch(ban.guildId).catch(() => null);

                    if (!guild) {
                        logger.warn(`[TEMPBAN-WORKER] Guild ${ban.guildId} not found, removing ban record`);
                        await prisma.activeTempBan.delete({ where: { id: ban.id } });
                        continue;
                    }

                    await guild.bans.remove(ban.userId, 'Tempban expired').catch((err) =>
                        logger.warn(`[TEMPBAN-WORKER] Failed to unban ${ban.userId} in ${guild.id}: ${err.message}`)
                    );

                    logger.info(`[TEMPBAN-WORKER] Unbanned ${ban.userId} in ${guild.name}`);
                    await prisma.activeTempBan.delete({ where: { id: ban.id } });
                } catch (err: any) {
                    logger.error(`[TEMPBAN-WORKER] Error processing unban for ${ban.userId} in ${ban.guildId}: ${err.message}`);
                }
            }
        } catch (err: any) {
            logger.error(`[TEMPBAN-WORKER] Tick error: ${err.message}`);
        }
    };

    const interval = setInterval(tick, INTERVAL_MS);
    tick();

    logger.info(`[TEMPBAN-WORKER] Running, checking every ${INTERVAL_MS / 1000}s`);

    return {
        stop: () => {
            clearInterval(interval);
            logger.info('[TEMPBAN-WORKER] Stopped');
        }
    };
}
