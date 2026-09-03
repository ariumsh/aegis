import { resolveKey } from '@sapphire/plugin-i18next';
import { APIRole, GuildMember, Role } from 'discord.js';
import { prisma } from '../../../../database/db.js';
import { AegisUserError } from '../../../../lib/structures/Errors.js';
import { CacheManager } from '../../../../database/CacheManager.js';
import { ContainerComponent, TextDisplayComponent } from '../../../../lib/layouts/ui.js';

export interface BotCommanderServiceOptions {
    interaction: any;
    guildId: string;
    role: Role | APIRole | null;
    member: GuildMember | null;
}

// ─────────────────────────────────────────────
//  Target resolution
// ─────────────────────────────────────────────

function resolveTarget(role: Role | APIRole | null, member: GuildMember | null) {
    if (!role && !member) throw new AegisUserError('admincommands:botCommander.errors.noTarget');
    if (role && member)   throw new AegisUserError('admincommands:botCommander.errors.bothTargets');

    return role
        ? { targetId: role.id,    targetType: 'ROLE'   as const, display: `<@&${role.id}>` }
        : { targetId: member!.id, targetType: 'MEMBER' as const, display: `<@${member!.id}>` };
}


// ─────────────────────────────────────────────
//  Allow
// ─────────────────────────────────────────────

export async function executeBotCommanderAllow({ interaction, guildId, role, member }: BotCommanderServiceOptions) {
    const { targetId, targetType, display } = resolveTarget(role, member);

    await prisma.botCommander.upsert({
        where:  { bot_commander_guild_target_unique: { guildId, targetId } },
        create: { guildId, targetId, targetType },
        update: { targetType },
    });

    await CacheManager.invalidateBotCommanders(guildId);

    const msg = await resolveKey(interaction, 'admincommands:botCommander.allow.success', { name: display });
    return interaction.editReply({ flags: 32768, components: [ContainerComponent([TextDisplayComponent(msg)])] });
}


// ─────────────────────────────────────────────
//  Remove
// ─────────────────────────────────────────────

export async function executeBotCommanderRemove({ interaction, guildId, role, member }: BotCommanderServiceOptions) {
    const { targetId, display } = resolveTarget(role, member);

    const deleted = await prisma.botCommander.deleteMany({
        where: { guildId, targetId },
    });

    await CacheManager.invalidateBotCommanders(guildId);

    if (deleted.count === 0) {
        const msg = await resolveKey(interaction, 'admincommands:botCommander.remove.notFound', { name: display });
        return interaction.editReply({ flags: 32768, components: [ContainerComponent([TextDisplayComponent(msg)])] });
    }

    const msg = await resolveKey(interaction, 'admincommands:botCommander.remove.success', { name: display });
    return interaction.editReply({ flags: 32768, components: [ContainerComponent([TextDisplayComponent(msg)])] });
}
