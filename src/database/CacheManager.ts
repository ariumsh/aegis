import { container } from '@sapphire/framework';
import type { BotCommander, GuildConfig, ModPermission } from '@prisma/client';
import { DEFAULT_PREFIX } from '../lib/constants/bot';


// Cache manager ──────────────────

export class CacheManager {

    // Syncs all guild config fields to Redis ──────────

    public static async syncGuild(guildId: string, config: GuildConfig) {
        const { redis, logger } = container;
        const pipeline = redis.pipeline();

        try {

            // Vanity module ──────────

            if (config.vanityString) pipeline.set(`vanity:string:${guildId}`, config.vanityString);
            else pipeline.del(`vanity:string:${guildId}`);

            if (config.vanityRoleId) pipeline.set(`vanity:role:${guildId}`, config.vanityRoleId);
            else pipeline.del(`vanity:role:${guildId}`);

            if (config.vanityChannelId) pipeline.set(`vanity:channel:${guildId}`, config.vanityChannelId);
            else pipeline.del(`vanity:channel:${guildId}`);

            pipeline.set(`vanity:module:${guildId}`, String(config.vanityModule));


            // Mod module ──────────

            if (config.modLogChannelId) pipeline.set(`mod:log_channel:${guildId}`, config.modLogChannelId);
            else pipeline.del(`mod:log_channel:${guildId}`);

            if (config.mutedRoleId) pipeline.set(`mod:muted_role:${guildId}`, config.mutedRoleId);
            else pipeline.del(`mod:muted_role:${guildId}`);

            pipeline.set(`mod:module:${guildId}`, String(config.modModule));
            pipeline.set(`mod:thresholds_enabled:${guildId}`, String(config.modThresholdsEnabled));
            pipeline.set(`mod:mute_threshold:${guildId}`, String(config.muteThreshold));
            pipeline.set(`mod:ban_threshold:${guildId}`, String(config.banThreshold));
            pipeline.set(`mod:warn_expiration_days:${guildId}`, String(config.warnExpirationDays));
            pipeline.set(`mod:threshold_mode:${guildId}`, config.thresholdMode);


            // Counter module ──────────

            if ((config as any).counterChannelId) pipeline.set(`counter:channel:${guildId}`, (config as any).counterChannelId);
            else pipeline.del(`counter:channel:${guildId}`);

            if ((config as any).counterMessageId) pipeline.set(`counter:message:${guildId}`, (config as any).counterMessageId);
            else pipeline.del(`counter:message:${guildId}`);

            pipeline.set(`counter:module:${guildId}`, String((config as any).counterModule));


            // Tickets module ──────────

            if ((config as any).ticketsPanelChannelId) pipeline.set(`tickets:panel_channel:${guildId}`, (config as any).ticketsPanelChannelId);
            else pipeline.del(`tickets:panel_channel:${guildId}`);

            if ((config as any).ticketsCategoryId) pipeline.set(`tickets:category:${guildId}`, (config as any).ticketsCategoryId);
            else pipeline.del(`tickets:category:${guildId}`);

            if ((config as any).ticketsTranscriptChannelId) pipeline.set(`tickets:transcript_channel:${guildId}`, (config as any).ticketsTranscriptChannelId);
            else pipeline.del(`tickets:transcript_channel:${guildId}`);

            if ((config as any).ticketsLogChannelId) pipeline.set(`tickets:log_channel:${guildId}`, (config as any).ticketsLogChannelId);
            else pipeline.del(`tickets:log_channel:${guildId}`);

            if ((config as any).ticketsSupporterRoleIds?.length) pipeline.set(`tickets:supporter_roles:${guildId}`, JSON.stringify((config as any).ticketsSupporterRoleIds));
            else pipeline.del(`tickets:supporter_roles:${guildId}`);

            if ((config as any).ticketsPanelMessageId) pipeline.set(`tickets:panel_message:${guildId}`, (config as any).ticketsPanelMessageId);
            else pipeline.del(`tickets:panel_message:${guildId}`);

            pipeline.set(`tickets:module:${guildId}`, String((config as any).ticketsModule));


            // General ──────────

            pipeline.set(`general:locale:${guildId}`, (config as any).locale);
            pipeline.set(`general:prefix:${guildId}`, (config as any).prefix);

            if (config.mentionResponse) pipeline.set(`general:mention_response:${guildId}`, config.mentionResponse);
            else pipeline.del(`general:mention_response:${guildId}`);

            await pipeline.exec();
        } catch (error) {
            logger.error(`[CACHE_MANAGER] Failed to sync guild ${guildId}:`, error);
        }
    }


