import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PermissionsBitField } from 'discord.js';

/**
 * Tests for the authorization model.
 *
 * This is the highest-value unit in the tree: it decides who may ban, who may
 * delete a moderation case, and who may rewrite the escalation rules. It also
 * has a deliberately unusual property — an explicit DENY outranks Administrator
 * — which is easy to "simplify" away by accident.
 *
 * CacheManager is mocked so the resolution order can be exercised without Redis
 * or PostgreSQL.
 */

const getModPermissions = vi.fn();
const getBotCommanders = vi.fn();

vi.mock('../src/database/CacheManager.js', () => ({
    CacheManager: {
        getModPermissions: (...args: unknown[]) => getModPermissions(...args),
        getBotCommanders: (...args: unknown[]) => getBotCommanders(...args)
    }
}));

const { requireModPermission } = await import('../src/command-helpers/mod/shared/permissionGuard');

/** Minimal stand-in for the parts of GuildMember the guard actually reads. */
function member(options: { id?: string; roles?: string[]; admin?: boolean; native?: bigint } = {}) {
    const permissions = new PermissionsBitField(
        (options.admin ? PermissionsBitField.Flags.Administrator : 0n) | (options.native ?? 0n)
    );

    return {
        id: options.id ?? 'user-1',
        guild: { id: 'guild-1' },
        permissions,
        roles: { cache: new Map((options.roles ?? []).map((r) => [r, {}])) }
    } as never;
}

const allow = (targetId: string, action: string, targetType = 'MEMBER') => ({ targetId, action, type: 'ALLOW', targetType });
const deny = (targetId: string, action: string, targetType = 'MEMBER') => ({ targetId, action, type: 'DENY', targetType });

beforeEach(() => {
    getModPermissions.mockReset().mockResolvedValue([]);
    getBotCommanders.mockReset().mockResolvedValue([]);
});

describe('requireModPermission — resolution order', () => {
    it('step 1: an explicit DENY beats Administrator', async () => {
        // The rule that makes this model worth having. If DENY were checked
        // after Administrator, an admin could never be excluded from an action.
        getModPermissions.mockResolvedValue([deny('user-1', 'ban')]);

        await expect(requireModPermission(member({ admin: true }), 'ban')).rejects.toThrow();
    });

    it('step 1: an explicit DENY beats Bot Commander', async () => {
        getModPermissions.mockResolvedValue([deny('user-1', 'ban')]);
        getBotCommanders.mockResolvedValue([{ targetId: 'user-1', targetType: 'MEMBER' }]);

        await expect(requireModPermission(member(), 'ban')).rejects.toThrow();
    });

    it('step 1: a DENY inherited from a role applies', async () => {
        getModPermissions.mockResolvedValue([deny('role-a', 'ban', 'ROLE')]);

        await expect(requireModPermission(member({ roles: ['role-a'] }), 'ban')).rejects.toThrow();
    });

    it('step 1: a DENY on a different action does not leak across actions', async () => {
        getModPermissions.mockResolvedValue([deny('user-1', 'kick')]);

        await expect(requireModPermission(member({ admin: true }), 'ban')).resolves.toBeUndefined();
    });

    it('step 2: Administrator passes with no DENY present', async () => {
        await expect(requireModPermission(member({ admin: true }), 'ban')).resolves.toBeUndefined();
    });

    it('step 3: a Bot Commander passes without any Discord permission', async () => {
        getBotCommanders.mockResolvedValue([{ targetId: 'user-1', targetType: 'MEMBER' }]);

        await expect(requireModPermission(member(), 'ban')).resolves.toBeUndefined();
    });

    it('step 3: Bot Commander is inherited from a role', async () => {
        getBotCommanders.mockResolvedValue([{ targetId: 'role-a', targetType: 'ROLE' }]);

        await expect(requireModPermission(member({ roles: ['role-a'] }), 'ban')).resolves.toBeUndefined();
    });

    it('step 4: an explicit ALLOW passes without any Discord permission', async () => {
        getModPermissions.mockResolvedValue([allow('user-1', 'ban')]);

        await expect(requireModPermission(member(), 'ban')).resolves.toBeUndefined();
    });

    it('step 4: an ALLOW is scoped to its own action', async () => {
        getModPermissions.mockResolvedValue([allow('user-1', 'ban')]);

        await expect(requireModPermission(member(), 'kick')).rejects.toThrow();
    });

    it('step 5: the native Discord permission for the action passes', async () => {
        const banner = member({ native: PermissionsBitField.Flags.BanMembers });

        await expect(requireModPermission(banner, 'ban')).resolves.toBeUndefined();
    });

    it('step 5: a native permission for a different action does not pass', async () => {
        // KickMembers must not imply ban.
        const kicker = member({ native: PermissionsBitField.Flags.KickMembers });

        await expect(requireModPermission(kicker, 'ban')).rejects.toThrow();
    });

    it('step 6: a member with nothing is denied', async () => {
        await expect(requireModPermission(member(), 'ban')).rejects.toThrow();
    });
});

describe('requireModPermission — the actions that were unguarded', () => {
    // These six were reachable by any member through the prefix path. Each is
    // pinned to the Discord permission that should imply it, so the mapping
    // cannot be dropped without a test failing.
    const expected: Array<[string, bigint]> = [
        ['removecase', PermissionsBitField.Flags.ModerateMembers],
        ['case', PermissionsBitField.Flags.ModerateMembers],
        ['threshold', PermissionsBitField.Flags.ManageGuild],
        ['lockdown', PermissionsBitField.Flags.ManageChannels],
        ['slowmode', PermissionsBitField.Flags.ManageChannels]
    ];

    it.each(expected)('%s is denied to a member with no permissions', async (action) => {
        await expect(requireModPermission(member(), action as never)).rejects.toThrow();
    });

    it.each(expected)('%s is allowed by its native permission', async (action, flag) => {
        await expect(requireModPermission(member({ native: flag }), action as never)).resolves.toBeUndefined();
    });

    it('removing a case is not implied by being able to kick', async () => {
        const kicker = member({ native: PermissionsBitField.Flags.KickMembers });

        await expect(requireModPermission(kicker, 'removecase')).rejects.toThrow();
    });
});
