import { container } from '@sapphire/framework';
import { DiscordAPIError, RESTJSONErrorCodes, type Client, type Guild } from 'discord.js';
import { prisma } from '../database/db';
import { CacheManager } from '../database/CacheManager';
import { getCounterLayout } from '../lib/layouts/counterLayouts';
import {
    collectStats,
    countVoice,
    fetchCounts,
    isCounterChannel,
    statsEqual,
    type CounterChannel,
    type CounterCounts,
    type CounterStats
} from '../lib/utils/counterStats';


// Counter service ──────────────────
//
// One timer drives every guild rather than one timer each: the work per tick is
// small and a single loop keeps the scheduling in one place.
//
// The three numbers move on very different clocks, so they are read on very
// different ones too.
//
// Voice is exact, free and immediate: the gateway pushes every change. It does
// not wait for the timer at all — the voice state listener calls
// notifyVoiceChange and the message is redrawn a moment later, which is what
// keeps "who is in the call" honest.
//
// Online and total are Discord's approximate counts, which Discord itself only
// recomputes every few minutes. Asking for them faster than that buys nothing
// but requests, so they sit on a slow cadence of their own.
//
// The timer is then only a floor: it drives the counts refresh, the rescan, and
// catches any voice change the event path dropped. All of it is cheap only
// because of the comparison below — a guild whose numbers did not move costs
// nothing at all. Editing unconditionally would run straight into the
// per-channel rate limit.

const DEFAULT_INTERVAL_MS = 5_000;
const MIN_INTERVAL_MS = 5_000;

const DEFAULT_COUNTS_INTERVAL_MS = 60_000;
const MIN_COUNTS_INTERVAL_MS = 15_000;

/**
 * How long a voice event waits before redrawing. Long enough to fold a whole
 * call filling up into one edit, short enough that nobody notices the delay —
 * and it keeps the guild well under the per-channel edit limit even if someone
 * sits there joining and leaving.
 */
const VOICE_DEBOUNCE_MS = 1_500;

/** How often the active set is re-read from the database. */
const RESCAN_INTERVAL_MS = 300_000;

interface GuildCounter {
    channel: CounterChannel;
    messageId: string | null;
    lastStats: CounterStats | null;
    /** Last approximate counts from Discord, reused between refreshes. */
    counts: CounterCounts | null;
    /** When the counts are due to be fetched again. */
    nextCountsAt: number;
    /** After a failed update, the guild is skipped until this timestamp. */
    retryAt: number;
    /** In-flight tick. While set, further ticks for this guild are dropped. */
    inFlight: Promise<void> | null;
}

/** A concurrent setChannel while another is half-done. */
export class CounterBusyError extends Error {
    public constructor() {
        super('A counter channel change is already in progress.');
        this.name = 'CounterBusyError';
    }
}

export class CounterService {
    private readonly client: Client;
    private readonly intervalMs: number;
    private readonly countsIntervalMs: number;
    private readonly counters = new Map<string, GuildCounter>();
    private readonly switching = new Set<string>();
    /** Pending debounced redraws, one per guild at most. */
    private readonly voiceTimers = new Map<string, NodeJS.Timeout>();

    private timer: NodeJS.Timeout | null = null;
    private stopped = false;
    private nextRescanAt = 0;

    public constructor(client: Client) {
        this.client = client;
        this.intervalMs = readInterval(process.env.COUNTER_INTERVAL_MS, DEFAULT_INTERVAL_MS, MIN_INTERVAL_MS);

        // Never faster than the render tick: fetching counts the message cannot
        // be redrawn to show would be pure waste.
        this.countsIntervalMs = Math.max(
            readInterval(
                process.env.COUNTER_COUNTS_INTERVAL_MS,
                DEFAULT_COUNTS_INTERVAL_MS,
                MIN_COUNTS_INTERVAL_MS
            ),
            this.intervalMs
        );
    }

    /** Channel the counter is published in for a guild, or null. */
    public channelIdFor(guildId: string): string | null {
        return this.counters.get(guildId)?.channel.id ?? null;
    }


    // Lifecycle ──────────

    /** Restores every configured counter, then starts the loop. */
    public async start(): Promise<void> {
        await this.rescan();
        this.schedule();
        container.logger.info(
            `[COUNTER] Tracking ${this.counters.size} guild(s), refreshing every ${this.intervalMs}ms ` +
                `(member counts every ${this.countsIntervalMs}ms).`
        );
    }

    public async stop(): Promise<void> {
        this.stopped = true;
        if (this.timer !== null) {
            clearInterval(this.timer);
            this.timer = null;
        }

        for (const timer of this.voiceTimers.values()) clearTimeout(timer);
        this.voiceTimers.clear();

        await Promise.all(
            [...this.counters.values()].map((counter) => counter.inFlight?.catch(() => undefined))
        );
    }

