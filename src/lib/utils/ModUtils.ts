import { Guild, TextChannel, GuildMember, Message } from 'discord.js';
import { resolveKey } from '@sapphire/plugin-i18next';
import { container, Command } from '@sapphire/framework';
import { getSanctionLayout } from '../layouts/modCommandLayouts';
import { AegisUserError } from '../structures/Errors';
import { WEBHOOK_NAME } from '../constants/bot';

export type ModAction = 'warn' | 'mute' | 'ban' | 'tempban' | 'softban' | 'kick' | 'timeout' | 'untimeout' | 'unmute' | 'unban';

import { prisma } from '../../database/db';
import { CacheManager } from '../../database/CacheManager';

// Moderation helpers ──────────────────

/**
 * Validates if the target can be moderated by the invoker
 */
export async function validateMod(target: Command.ChatInputCommandInteraction | Message, member: GuildMember): Promise<void> {
    const invoker = (target instanceof Message) ? target.member : target.member as GuildMember;
    if (!invoker) throw new AegisUserError('errors:unexpected');

    if (member.id === invoker.id) throw new AegisUserError('errors:mod_self');
    if (member.id === container.client.user?.id) throw new AegisUserError('errors:mod_bot');
    
    if (member.roles.highest.position >= invoker.roles.highest.position && invoker.guild.ownerId !== invoker.id) {
        throw new AegisUserError('errors:mod_hierarchy');
    }

    if (!member.manageable) throw new AegisUserError('errors:mod_notManageable');
}

export async function requireModConfig(guildId: string): Promise<void> {
    const modConfig = await CacheManager.getModConfig(guildId);

    if (!modConfig.modModule) throw new AegisUserError('errors:mod_moduleDisabled');
    if (!modConfig.modLogChannelId) throw new AegisUserError('errors:mod_noLogChannel');

    const channel = await container.client.channels.fetch(modConfig.modLogChannelId).catch(() => null);
    if (!channel) throw new AegisUserError('errors:mod_logChannelNotFound');
}

export async function requireMutedRole(guildId: string): Promise<string> {
    const modConfig = await CacheManager.getModConfig(guildId);
    if (!modConfig.mutedRoleId) throw new AegisUserError('errors:mod_noMutedRole');

    const guild = await container.client.guilds.fetch(guildId).catch(() => null);
    const role = await guild?.roles.fetch(modConfig.mutedRoleId).catch(() => null);

    if (!role) throw new AegisUserError('errors:mod_mutedRoleNotFound');
    return role.id;
}

export async function syncMutedRoleOverwrites(guild: Guild, mutedRoleId: string): Promise<{ updated: number; failed: number }> {
    const denyPermissions = {
        SendMessages: false,
        SendMessagesInThreads: false,
        AddReactions: false,
        CreatePublicThreads: false,
        CreatePrivateThreads: false,
        SendTTSMessages: false
    } as const;

    const channels = await guild.channels.fetch();
    let updated = 0;
    let failed = 0;

    for (const channel of channels.values()) {
        if (!channel || !('permissionOverwrites' in channel)) continue;

        try {
            await channel.permissionOverwrites.edit(mutedRoleId, denyPermissions, {
                reason: 'Aegis - enforce muted role overwrite'
            });
            updated++;
        } catch (error) {
            failed++;
            container.logger.warn(
                `[MOD_UTILS] Failed applying muted overwrite in guild ${guild.id} channel ${channel.id}: ${(error as Error)?.message ?? error}`
            );
        }
    }

    return { updated, failed };
}

export async function requireThresholds(guildId: string): Promise<void> {
    await requireModConfig(guildId);
    const modConfig = await CacheManager.getModConfig(guildId);
    if (!modConfig.modThresholdsEnabled) throw new AegisUserError('modcommands:mod.threshold.errors.thresholdsDisabled');
}

async function getLabels(guild: Guild, type: string) {
    if (!guild) {
        container.logger.error(`[MOD_UTILS] getLabels received undefined guild!`);
        return {
            typeLabel: type, targetLabel: 'Target', modLabel: 'Action by',
            reasonLabel: 'Reason', durationLabel: 'Duration', permanent: 'Permanent'
        };
    }
    const ns = 'modcommands:sanctions';
    return {
        typeLabel:     await resolveKey(guild, `${ns}.types.${type}`).catch(() => type),
        targetLabel:   await resolveKey(guild, `${ns}.fields.target`).catch(() => 'Target'),
        modLabel:      await resolveKey(guild, `${ns}.fields.staff`).catch(() => 'Action by'),
        reasonLabel:   await resolveKey(guild, `${ns}.fields.reason`).catch(() => 'Reason'),
        durationLabel: await resolveKey(guild, `${ns}.fields.duration`).catch(() => 'Duration'),
        permanent:     await resolveKey(guild, `${ns}.fields.permanent`).catch(() => 'Permanent')
    };
}

