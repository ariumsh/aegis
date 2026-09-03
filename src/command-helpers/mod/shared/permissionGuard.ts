import { UserError } from '@sapphire/framework';
import { GuildMember, PermissionsBitField } from 'discord.js';
import { CacheManager } from '../../../database/CacheManager.js';

export type ModAction =
    | 'ban' | 'kick' | 'warn' | 'mute' | 'timeout'
    | 'softban' | 'tempban' | 'silentban' | 'unban'
    | 'unmute' | 'untimeout' | 'lockdown' | 'slowmode'
    | 'case' | 'removecase' | 'threshold' | 'user' | 'history';

// Maps each action to the Discord native permission that implicitly grants it.
// This is the fallback when no Aegis override exists.
const NATIVE_DISCORD_PERMS: Record<ModAction, bigint> = {
    ban:        PermissionsBitField.Flags.BanMembers,
    silentban:  PermissionsBitField.Flags.BanMembers,
    tempban:    PermissionsBitField.Flags.BanMembers,
    softban:    PermissionsBitField.Flags.BanMembers,
    unban:      PermissionsBitField.Flags.BanMembers,
    kick:       PermissionsBitField.Flags.KickMembers,
    warn:       PermissionsBitField.Flags.ModerateMembers,
    mute:       PermissionsBitField.Flags.ModerateMembers,
    unmute:     PermissionsBitField.Flags.ModerateMembers,
    timeout:    PermissionsBitField.Flags.ModerateMembers,
    untimeout:  PermissionsBitField.Flags.ModerateMembers,
    lockdown:   PermissionsBitField.Flags.ManageChannels,
    slowmode:   PermissionsBitField.Flags.ManageChannels,
    case:       PermissionsBitField.Flags.ModerateMembers,
    removecase: PermissionsBitField.Flags.ModerateMembers,
    threshold:  PermissionsBitField.Flags.ManageGuild,
    user:       PermissionsBitField.Flags.ModerateMembers,
    history:    PermissionsBitField.Flags.ModerateMembers,
};

/**
 * Returns true if the member is a Bot Commander — i.e., their member ID
 * or any of their role IDs is listed in the guild's BotCommander table.
 * Bot Commanders have bot-admin authority equivalent to Discord Administrator,
 * except they can still be subject to explicit DENY overrides.
 */
export async function isBotCommander(member: GuildMember): Promise<boolean> {
    const commanders = await CacheManager.getBotCommanders(member.guild.id);
    if (commanders.length === 0) return false;

    const memberRoleIds = [...member.roles.cache.keys()];

    return commanders.some(
        (c) =>
            (c.targetType === 'MEMBER' && c.targetId === member.id) ||
            (c.targetType === 'ROLE'   && memberRoleIds.includes(c.targetId))
    );
}

/**
 * Checks whether a guild member is allowed to perform a mod action.
 *
 * Resolution order (first match wins):
 *   1. Explicit DENY on member or any of their roles  → always denied, even admins and Bot Commanders
 *   2. Administrator permission (no deny found)        → always allowed
 *   3. Bot Commander (member or role in BotCommander)  → allowed (equivalent to Administrator)
 *   4. Explicit ALLOW on member or any of their roles  → allowed
 *   5. Discord native permission for this action        → allowed
 *   6. Otherwise                                        → denied
 *
 * Throws a UserError if access is denied so Sapphire's error handler
 * can surface it correctly.
 */
export async function requireModPermission(member: GuildMember, action: ModAction): Promise<void> {
    const isAdmin = member.permissions.has(PermissionsBitField.Flags.Administrator);

    const memberRoleIds = [...member.roles.cache.keys()];

    // Load Aegis perms and Bot Commanders in parallel — cache-first for both
    const [perms, commanders] = await Promise.all([
        CacheManager.getModPermissions(member.guild.id),
        CacheManager.getBotCommanders(member.guild.id),
    ]);

    const relevant = perms.filter(
        (p) =>
            (p.targetType === 'MEMBER' && p.targetId === member.id && p.action === action) ||
            (p.targetType === 'ROLE'   && memberRoleIds.includes(p.targetId) && p.action === action)
    );

    // Step 1: explicit DENY is absolute — overrides even Administrator and Bot Commanders
    const hasDeny = relevant.some((p) => p.type === 'DENY');
    if (hasDeny) {
        throw new UserError({ identifier: 'modcommands:perms.errors.denied', message: 'You have been explicitly denied permission to use this command.' });
    }

    // Step 2: Administrator with no explicit deny → always passes
    if (isAdmin) return;

    // Step 3: Bot Commander → equivalent to Administrator (passes all actions)
    const isBotCommanderMember = commanders.some(
        (c) =>
            (c.targetType === 'MEMBER' && c.targetId === member.id) ||
            (c.targetType === 'ROLE'   && memberRoleIds.includes(c.targetId))
    );
    if (isBotCommanderMember) return;

    // Step 4: Aegis ALLOW override
    const hasAllow = relevant.some((p) => p.type === 'ALLOW');
    if (hasAllow) return;

    // Step 5: Discord native permission fallback
    const nativePerm = NATIVE_DISCORD_PERMS[action];
    if (nativePerm && member.permissions.has(nativePerm)) return;

    // Step 6: no path to access
    throw new UserError({ identifier: 'modcommands:perms.errors.noPermission', message: 'You do not have permission to use this command.' });
}
