import { Queue } from 'bullmq';
import { Redis } from 'ioredis';
import { container } from '@sapphire/framework';
import { prisma } from '../database/db';

// Sanction expiry ──────────────────
//
// Mutes and temporary bans used to expire on two setInterval loops that swept
// the whole table once a minute. That had two problems that no amount of tuning
// fixes:
//
//   - Expiry was accurate to the sweep interval, not to the sanction. A ten
//     minute mute lasted somewhere between ten and eleven.
//   - Nothing coordinated the sweeps, so two instances of the bot would both
//     find the same expired row and both act on it. Running more than one
//     process was unsafe, and nothing in the code said so.
//
// Both go away with a delayed job per sanction: BullMQ hands each job to exactly
// one consumer, and the delay is the sanction's own duration.

export const SANCTION_QUEUE = 'sanction-expiry';
export const SANCTION_QUEUE_PREFIX = 'aegis-sanctions';

export type SanctionExpiryJob =
    | { kind: 'unmute'; guildId: string; userId: string }
    | { kind: 'unban'; guildId: string; userId: string };

let queue: Queue<SanctionExpiryJob> | null = null;

export function getSanctionQueue(): Queue<SanctionExpiryJob> {
    if (!queue) {
        const connection = new Redis({
            ...container.redis?.options,
            maxRetriesPerRequest: null
        });

        queue = new Queue<SanctionExpiryJob>(SANCTION_QUEUE, {
            connection: connection as never,
            prefix: SANCTION_QUEUE_PREFIX
        });
    }

    return queue;
}

/**
 * One job per sanction, addressed by kind, guild and user.
 *
 * Deterministic so that re-applying a sanction replaces the pending expiry
 * instead of stacking a second one behind it — otherwise extending a mute would
 * leave the original job to lift it early.
 */
function jobId(kind: SanctionExpiryJob['kind'], guildId: string, userId: string): string {
    return `${kind}:${guildId}:${userId}`;
}

async function removeExisting(kind: SanctionExpiryJob['kind'], guildId: string, userId: string): Promise<void> {
    const existing = await getSanctionQueue().getJob(jobId(kind, guildId, userId)).catch(() => null);
    if (existing) await existing.remove().catch(() => undefined);
}

/**
 * Schedules the lift, replacing any pending one for the same user.
 *
 * A null expiry means the sanction is permanent, which is expressed by having no
 * job at all rather than by a job that never fires.
 */
export async function scheduleExpiry(
    kind: SanctionExpiryJob['kind'],
    guildId: string,
    userId: string,
    expiresAt: Date | null
): Promise<void> {
    try {
        await removeExisting(kind, guildId, userId);
        if (expiresAt === null) return;

        // Never negative: an expiry already in the past runs on the next tick of
        // the event loop rather than being rejected by the queue.
        const delay = Math.max(0, expiresAt.getTime() - Date.now());

        await getSanctionQueue().add(
            kind,
            { kind, guildId, userId },
            {
                jobId: jobId(kind, guildId, userId),
                delay,
                attempts: 3,
                backoff: { type: 'exponential', delay: 5_000 },
                removeOnComplete: true,
                removeOnFail: { count: 50 }
            }
        );
    } catch (error) {
        // A sanction that was applied should not be rolled back because its
        // expiry could not be queued. The boot reconciliation below is the
        // safety net: it re-schedules anything the database says is still
        // active, so a lost job costs precision, not correctness.
        container.logger.error(
            `[SANCTION_EXPIRY] Could not schedule ${kind} for ${userId} in ${guildId}:`,
            error
        );
    }
}

/** Drops a pending lift, for when the sanction is removed by hand first. */
export async function cancelExpiry(
    kind: SanctionExpiryJob['kind'],
    guildId: string,
    userId: string
): Promise<void> {
    try {
        await removeExisting(kind, guildId, userId);
    } catch (error) {
        container.logger.error(
            `[SANCTION_EXPIRY] Could not cancel ${kind} for ${userId} in ${guildId}:`,
            error
        );
    }
}

/**
 * Re-schedules every active sanction that has an expiry.
 *
 * Called once on ready. Jobs live in Redis and the sanctions live in
 * PostgreSQL, so the two can disagree: Redis can be flushed, a job can be lost,
 * or a sanction can be written while the queue is unreachable. PostgreSQL is
 * authoritative, and this makes Redis agree with it again.
 *
 * Safe to run repeatedly — scheduling is keyed on a deterministic job id, so a
 * second pass replaces rather than duplicates. Anything already past its expiry
 * gets a zero delay and is lifted immediately, which is also what recovers
 * sanctions that expired while the bot was down.
 */
export async function reconcileExpiries(): Promise<number> {
    let scheduled = 0;

    try {
        const [mutes, bans] = await Promise.all([
            prisma.activeMute.findMany({ where: { NOT: { expiresAt: null } } }),
            prisma.activeTempBan.findMany()
        ]);

        for (const mute of mutes) {
            await scheduleExpiry('unmute', mute.guildId, mute.userId, mute.expiresAt);
            scheduled += 1;
        }

        for (const ban of bans) {
            await scheduleExpiry('unban', ban.guildId, ban.userId, ban.expiresAt);
            scheduled += 1;
        }

        container.logger.info(`[SANCTION_EXPIRY] Reconciled ${scheduled} pending expiry job(s).`);
    } catch (error) {
        container.logger.error('[SANCTION_EXPIRY] Reconciliation failed:', error);
    }

    return scheduled;
}