    private schedule(): void {
        if (this.stopped || this.timer !== null) return;
        this.timer = setInterval(() => void this.tickAll(), this.intervalMs);
    }


    // Channel management ──────────

    /**
     * Publishes the counter in a channel and starts tracking it there. Deletes
     * the previous message first when moving. The caller is expected to have
     * already rejected the "same channel" case.
     */
    public async setChannel(guild: Guild, channel: CounterChannel): Promise<void> {
        if (this.switching.has(guild.id)) throw new CounterBusyError();
        this.switching.add(guild.id);

        try {
            const existing = this.counters.get(guild.id);
            if (existing) {
                await existing.inFlight?.catch(() => undefined);
                await this.deleteMessage(existing.channel, existing.messageId);
                this.counters.delete(guild.id);
            }

            const stats = await collectStats(guild);
            const message = await channel.send(getCounterLayout(stats));

            this.counters.set(guild.id, {
                channel,
                messageId: message.id,
                lastStats: stats,
                // Just fetched for the first render — no reason to ask again on
                // the next tick.
                counts: { online: stats.online, total: stats.total },
                nextCountsAt: Date.now() + this.countsIntervalMs,
                retryAt: 0,
                inFlight: null
            });

            await this.persist(guild.id, channel.id, message.id);
            container.logger.info(`[COUNTER] Published in #${channel.name} (${guild.id}) — message ${message.id}.`);
        } finally {
            this.switching.delete(guild.id);
        }
    }

    /** Deletes the published message and forgets the guild. Used by module reset. */
    public async remove(guildId: string): Promise<void> {
        const counter = this.counters.get(guildId);
        if (!counter) return;

        const pendingRedraw = this.voiceTimers.get(guildId);
        if (pendingRedraw !== undefined) {
            clearTimeout(pendingRedraw);
            this.voiceTimers.delete(guildId);
        }

        await counter.inFlight?.catch(() => undefined);
        await this.deleteMessage(counter.channel, counter.messageId);
        this.counters.delete(guildId);
    }


    // Voice ──────────

    /**
     * Somebody joined, left or moved between voice channels. Redraws shortly
     * after, rather than at the next tick, so the voice number tracks the call
     * in something close to real time.
     *
     * Debounced per guild: a burst of joins is one edit, not one per person. The
     * redraw still compares before editing, so a move between two channels — no
     * change to the number — costs nothing.
     */
    public notifyVoiceChange(guildId: string): void {
        if (this.stopped || this.voiceTimers.has(guildId)) return;
        if (!this.counters.has(guildId)) return;

        this.voiceTimers.set(
            guildId,
            setTimeout(() => {
                this.voiceTimers.delete(guildId);

                const counter = this.counters.get(guildId);
                if (this.stopped || !counter) return;

                // Busy or backing off. Dropping it is safe: the timer sweeps the
                // guild anyway, so the change lands one tick later at worst.
                if (this.switching.has(guildId) || counter.inFlight !== null) return;
                if (Date.now() < counter.retryAt) return;

                this.runTick(guildId, counter);
            }, VOICE_DEBOUNCE_MS)
        );
    }


    // Loop ──────────

    private async tickAll(): Promise<void> {
        if (this.stopped) return;

        // Picks up guilds that enabled the module after boot, and drops ones
        // whose configuration disappeared.
        if (Date.now() >= this.nextRescanAt) {
            await this.rescan().catch((error) =>
                container.logger.error('[COUNTER] Rescan failed:', error)
            );
        }

        const now = Date.now();

        for (const [guildId, counter] of this.counters) {
            if (this.switching.has(guildId) || counter.inFlight !== null || now < counter.retryAt) continue;
            this.runTick(guildId, counter);
        }
    }

    /**
     * Runs one pass for a guild and holds it in inFlight. The whole pass is held,
     * not just the edit: the counts refresh in front of it is a round trip too,
     * and a slow one must not let the next pass in behind it.
     *
     * The caller is expected to have checked that the guild is free.
     */
    private runTick(guildId: string, counter: GuildCounter): void {
        const pending = this.tickGuild(guildId, counter).catch((error) => {
            // A channel that cannot be written to would otherwise fail once per
            // tick; back off to the slow cadence until it recovers.
            counter.retryAt = Date.now() + this.countsIntervalMs;
            container.logger.error(`[COUNTER] Could not update the counter for ${guildId}:`, error);
        });

        counter.inFlight = pending;
        void pending.finally(() => {
            if (counter.inFlight === pending) counter.inFlight = null;
        });
    }

