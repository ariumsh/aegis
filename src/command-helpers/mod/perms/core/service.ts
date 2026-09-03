import { resolveKey } from '@sapphire/plugin-i18next';
import { APIRole, GuildMember, Role } from 'discord.js';
import { prisma } from '../../../../database/db.js';
import { AegisUserError } from '../../../../lib/structures/Errors.js';
import { CacheManager } from '../../../../database/CacheManager.js';
import { ContainerComponent, TextDisplayComponent } from '../../../../lib/layouts/ui.js';

export interface PermsServiceOptions {
    interaction: any;
    guildId: string;
    role: Role | APIRole | null;
    member: GuildMember | null;
    action?: string;
}

const ALL_ACTIONS = [
    'ban', 'kick', 'warn', 'mute', 'timeout', 'softban', 'tempban',
    'silentban', 'unban', 'unmute', 'untimeout', 'lockdown', 'slowmode',
    'case', 'removecase', 'threshold', 'user', 'history',
] as const;

// ─────────────────────────────────────────────
//  Target resolution
// ─────────────────────────────────────────────

function resolveTarget(role: Role | APIRole | null, member: GuildMember | null) {
    if (!role && !member) throw new AegisUserError('modcommands:perms.errors.noTarget');
    if (role && member)   throw new AegisUserError('modcommands:perms.errors.bothTargets');

    return role
        ? { targetId: role.id,    targetType: 'ROLE'   as const, display: `<@&${role.id}>` }
        : { targetId: member!.id, targetType: 'MEMBER' as const, display: `<@${member!.id}>` };
}


// ─────────────────────────────────────────────
//  Allow
// ─────────────────────────────────────────────

export async function executePermsAllow({ interaction, guildId, role, member, action }: PermsServiceOptions) {
    const { targetId, targetType, display } = resolveTarget(role, member);

    if (action) {
        await prisma.modPermission.upsert({
            where:  { guildId_targetId_action: { guildId, targetId, action } },
            create: { guildId, targetId, targetType, action, type: 'ALLOW' },
            update: { type: 'ALLOW', targetType },
        });
    } else {
        await prisma.modPermission.deleteMany({ where: { guildId, targetId } });
        await prisma.modPermission.createMany({
            data: ALL_ACTIONS.map(a => ({ guildId, targetId, targetType, action: a, type: 'ALLOW' as const })),
        });
    }

    await CacheManager.invalidateModPermissions(guildId);

    const key = action ? 'modcommands:perms.allow.success' : 'modcommands:perms.allow.successAll';
    const msg = await resolveKey(interaction, key, { name: display, action });
    return interaction.editReply({ flags: 32768, components: [ContainerComponent([TextDisplayComponent(msg)])] });
}


// ─────────────────────────────────────────────
//  Deny
// ─────────────────────────────────────────────

export async function executePermsDeny({ interaction, guildId, role, member, action }: PermsServiceOptions) {
    const { targetId, targetType, display } = resolveTarget(role, member);

    if (action) {
        await prisma.modPermission.upsert({
            where:  { guildId_targetId_action: { guildId, targetId, action } },
            create: { guildId, targetId, targetType, action, type: 'DENY' },
            update: { type: 'DENY', targetType },
        });
    } else {
        await prisma.modPermission.deleteMany({ where: { guildId, targetId } });
        await prisma.modPermission.createMany({
            data: ALL_ACTIONS.map(a => ({ guildId, targetId, targetType, action: a, type: 'DENY' as const })),
        });
    }

    await CacheManager.invalidateModPermissions(guildId);

    const key = action ? 'modcommands:perms.deny.success' : 'modcommands:perms.deny.successAll';
    const msg = await resolveKey(interaction, key, { name: display, action });
    return interaction.editReply({ flags: 32768, components: [ContainerComponent([TextDisplayComponent(msg)])] });
}


// ─────────────────────────────────────────────
//  Delete
// ─────────────────────────────────────────────

export async function executePermsDelete({ interaction, guildId, role, member, action }: PermsServiceOptions) {
    const { targetId, display } = resolveTarget(role, member);

    const deleted = await prisma.modPermission.deleteMany({
        where: action ? { guildId, targetId, action } : { guildId, targetId },
    });

    await CacheManager.invalidateModPermissions(guildId);

    if (deleted.count === 0) {
        const key = action ? 'modcommands:perms.reset.notFound' : 'modcommands:perms.reset.notFoundAll';
        const msg = await resolveKey(interaction, key, { name: display, action });
        return interaction.editReply({ flags: 32768, components: [ContainerComponent([TextDisplayComponent(msg)])] });
    }

    const key = action ? 'modcommands:perms.reset.success' : 'modcommands:perms.reset.successAll';
    const msg = await resolveKey(interaction, key, { name: display, count: deleted.count });
    return interaction.editReply({ flags: 32768, components: [ContainerComponent([TextDisplayComponent(msg)])] });
}


// ─────────────────────────────────────────────
//  List
// ─────────────────────────────────────────────

export async function executePermsList({ interaction, guildId, role, member }: PermsServiceOptions) {
    const { targetId, display } = resolveTarget(role, member);

    const perms = await prisma.modPermission.findMany({
        where:   { guildId, targetId },
        orderBy: { action: 'asc' },
    });

    if (perms.length === 0) {
        const msg = await resolveKey(interaction, 'modcommands:perms.list.empty', { name: display });
        return interaction.editReply({ flags: 32768, components: [ContainerComponent([TextDisplayComponent(msg)])] });
    }

    const title = await resolveKey(interaction, 'modcommands:perms.list.title', { name: display });
    const lines = perms.map((p: any) => {
        const icon = p.type === 'ALLOW' ? '✅' : '🚫';
        return `${icon} \`${p.action}\``;
    });

    return interaction.editReply({ flags: 32768, components: [ContainerComponent([TextDisplayComponent(`${title}\n${lines.join('\n')}`)])] });
}
