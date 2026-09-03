import { ChannelType, type Guild, type GuildBasedChannel, type NewsChannel, type TextChannel } from 'discord.js';

// Counter stats ──────────────────

/** The two numbers that come from Discord's approximate counts. */
export interface CounterCounts {
    /** Members not shown as offline. */
    readonly online: number;
    /** Every member of the guild. */
    readonly total: number;
}

export interface CounterStats extends CounterCounts {
    /** Members sitting in any voice channel. */
    readonly voice: number;
}

/**
 * Where the counter message lives. Only a destination — it never filters a count.
 * Restricted to text and announcement channels because those are the only ones
 * where sending and then editing a persistent message makes sense.
 */
export type CounterChannel = TextChannel | NewsChannel;

export function isCounterChannel(channel: GuildBasedChannel | null): channel is CounterChannel {
    return (
        channel !== null &&
        (channel.type === ChannelType.GuildText || channel.type === ChannelType.GuildAnnouncement)
    );
}


// Collection ──────────────────

/**
 * Online and total come from Discord's approximate counts, which arrive with a
 * plain guild fetch and cost one request. Counting presences out of the member
 * cache would be exact, but it needs every member of the guild resident in
 * memory — untenable past a few thousand members.
 *
 * Discord caches these two numbers for minutes at a time, so asking for them
 * more often than that buys nothing but requests. That is why they are on their
 * own cadence, separate from the tick that renders the message.
 */
export async function fetchCounts(guild: Guild): Promise<CounterCounts> {
    const fetched = await guild.client.guilds.fetch({
        guild: guild.id,
        withCounts: true,
        force: true
    });

    return {
        // Fall back to what we already know rather than reporting zero when
        // Discord omits the counts.
        online: fetched.approximatePresenceCount ?? 0,
        total: fetched.approximateMemberCount ?? guild.memberCount
    };
}

/**
 * Voice is the opposite case: the gateway keeps voice states current on its own,
 * so this is exact, free and immediate — no request, no staleness. It is what
 * lets the message follow voice at a cadence the approximate counts could never
 * justify.
 */
export function countVoice(guild: Guild): number {
    let voice = 0;
    for (const state of guild.voiceStates.cache.values()) {
        if (state.channelId !== null) voice += 1;
    }

    return voice;
}

/** Both halves at once. For the first render, where nothing is known yet. */
export async function collectStats(guild: Guild): Promise<CounterStats> {
    const counts = await fetchCounts(guild);
    return { ...counts, voice: countVoice(guild) };
}

export function statsEqual(a: CounterStats, b: CounterStats): boolean {
    return a.online === b.online && a.total === b.total && a.voice === b.voice;
}