    private async tickGuild(guildId: string, counter: GuildCounter): Promise<void> {
        // The module can be switched off at any time; Redis is the hot path for
        // that flag, so checking it costs nothing.
        const enabled = await container.redis.get(`counter:module:${guildId}`);
        if (enabled !== 'true') return;

        const guild = this.client.guilds.cache.get(guildId);
        if (!guild) return;

        if (counter.counts === null || Date.now() >= counter.nextCountsAt) {
            // Best effort: a failed refresh keeps the previous counts on screen
            // and leaves voice live, which beats blanking the message.
            try {
                counter.counts = await fetchCounts(guild);
            } catch (error) {
                container.logger.error(`[COUNTER] Could not refresh the counts for ${guildId}:`, error);
            }

            counter.nextCountsAt = Date.now() + this.countsIntervalMs;
        }

        // Nothing to render yet — the very first refresh failed.
        if (counter.counts === null) return;

        const stats: CounterStats = { ...counter.counts, voice: countVoice(guild) };

        // Nothing moved — skip the edit entirely.
        if (counter.lastStats !== null && statsEqual(counter.lastStats, stats)) return;

        await this.update(counter, stats);
        // Only committed on success, so a failure retries on a later tick.
        counter.lastStats = stats;
    }

    private async update(counter: GuildCounter, stats: CounterStats): Promise<void> {
        const layout = getCounterLayout(stats);

        if (counter.messageId === null) {
            const message = await counter.channel.send(layout);
            counter.messageId = message.id;
            await this.persist(counter.channel.guildId, counter.channel.id, message.id);
            return;
        }

        try {
            await counter.channel.messages.edit(counter.messageId, layout);
        } catch (error) {
            if (error instanceof DiscordAPIError && error.code === RESTJSONErrorCodes.UnknownMessage) {
                container.logger.warn('[COUNTER] Message was deleted; republishing.');
                const message = await counter.channel.send(layout);
                counter.messageId = message.id;
                await this.persist(counter.channel.guildId, counter.channel.id, message.id);
                return;
            }

            throw error;
        }
    }


    // State ──────────

    /** Loads every guild with the module configured, reusing its message when still there. */
    private async rescan(): Promise<void> {
        // Set up front so a failure does not retry on every tick.
        this.nextRescanAt = Date.now() + RESCAN_INTERVAL_MS;

        const configs = await prisma.guildConfig.findMany({
            where: { counterModule: true, NOT: { counterChannelId: null } }
        });

        const seen = new Set<string>();

        for (const config of configs) {
            if (config.counterChannelId === null) continue;
            seen.add(config.guildId);

            // Already tracked in the right place — leave it alone.
            const existing = this.counters.get(config.guildId);
            if (existing && existing.channel.id === config.counterChannelId) continue;

            const guild = this.client.guilds.cache.get(config.guildId);
            if (!guild) continue;

            const channel = await guild.channels.fetch(config.counterChannelId).catch(() => null);
            if (!isCounterChannel(channel)) {
                container.logger.warn(
                    `[COUNTER] Configured channel ${config.counterChannelId} for ${config.guildId} is gone; clearing.`
                );
                await this.persist(config.guildId, null, null);
                this.counters.delete(config.guildId);
                continue;
            }

            this.counters.set(config.guildId, {
                channel,
                messageId: config.counterMessageId,
                lastStats: null,
                counts: null,
                nextCountsAt: 0,
                retryAt: 0,
                inFlight: null
            });
        }

        // Guilds that were turned off or reset while we were running.
        for (const guildId of [...this.counters.keys()]) {
            if (!seen.has(guildId)) this.counters.delete(guildId);
        }
    }

    /**
     * Upsert, not update: setup publishes the message before the config row is
     * written, so the row may not exist yet the first time round.
     */
    private async persist(guildId: string, channelId: string | null, messageId: string | null): Promise<void> {
        const data = { counterChannelId: channelId, counterMessageId: messageId };
        const updated = await prisma.guildConfig.upsert({
            where: { guildId },
            create: { guildId, ...data },
            update: data
        });
        await CacheManager.syncGuild(guildId, updated);
    }

    /** Best effort: a failed delete should not block a channel change. */
    private async deleteMessage(channel: CounterChannel, messageId: string | null): Promise<void> {
        if (messageId === null) return;

        try {
            await channel.messages.delete(messageId);
        } catch (error) {
            if (error instanceof DiscordAPIError && error.code === RESTJSONErrorCodes.UnknownMessage) return;
            container.logger.warn('[COUNTER] Could not delete the previous message:', error);
        }
    }
}

/** Env overrides are only honoured above their floor; anything else falls back. */
function readInterval(raw: string | undefined, fallback: number, minimum: number): number {
    const parsed = Number(raw);
    return Number.isFinite(parsed) && parsed >= minimum ? parsed : fallback;
}