export async function sendModDM(data: {
    userId: string,
    moderatorId: string,
    action: ModAction,
    guild: Guild,
    reason?: string | null,
    duration?: string | null
}) {
    try {
        const user = await container.client.users.fetch(data.userId);
        const labels = await getLabels(data.guild, data.action);

        await user.send({ ...getSanctionLayout({
            type: data.action as any,
            targetId: data.userId,
            moderatorId: data.moderatorId,
            reason: data.reason ?? 'No reason provided',
            duration: data.duration ?? null,
            labels: {
                typeLabel: labels.typeLabel,
                targetLabel: labels.targetLabel,
                modLabel: labels.modLabel,
                reasonLabel: labels.reasonLabel,
                durationLabel: labels.durationLabel,
                permanent: labels.permanent
            },
            createdAt: new Date()
        }) });
    } catch {
        container.logger.warn(`[MOD_UTILS] Could not send DM to ${data.userId}`);
    }
}

export async function sendModLog(data: {
    guildId: string,
    action: ModAction,
    userId: string,
    userTag: string,
    moderatorId: string,
    guild: Guild,
    reason?: string | null,
    duration?: string | null,
    expiresAt?: Date | null,
    isAutomatic?: boolean
}): Promise<number | null> {
    try {
        const now = new Date();

        const caseNumber = await prisma.$transaction(async (tx) => {
            const config = await tx.guildConfig.update({
                where: { guildId: data.guildId },
                data: { caseCount: { increment: 1 } },
                select: { caseCount: true }
            });

            await tx.modLog.create({
                data: {
                    guildId:     data.guildId,
                    userId:      data.userId,
                    moderatorId: data.moderatorId,
                    action:      data.action,
                    reason:      data.reason ?? null,
                    duration:    data.duration ?? null,
                    expiresAt:   data.expiresAt ?? null,
                    caseNumber:  config.caseCount,
                    isAutomatic: data.isAutomatic ?? false,
                    createdAt:   now
                }
            });

            return config.caseCount;
        });

        const modConfig = await CacheManager.getModConfig(data.guildId);
        if (modConfig.modLogChannelId) {
            const channel = await container.client.channels.fetch(modConfig.modLogChannelId).catch(() => null) as TextChannel | null;
            if (channel) {
                const labels = await getLabels(data.guild, data.action);
                const layout = getSanctionLayout({
                    type: data.action as any,
                    targetId: data.userId,
                    moderatorId: data.moderatorId,
                    reason: data.reason ?? 'No reason provided',
                    duration: data.duration ?? null,
                    labels: {
                        typeLabel: labels.typeLabel,
                        targetLabel: labels.targetLabel,
                        modLabel: labels.modLabel,
                        reasonLabel: labels.reasonLabel,
                        durationLabel: labels.durationLabel,
                        permanent: labels.permanent
                    },
                    caseId: caseNumber,
                    createdAt: now
                });

                // Webhook Logic
                let webhook = (await channel.fetchWebhooks().catch(() => null))?.find(
                    wh => wh.owner?.id === container.client.user?.id && wh.name === WEBHOOK_NAME
                );

                if (!webhook) {
                    webhook = await channel.createWebhook({
                        name: WEBHOOK_NAME,
                        avatar: container.client.user?.displayAvatarURL(),
                        reason: 'Aegis Mod Logs setup'
                    }).catch(() => undefined);
                }

                if (webhook) {
                    await webhook.send({
                        ...layout,
                        username: WEBHOOK_NAME,
                        avatarURL: container.client.user?.displayAvatarURL()
                    });
                } else {
                    // Fallback if webhook creation fails
                    await channel.send(layout);
                }
            }
        }
        return caseNumber;
    } catch (error) {
        container.logger.error(`[MOD_UTILS] Failed to send mod log:`, error);
        return null;
    }
}