    // Returns the cached mod config for a guild ──────────

    public static async getModConfig(guildId: string) {
        const { redis } = container;
        const [logChannel, modModule, thresholdsEnabled, muteThreshold, banThreshold, mutedRole, expirationDays, thresholdMode] = await redis.mget(
            `mod:log_channel:${guildId}`,
            `mod:module:${guildId}`,
            `mod:thresholds_enabled:${guildId}`,
            `mod:mute_threshold:${guildId}`,
            `mod:ban_threshold:${guildId}`,
            `mod:muted_role:${guildId}`,
            `mod:warn_expiration_days:${guildId}`,
            `mod:threshold_mode:${guildId}`
        );

        return {
            modLogChannelId:      logChannel ?? null,
            modModule:            modModule === 'true',
            modThresholdsEnabled: thresholdsEnabled === 'true',
            muteThreshold:        muteThreshold  ? parseInt(muteThreshold)  : 3,
            banThreshold:         banThreshold   ? parseInt(banThreshold)   : 5,
            mutedRoleId:          mutedRole ?? null,
            warnExpirationDays:   expirationDays ? parseInt(expirationDays) : 0,
            thresholdMode:        thresholdMode ?? 'modular'
        };
    }


    public static async getLocale(guildId: string) {
        const { redis } = container;
        const locale = await redis.get(`general:locale:${guildId}`);
        return locale ?? 'en-US';
    }


    public static async getPrefix(guildId: string) {
        const { redis } = container;
        const prefix = await redis.get(`general:prefix:${guildId}`);
        return prefix ?? process.env.PREFIX ?? DEFAULT_PREFIX;
    }


    public static async getMentionResponse(guildId: string): Promise<string | null> {
        const { redis } = container;
        return redis.get(`general:mention_response:${guildId}`);
    }


    // Mod Permissions ──────────

    /**
     * Returns all ModPermission rows for a guild.
     * Redis key: mod:perms:<guildId> — JSON array, TTL 5 minutes.
     * Always checks cache first before hitting Prisma.
     */
    public static async getModPermissions(guildId: string): Promise<ModPermission[]> {
        const { redis } = container;
        const cached = await redis.get(`mod:perms:${guildId}`);
        if (cached) return JSON.parse(cached);
        const perms = await container.db.modPermission.findMany({ where: { guildId } });
        await redis.set(`mod:perms:${guildId}`, JSON.stringify(perms), 'EX', 300);
        return perms;
    }

    /**
     * Invalidates the mod permissions cache for a guild.
     * Must be called after any upsert/delete on ModPermission.
     */
    public static async invalidateModPermissions(guildId: string): Promise<void> {
        const { redis } = container;
        await redis.del(`mod:perms:${guildId}`);
    }


    // Bot Commanders ──────────

    /**
     * Returns all BotCommander rows for a guild.
     * Redis key: bot:commanders:<guildId> — JSON array, TTL 5 minutes.
     * Always checks cache first before hitting Prisma.
     */
    public static async getBotCommanders(guildId: string): Promise<BotCommander[]> {
        const { redis } = container;
        const cached = await redis.get(`bot:commanders:${guildId}`);
        if (cached) return JSON.parse(cached);
        const commanders = await container.db.botCommander.findMany({ where: { guildId } });
        await redis.set(`bot:commanders:${guildId}`, JSON.stringify(commanders), 'EX', 300);
        return commanders;
    }

    /**
     * Invalidates the bot commanders cache for a guild.
     * Must be called after any upsert/delete on BotCommander.
     */
    public static async invalidateBotCommanders(guildId: string): Promise<void> {
        const { redis } = container;
        await redis.del(`bot:commanders:${guildId}`);
    }


    // Deletes all cached keys for a guild ──────────

    public static async clearGuild(guildId: string) {
        await deleteMatching(`*:${guildId}`);
    }
}

/**
 * Deletes every key matching a pattern, cursor by cursor.
 *
 * KEYS walks the entire keyspace in one blocking call, and this Redis instance
 * is both the read path for all guild configuration and the transport for
 * BullMQ. A module reset on a busy instance would stall the whole bot. SCAN
 * gives the server room to breathe between batches.
 */
export async function deleteMatching(pattern: string): Promise<number> {
    const { redis } = container;
    let cursor = '0';
    let removed = 0;

    do {
        const [next, keys] = await redis.scan(cursor, 'MATCH', pattern, 'COUNT', 100);
        cursor = next;
        if (keys.length > 0) {
            await redis.del(...keys);
            removed += keys.length;
        }
    } while (cursor !== '0');

    return removed;
}
