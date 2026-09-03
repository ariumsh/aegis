import { Command } from '@sapphire/framework';
import { resolveKey } from '@sapphire/plugin-i18next';
import { Message } from 'discord.js';
import { requireThresholds, parseDuration } from '../../../../lib/utils/ModUtils';
import { prisma } from '../../../../database/db';
import { CacheManager } from '../../../../database/CacheManager';
import { Emojis } from '../../../../lib/constants/emojis';
import { ContainerComponent, TextDisplayComponent } from '../../../../lib/layouts/ui';
import { AegisUserError } from '../../../../lib/structures/Errors';

export const VALID_TRIGGERS = ['all', 'warn', 'mute', 'timeout', 'kick', 'ban', 'tempban', 'softban'] as const;
export const VALID_ACTIONS = ['mute', 'timeout', 'kick', 'ban', 'tempban', 'softban'] as const;

const DURATION_ACTIONS = new Set(['mute', 'timeout', 'tempban']);

export type ThresholdTrigger = typeof VALID_TRIGGERS[number];
export type ThresholdAction = typeof VALID_ACTIONS[number];

export type ThresholdSource = Command.ChatInputCommandInteraction | Message;

export function normalizeTrigger(trigger: string): ThresholdTrigger {
    const normalized = trigger.toLowerCase();
    if (!VALID_TRIGGERS.includes(normalized as ThresholdTrigger)) {
        throw new AegisUserError('modcommands:mod.threshold.errors.invalidTrigger', undefined, { trigger });
    }

    return normalized as ThresholdTrigger;
}

export function normalizeAction(action: string): ThresholdAction {
    const normalized = action.toLowerCase();
    if (!VALID_ACTIONS.includes(normalized as ThresholdAction)) {
        throw new AegisUserError('modcommands:mod.threshold.errors.invalidAction', undefined, { action });
    }

    return normalized as ThresholdAction;
}

export function parseAndValidateDuration(action: ThresholdAction, durationInput: string | null) {
    const needsDuration = DURATION_ACTIONS.has(action);

    if (needsDuration && !durationInput) {
        throw new AegisUserError('modcommands:mod.threshold.errors.durationRequired', undefined, { action });
    }

    if (!needsDuration && durationInput) {
        throw new AegisUserError('modcommands:mod.threshold.errors.durationNotAllowed', undefined, { action });
    }

    if (!durationInput) return null;

    const parsed = parseDuration(durationInput);
    if (!parsed) throw new AegisUserError('errors:mod_invalidDuration');

    if (action === 'timeout' && parsed.ms > 28 * 24 * 60 * 60 * 1000) {
        throw new AegisUserError('modcommands:mod.timeout.tooLong');
    }

    return parsed.formatted;
}

export async function executeAddThreshold(data: {
    source: ThresholdSource;
    guildId: string;
    trigger: ThresholdTrigger;
    count: number;
    action: ThresholdAction;
    duration: string | null;
}) {
    const { source, guildId, trigger, count, action, duration } = data;

    await requireThresholds(guildId);

    const rule = await prisma.modThreshold.upsert({
        where: {
            guild_trigger_threshold_unique: {
                guildId,
                triggerType: trigger,
                threshold: count
            }
        },
        create: {
            guildId,
            triggerType: trigger,
            threshold: count,
            action,
            duration
        },
        update: {
            action,
            duration
        }
    });

    const successMsg = await resolveKey(source, 'modcommands:mod.threshold.added', {
        id: rule.id,
        trigger,
        count,
        action,
        duration: duration ?? '-'
    });

    return {
        flags: 32768,
        components: [ContainerComponent([TextDisplayComponent(`${Emojis.check_emoji} ${successMsg}`)])]
    };
}

export async function executeListThreshold(data: {
    source: ThresholdSource;
    guildId: string;
    triggerFilter: string | null;
}) {
    const { source, guildId, triggerFilter } = data;

    await requireThresholds(guildId);

    if (triggerFilter && !VALID_TRIGGERS.includes(triggerFilter as ThresholdTrigger)) {
        throw new AegisUserError('modcommands:mod.threshold.errors.invalidTrigger', undefined, { trigger: triggerFilter });
    }

    const where = triggerFilter && triggerFilter !== 'all'
        ? { guildId, triggerType: triggerFilter }
        : { guildId };

    const [rules, config] = await Promise.all([
        prisma.modThreshold.findMany({ where, orderBy: [{ triggerType: 'asc' }, { threshold: 'asc' }] }),
        CacheManager.getModConfig(guildId)
    ]);

    if (rules.length === 0) {
        const emptyMsg = await resolveKey(source, 'modcommands:mod.threshold.list.empty');
        return {
            flags: 32768,
            components: [ContainerComponent([TextDisplayComponent(`${Emojis.warning_emoji} ${emptyMsg}`)])]
        };
    }

    const title = await resolveKey(source, 'modcommands:mod.threshold.list.title');
    const expiration = config.warnExpirationDays > 0
        ? await resolveKey(source, 'modcommands:mod.threshold.list.expirationEnabled', { days: config.warnExpirationDays })
        : await resolveKey(source, 'modcommands:mod.threshold.list.expirationDisabled');

    const lineEntries = await Promise.all(
        rules.map(async (rule) => resolveKey(source, 'modcommands:mod.threshold.list.line', {
            id: rule.id,
            trigger: rule.triggerType,
            count: rule.threshold,
            action: rule.action,
            duration: rule.duration ?? '-'
        }))
    );

    const listText = lineEntries.map((line) => `${Emojis.bullet_emoji} ${line}`).join('\n');

    return {
        flags: 32768,
        components: [ContainerComponent([
            TextDisplayComponent(`## ${title}\n\n${expiration}`),
            TextDisplayComponent(listText)
        ])]
    };
}

export async function executeRemoveThreshold(data: {
    source: ThresholdSource;
    guildId: string;
    id: number;
}) {
    const { source, guildId, id } = data;

    await requireThresholds(guildId);

    const rule = await prisma.modThreshold.findUnique({ where: { id } });

    if (!rule || rule.guildId !== guildId) {
        throw new AegisUserError('modcommands:mod.threshold.errors.notFound', undefined, { id });
    }

    await prisma.modThreshold.delete({ where: { id } });

    const successMsg = await resolveKey(source, 'modcommands:mod.threshold.removed', { id });
    return {
        flags: 32768,
        components: [ContainerComponent([TextDisplayComponent(`${Emojis.check_emoji} ${successMsg}`)])]
    };
}
