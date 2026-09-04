import { container } from '@sapphire/framework';

// Uptime tracking ──────────────────
//
// The previous implementation kept its heartbeats in a plain array on the
// instance. That made the number it reported meaningless in the specific case it
// existed to report: a restart cleared the history and reset the start time, so
// downtime never appeared, and the figure was ~100% for as long as the process
// happened to have been alive. It could not describe an outage, which is the
// only interesting thing an uptime series has to say.
//
// Heartbeats now go to Redis, which survives the restart the process does not.
// Missing heartbeats in a window are what downtime looks like, and they are only
// missing if the bot was genuinely not running to write them.

const INTERVAL_MS = 5 * 60_000;
const RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

/** Sorted set of heartbeat timestamps, scored by the timestamp itself. */
const KEY = 'uptime:heartbeats';

export interface UptimeBucket {
    /** Start of the bucket, ISO 8601. */
    start: string;
    /** End of the bucket, exclusive, ISO 8601. */
    end: string;
    /** 0-100, or null where the window predates the first recorded heartbeat. */
    uptime: number | null;
    observed: number;
    expected: number;
}

export interface BotHistory {
    intervalMs: number;
    /** 24 hourly buckets. */
    day: UptimeBucket[];
    /** 7 daily buckets. */
    week: UptimeBucket[];
    /** 30 daily buckets. */
    month: UptimeBucket[];
}

export class UptimeTracker {
    private timer: NodeJS.Timeout | null = null;

    start(): void {
        void this.record();
        this.timer = setInterval(() => void this.record(), INTERVAL_MS);
        this.timer.unref();
    }

    stop(): void {
        if (this.timer !== null) {
            clearInterval(this.timer);
            this.timer = null;
        }
    }

    private async record(): Promise<void> {
        const now = Date.now();

        try {
            await container.redis
                .multi()
                .zadd(KEY, now, String(now))
                // Trimmed on write rather than by a TTL on the key: a TTL would
                // drop the whole series at once, and the series is the point.
                .zremrangebyscore(KEY, '-inf', now - RETENTION_MS)
                .exec();
        } catch (error) {
            // A missed heartbeat is indistinguishable from downtime, which is
            // honest enough — the bot could not reach Redis, so it was not
            // fully up. Logged rather than retried.
            container.logger.warn(`[UPTIME] Could not record heartbeat: ${(error as Error).message}`);
        }
    }

    /** Heartbeat timestamps within a window, oldest first. */
    private async heartbeatsBetween(from: number, to: number): Promise<number[]> {
        const raw = await container.redis.zrangebyscore(KEY, from, `(${to}`);
        return raw.map(Number);
    }

    /** Timestamp of the first heartbeat ever recorded, or null when there are none. */
    private async firstHeartbeat(): Promise<number | null> {
        const [first] = await container.redis.zrange(KEY, 0, 0);
        return first === undefined ? null : Number(first);
    }

    async getHistory(): Promise<BotHistory> {
        const now = Date.now();

        try {
            const since = await this.firstHeartbeat();
            const all = await this.heartbeatsBetween(now - RETENTION_MS, now + 1);

            return {
                intervalMs: INTERVAL_MS,
                day: this.bucket(all, since, now, 24, 3_600_000),
                week: this.bucket(all, since, now, 7, 86_400_000),
                month: this.bucket(all, since, now, 30, 86_400_000)
            };
        } catch (error) {
            container.logger.error('[UPTIME] Could not read history:', error);
            return { intervalMs: INTERVAL_MS, day: [], week: [], month: [] };
        }
    }

    /**
     * Splits the heartbeats into `count` buckets of `sizeMs`, ending now.
     *
     * A bucket entirely before the first heartbeat reports null rather than 0.
     * Zero would claim the bot was down; null says correctly that nothing is
     * known about that window, which is what a fresh deployment looks like.
     */
    private bucket(
        heartbeats: number[],
        since: number | null,
        now: number,
        count: number,
        sizeMs: number
    ): UptimeBucket[] {
        const buckets: UptimeBucket[] = [];

        for (let i = count - 1; i >= 0; i--) {
            const end = now - i * sizeMs;
            const start = end - sizeMs;

            const observed = heartbeats.filter((t) => t >= start && t < end).length;

            // Only the part of the window the bot could have been running for.
            const effectiveStart = since === null ? end : Math.max(start, since);
            const effectiveEnd = Math.min(end, now);
            const expected = Math.max(0, Math.floor((effectiveEnd - effectiveStart) / INTERVAL_MS));

            buckets.push({
                start: new Date(start).toISOString(),
                end: new Date(end).toISOString(),
                uptime: expected === 0 ? null : Math.min(100, Math.round((observed / expected) * 1000) / 10),
                observed,
                expected
            });
        }

        return buckets;
    }
}