export async function checkThresholds(data: {
    guildId: string,
    userId: string,
    userTag: string,
    moderatorId: string,
    guild: Guild,
    actionTriggered: ModAction 
}) {
    try {
        const config = await CacheManager.getModConfig(data.guildId);
        if (!config.modThresholdsEnabled) return;

        const dateLimit = config.warnExpirationDays > 0 
            ? new Date(Date.now() - (config.warnExpirationDays * 24 * 60 * 60 * 1000))
            : new Date(0);

        let activeRule = null;
        let currentCount = 0;

        if (config.thresholdMode === 'all_actions') {
            currentCount = await prisma.modLog.count({
                where: { 
                    guildId: data.guildId, 
                    userId: data.userId, 
                    isAutomatic: false,
                    action: { in: ['warn', 'mute', 'timeout', 'kick', 'softban', 'ban', 'tempban'] },
                    createdAt: { gte: dateLimit }
                }
            });
            activeRule = await prisma.modThreshold.findFirst({
                where: {
                    guildId: data.guildId,
                    triggerType: 'all',
                    threshold: { lte: currentCount }
                },
                orderBy: { threshold: 'desc' }
            });
        } else {
            currentCount = await prisma.modLog.count({
                where: { 
                    guildId: data.guildId, 
                    userId: data.userId, 
                    isAutomatic: false,
                    action: data.actionTriggered,
                    createdAt: { gte: dateLimit }
                }
            });
            activeRule = await prisma.modThreshold.findFirst({
                where: {
                    guildId: data.guildId,
                    triggerType: data.actionTriggered,
                    threshold: { lte: currentCount }
                },
                orderBy: { threshold: 'desc' }
            });
        }

        if (!activeRule) return;
        const member = await data.guild.members.fetch(data.userId).catch(() => null);
        if (!member && activeRule.action !== 'unban') return;

        const reason = await resolveKey(data.guild, 'modcommands:mod.threshold.autoReason', { count: currentCount });

        switch (activeRule.action) {
            case 'mute':
            case 'timeout': {
                if (!member?.manageable) return;
                const duration = activeRule.duration ? parseDuration(activeRule.duration) : null;
                await applyMute({ ...data, reason, duration: duration?.formatted, expiresAt: duration?.expiresAt, isAutomatic: true });
                break;
            }
            case 'kick':
                if (!member?.kickable) return;
                await sendModDM({ userId: data.userId, moderatorId: container.client.user!.id, action: 'kick', guild: data.guild, reason });
                await member.kick(reason);
                await sendModLog({ ...data, action: 'kick', reason, isAutomatic: true });
                break;
            case 'softban':
                if (!member?.bannable) return;
                await sendModDM({ userId: data.userId, moderatorId: container.client.user!.id, action: 'softban', guild: data.guild, reason });
                await member.ban({ deleteMessageSeconds: 604800, reason });
                await data.guild.members.unban(data.userId, 'Softban: clear messages');
                await sendModLog({ ...data, action: 'softban', reason, isAutomatic: true });
                break;
            case 'tempban': {
                if (!member?.bannable) return;
                const banDuration = activeRule.duration ? parseDuration(activeRule.duration) : null;
                if (!banDuration) return;
                await sendModDM({ userId: data.userId, moderatorId: container.client.user!.id, action: 'tempban', guild: data.guild, reason, duration: banDuration.formatted });
                const caseNum = await sendModLog({ ...data, action: 'tempban', reason, duration: banDuration.formatted, expiresAt: banDuration.expiresAt, isAutomatic: true });
                await prisma.activeTempBan.upsert({
                    where:  { tempban_guild_user_unique: { guildId: data.guildId, userId: data.userId } },
                    create: { guildId: data.guildId, userId: data.userId, moderatorId: container.client.user!.id, reason, expiresAt: banDuration.expiresAt, caseNumber: caseNum ?? 0 },
                    update: { moderatorId: container.client.user!.id, reason, expiresAt: banDuration.expiresAt, caseNumber: caseNum ?? 0 },
                });
                await member.ban({ reason });
                break;
            }
            case 'ban':
                if (!member?.bannable) return;
                await sendModDM({ userId: data.userId, moderatorId: container.client.user!.id, action: 'ban', guild: data.guild, reason });
                await member.ban({ reason });
                await sendModLog({ ...data, action: 'ban', reason, isAutomatic: true });
                break;
        }
    } catch (error) {
        container.logger.error(`[MOD_UTILS] Threshold check failed:`, error);
    }
}

