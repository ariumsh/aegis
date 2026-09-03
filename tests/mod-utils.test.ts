import { describe, expect, it } from 'vitest';
import { formatSeconds, parseDuration, parseSlowmode } from '../src/lib/utils/ModUtils';

/**
 * Characterisation tests for the duration parsers.
 *
 * These decide how long a mute, tempban or slowmode actually lasts, they take
 * free text straight from a moderator, and they had no coverage at all. The
 * point here is to pin the current behaviour — including the parts that are
 * merely accepted rather than designed — so a later refactor cannot change it
 * silently.
 */

describe('parseDuration', () => {
    it('parses each unit on its own', () => {
        expect(parseDuration('30m')?.ms).toBe(30 * 60_000);
        expect(parseDuration('2h')?.ms).toBe(2 * 3_600_000);
        expect(parseDuration('1d')?.ms).toBe(86_400_000);
    });

    it('parses combined units', () => {
        expect(parseDuration('1d2h30m')?.ms).toBe(86_400_000 + 2 * 3_600_000 + 30 * 60_000);
    });

    it('formats only the units that are present', () => {
        expect(parseDuration('1d2h30m')?.formatted).toBe('1d 2h 30m');
        expect(parseDuration('45m')?.formatted).toBe('45m');
        expect(parseDuration('2h')?.formatted).toBe('2h');
    });

    it('returns an expiry in the future', () => {
        const parsed = parseDuration('1h');
        expect(parsed).not.toBeNull();
        expect(parsed!.expiresAt.getTime()).toBeGreaterThan(Date.now());
    });

    it('is case insensitive and tolerates surrounding whitespace', () => {
        expect(parseDuration('  1D2H  ')?.ms).toBe(86_400_000 + 2 * 3_600_000);
    });

    it('rejects input that does not describe a duration', () => {
        expect(parseDuration('')).toBeNull();
        expect(parseDuration('forever')).toBeNull();
        expect(parseDuration('0m')).toBeNull();       // parses, but to zero
        expect(parseDuration('1w')).toBeNull();       // weeks are not a unit
        expect(parseDuration('-1h')).toBeNull();
        expect(parseDuration('1h30')).toBeNull();     // trailing number, no unit
    });

    it('requires units in descending order', () => {
        // Documenting a real constraint of the pattern rather than endorsing it:
        // "30m1h" is rejected even though a reader would understand it.
        expect(parseDuration('30m1h')).toBeNull();
    });
});

describe('parseSlowmode', () => {
    it('treats a bare number as seconds', () => {
        expect(parseSlowmode('30')).toBe(30);
    });

    it('accepts explicit units', () => {
        expect(parseSlowmode('45s')).toBe(45);
        expect(parseSlowmode('5m')).toBe(300);
        expect(parseSlowmode('2h')).toBe(7200);
    });

    it('accepts both ways of switching slowmode off', () => {
        expect(parseSlowmode('0')).toBe(0);
        expect(parseSlowmode('off')).toBe(0);
        expect(parseSlowmode('OFF')).toBe(0);
    });

    it('rejects anything else', () => {
        expect(parseSlowmode('')).toBeNull();
        expect(parseSlowmode('abc')).toBeNull();
        expect(parseSlowmode('5d')).toBeNull();       // days are not a unit here
        expect(parseSlowmode('-5')).toBeNull();
    });

    it('does not cap the value itself', () => {
        // Discord's ceiling is 21600s; the clamp lives in the command, not here.
        // Pinned so moving it does not go unnoticed.
        expect(parseSlowmode('99h')).toBe(356_400);
    });
});

describe('formatSeconds', () => {
    it('renders zero explicitly', () => {
        expect(formatSeconds(0)).toBe('0s');
    });

    it('omits empty units', () => {
        expect(formatSeconds(45)).toBe('45s');
        expect(formatSeconds(300)).toBe('5m');
        expect(formatSeconds(3600)).toBe('1h');
        expect(formatSeconds(3661)).toBe('1h 1m 1s');
        expect(formatSeconds(3660)).toBe('1h 1m');
    });

    it('round-trips with parseSlowmode', () => {
        for (const input of ['45s', '5m', '2h']) {
            const seconds = parseSlowmode(input)!;
            expect(parseSlowmode(formatSeconds(seconds).replace(/\s/g, ''))).toBe(seconds);
        }
    });
});
