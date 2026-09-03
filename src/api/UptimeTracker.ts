const DAY_NAMES   = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
const MONTH_NAMES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const INTERVAL_MS = 5 * 60_000;
const MAX_ENTRIES = 30 * 24 * 12; // 30 días a intervalos de 5 min

export interface UptimeBucket {
    label:  string;
    uptime: number;   // 0–100
    checks: number;   // checks reales grabados
}

export interface BotHistory {
    day:   UptimeBucket[];  // 24 buckets de 1h
    week:  UptimeBucket[];  // 7 buckets diarios
    month: UptimeBucket[];  // 30 buckets diarios
}

export class UptimeTracker {
    private checks: number[] = [];
    readonly startedAt: number = Date.now();

    start(): void {
        this.record();
        setInterval(() => this.record(), INTERVAL_MS).unref();
    }

    private record(): void {
        this.checks.push(Date.now());
        if (this.checks.length > MAX_ENTRIES) this.checks.shift();
    }

    getHistory(): BotHistory {
        const now = Date.now();
        return {
            day:   this.hourlyBuckets(now),
            week:  this.dailyBuckets(now, 7),
            month: this.dailyBuckets(now, 30),
        };
    }

    private countInRange(start: number, end: number): number {
        let count = 0;
        for (const ts of this.checks) {
            if (ts >= start && ts < end) count++;
        }
        return count;
    }

    private expectedChecks(bucketStart: number, bucketEnd: number, now: number): number {
        const effectiveStart = Math.max(bucketStart, this.startedAt);
        const effectiveEnd   = Math.min(bucketEnd, now);
        return Math.max(0, Math.floor((effectiveEnd - effectiveStart) / INTERVAL_MS));
    }

    private pct(actual: number, expected: number): number {
        if (expected === 0) return 100;
        return Math.min(100, Math.round((actual / expected) * 1000) / 10);
    }

    private hourlyBuckets(now: number): UptimeBucket[] {
        const buckets: UptimeBucket[] = [];

        for (let i = 23; i >= 0; i--) {
            const bucketEnd   = now - i * 3_600_000;
            const bucketStart = bucketEnd - 3_600_000;
            const expected    = this.expectedChecks(bucketStart, bucketEnd, now);
            const actual      = this.countInRange(bucketStart, bucketEnd);
            const hour        = new Date(bucketStart).getHours();

            buckets.push({
                label:  `${String(hour).padStart(2, '0')}:00`,
                uptime: this.pct(actual, expected),
                checks: actual,
            });
        }

        return buckets;
    }

    private dailyBuckets(now: number, days: number): UptimeBucket[] {
        const buckets: UptimeBucket[] = [];

        const today = new Date(now);
        today.setHours(0, 0, 0, 0);
        const todayMs = today.getTime();

        for (let i = days - 1; i >= 0; i--) {
            const bucketStart = todayMs - i * 86_400_000;
            const bucketEnd   = bucketStart + 86_400_000;
            const expected    = this.expectedChecks(bucketStart, bucketEnd, now);
            const actual      = this.countInRange(bucketStart, bucketEnd);
            const d           = new Date(bucketStart);

            const label = days === 7
                ? (i === 0 ? 'Hoy' : DAY_NAMES[d.getDay()])
                : `${d.getDate()} ${MONTH_NAMES[d.getMonth()]}`;

            buckets.push({
                label,
                uptime: this.pct(actual, expected),
                checks: actual,
            });
        }

        return buckets;
    }
}
