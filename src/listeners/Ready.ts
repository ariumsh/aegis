import { Listener } from '@sapphire/framework';
import { ActivityType, Events } from 'discord.js';
import { prisma } from '../database/db';
import { CacheManager } from '../database/CacheManager';


// Ready listener ──────────────────

export class ReadyListener extends Listener {
    public constructor(context: Listener.LoaderContext, options: Listener.Options) {
        super(context, {
            ...options,
            once: true,
            event: Events.ClientReady
        });
    }

    public async run() {
        const { container } = this;

        // Warm up Redis cache ──────────────────

        try {
            const configs = await prisma.guildConfig.findMany();

            if (configs.length === 0) {
                container.logger.info('[SYNC] No configurations found in database to cache.');
            } else {
                await Promise.all(configs.map((config) => CacheManager.syncGuild(config.guildId, config)));
                container.logger.info(`📊 [REDIS] Redis cache warmed up with ${configs.length} configs.`);
            }
        } catch (error) {
            container.logger.error('[SYNC] Failed to warm up Redis cache:', error);
        }

        // Start the member counter ──────────
        // After the cache warm-up: the service reads guild config straight from
        // PostgreSQL but relies on the Redis module flag on every tick.

        try {
            await container.counterService.start();
        } catch (error) {
            container.logger.error('[COUNTER] Failed to start:', error);
        }

        // Debug loaded commands ──────────
        const commands = container.stores.get('commands');
        container.logger.info(`🚀 [LOADER] Loaded ${commands.size} commands.`);
        container.logger.info(`📌 [CONFIG] Default Prefix: ${this.container.client.options.defaultPrefix}`);
        for (const [name, command] of commands) {
            const hasMessageRun = command.messageRun !== undefined;
            container.logger.info(`   - ${name} [Slash: ${command.chatInputRun !== undefined}, Prefix: ${hasMessageRun}]`);
        }
    }
}