export async function applyMute(data: {
    guildId: string,
    userId: string,
    userTag: string,
    moderatorId: string,
    guild: Guild,
    reason?: string | null,
    duration?: string | null,
    expiresAt?: Date | null,
    isAutomatic?: boolean
}) {
    try {
        const member = await data.guild.members.fetch(data.userId).catch(() => null);
        if (!member) return;

        // Discord caps a timeout at 28 days and rejects one that lands in the
        // past. Clamping keeps an over-long or already-expired threshold rule
        // from failing the call outright.
        const MAX_TIMEOUT_MS = 28 * 24 * 60 * 60 * 1000;
        const requestedMs = data.expiresAt ? data.expiresAt.getTime() - Date.now() : MAX_TIMEOUT_MS;
        const timeoutMs = Math.min(Math.max(requestedMs, 1_000), MAX_TIMEOUT_MS);

        // Apply before recording. The previous order wrote the case and the
        // ActiveMute row first, so a timeout Discord refused -- insufficient role
        // hierarchy, most commonly -- left a numbered case and an active mute row
        // for a member who was never muted, while the moderator saw success.
        // MuteWorker would later "lift" a timeout that had never been set.
        await member.timeout(timeoutMs, data.reason ?? undefined);

        const caseNumber = await sendModLog({
            guildId: data.guildId, action: 'timeout', userId: data.userId, userTag: data.userTag, moderatorId: data.moderatorId, guild: data.guild, reason: data.reason, duration: data.duration, expiresAt: data.expiresAt, isAutomatic: data.isAutomatic
        });

        await prisma.activeMute.upsert({
            where:  { mute_guild_user_unique: { guildId: data.guildId, userId: data.userId } },
            create: { guildId: data.guildId, userId: data.userId, moderatorId: data.moderatorId, reason: data.reason ?? null, expiresAt: data.expiresAt ?? null, caseNumber: caseNumber ?? 0 },
            update: { moderatorId: data.moderatorId, reason: data.reason ?? null, expiresAt: data.expiresAt ?? null, caseNumber: caseNumber ?? 0 },
        });

        await sendModDM({ userId: data.userId, moderatorId: data.moderatorId, action: 'timeout', guild: data.guild, reason: data.reason, duration: data.duration });

        if (!data.isAutomatic) {
            await checkThresholds({ guildId: data.guildId, userId: data.userId, userTag: data.userTag, moderatorId: data.moderatorId, guild: data.guild, actionTriggered: 'timeout' });
        }
    } catch (error) {
        container.logger.error(`[MOD_UTILS] Apply mute failed:`, error);
    }
}

export function parseSlowmode(input: string): number | null {
    const lower = input.toLowerCase().trim();
    if (lower === '0' || lower === 'off') return 0;
    const regex = /^(\d+)(h|m|s)?$/i;
    const match = lower.match(regex);
    if (!match) return null;
    const value = parseInt(match[1]);
    const unit = match[2];
    if (!unit) return value;
    switch (unit) {
        case 'h': return value * 3600;
        case 'm': return value * 60;
        case 's': return value;
        default: return null;
    }
}

export function formatSeconds(seconds: number): string {
    if (seconds === 0) return '0s';
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    const parts = [];
    if (hours > 0) parts.push(`${hours}h`);
    if (minutes > 0) parts.push(`${minutes}m`);
    if (secs > 0 || parts.length === 0) parts.push(`${secs}s`);
    return parts.join(' ');
}

export function parseDuration(input: string): { ms: number, expiresAt: Date, formatted: string } | null {
    const normalized = input.trim().toLowerCase();
    const regex = /^(?:(\d+)d)?(?:(\d+)h)?(?:(\d+)m)?$/;
    const match = normalized.match(regex);
    if (!match || (!match[1] && !match[2] && !match[3])) return null;
    const days    = parseInt(match[1] ?? '0');
    const hours   = parseInt(match[2] ?? '0');
    const minutes = parseInt(match[3] ?? '0');
    const ms = (days * 86400 + hours * 3600 + minutes * 60) * 1000;
    if (ms <= 0) return null;
    const parts = [];
    if (days)    parts.push(`${days}d`);
    if (hours)   parts.push(`${hours}h`);
    if (minutes) parts.push(`${minutes}m`);
    return { ms, expiresAt: new Date(Date.now() + ms), formatted: parts.join(' ') };
}

export function cleanAndTokenize(text: string): string[] {
    const normalized = text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    const cleaned = normalized.replace(/[^a-z0-9\s]/g, ' ');
    return cleaned.split(/\s+/).filter(token => token.length > 0);
}
