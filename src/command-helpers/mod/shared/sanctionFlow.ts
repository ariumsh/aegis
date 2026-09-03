import { Command } from '@sapphire/framework';
import { resolveKey } from '@sapphire/plugin-i18next';
import { Guild, Message } from 'discord.js';
import { checkThresholds, sendModLog } from '../../../lib/utils/ModUtils';
import { getStaffConfirmationLayout } from '../../../lib/layouts/modCommandLayouts';

type SanctionSource = Command.ChatInputCommandInteraction | Message;

type RecordAndConfirmOptions = {
    source: SanctionSource;
    guildId: string;
    guild: Guild;
    moderatorId: string;
    action: string;
    userId: string;
    userTag: string;
    reason: string | null;
    duration?: string;
    expiresAt?: Date | null;
    confirmationKey: string;
    emoji: string;
    userDisplay: string;
    thresholdActionTriggered?: string;
    skipThresholdCheck?: boolean;
};

export async function recordAndBuildSanctionConfirmation(options: RecordAndConfirmOptions) {
    const caseNumber = await sendModLog({
        guildId: options.guildId,
        action: options.action as any,
        userId: options.userId,
        userTag: options.userTag,
        moderatorId: options.moderatorId,
        guild: options.guild,
        reason: options.reason,
        duration: options.duration,
        expiresAt: options.expiresAt ?? null
    });

    if (options.thresholdActionTriggered && !options.skipThresholdCheck) {
        await checkThresholds({
            guildId: options.guildId,
            userId: options.userId,
            userTag: options.userTag,
            moderatorId: options.moderatorId,
            guild: options.guild,
            actionTriggered: options.thresholdActionTriggered as any
        });
    }

    const successMsg = await resolveKey(options.source, options.confirmationKey, {
        emoji: options.emoji,
        user: options.userDisplay,
        userId: options.userId
    });

    return {
        caseNumber,
        layout: getStaffConfirmationLayout({
            content: successMsg,
            caseId: caseNumber ?? 0
        })
    };
}
