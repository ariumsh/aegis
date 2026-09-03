import { Subcommand } from '@sapphire/plugin-subcommands';
import { ApplyOptions } from '@sapphire/decorators';
import { GuildMember, PermissionFlagsBits } from 'discord.js';
import { resolveKey } from '@sapphire/plugin-i18next';
import { addSilentBan, removeSilentBan, listSilentBans } from '../../../services/SilentBanService';
import { getSilentBanLayout } from '../../../lib/layouts/modCommandLayouts';
import { Emojis } from '../../../lib/constants/emojis';
import { AegisUserError } from '../../../lib/structures/Errors';
import modEn from '../../../lib/i18n/en-US/modcommands.json';
import modEs from '../../../lib/i18n/es-ES/modcommands.json';
import { requireModPermission } from '../../../command-helpers/mod/shared/permissionGuard';
import { validateMod } from '../../../lib/utils/ModUtils';


// Constants ──────────────────

const DURATION_MAP: Record<string, number> = {
    '30m': 30 * 60 * 1000,
    '1h':   1 * 60 * 60 * 1000,
    '6h':   6 * 60 * 60 * 1000,
    '1d':  24 * 60 * 60 * 1000,
    '7d':   7 * 24 * 60 * 60 * 1000,
    '30d': 30 * 24 * 60 * 60 * 1000,
};


// Silentban command ──────────────────

@ApplyOptions<Subcommand.Options>({
    name: 'silentban',
    description: modEn.command.silentban.description,
    preconditions: ['GuildOnly'],
    subcommands: [
        { name: 'add',    chatInputRun: 'chatInputAdd'    },
        { name: 'remove', chatInputRun: 'chatInputRemove' },
        { name: 'list',   chatInputRun: 'chatInputList'   }
    ]
})
export class SilentBanCommand extends Subcommand {
    public override registerApplicationCommands(registry: Subcommand.Registry) {
        registry.registerChatInputCommand((builder) =>
            builder
                .setName(this.name)
                .setDescription(this.description)
                .setDescriptionLocalizations({ 'es-ES': modEs.command.silentban.description })
                .setDefaultMemberPermissions(0n)
                .addSubcommand((sub) =>
                    sub
                        .setName('add')
                        .setDescription(modEn.command.silentban.subcommands.add)
                        .setDescriptionLocalizations({ 'es-ES': modEs.command.silentban.subcommands.add })
                        .addUserOption((opt) => opt.setName('user').setDescription(modEn.command.silentban.options.user).setDescriptionLocalizations({ 'es-ES': modEs.command.silentban.options.user }).setRequired(true))
                        .addStringOption((opt) =>
                            opt
                                .setName('duration')
                                .setDescription(modEn.command.silentban.options.duration)
                                .setDescriptionLocalizations({ 'es-ES': modEs.command.silentban.options.duration })
                                .addChoices(
                                    { name: '30 minutes', value: '30m' },
                                    { name: '1 hour',     value: '1h'  },
                                    { name: '6 hours',    value: '6h'  },
                                    { name: '1 day',      value: '1d'  },
                                    { name: '7 days',     value: '7d'  },
                                    { name: '30 days',    value: '30d' }
                                )
                        )
                        .addStringOption((opt) => opt.setName('reason').setDescription(modEn.command.silentban.options.reason).setDescriptionLocalizations({ 'es-ES': modEs.command.silentban.options.reason }))
                )
                .addSubcommand((sub) =>
                    sub
                        .setName('remove')
                        .setDescription(modEn.command.silentban.subcommands.remove)
                        .setDescriptionLocalizations({ 'es-ES': modEs.command.silentban.subcommands.remove })
                        .addUserOption((opt) => opt.setName('user').setDescription(modEn.command.silentban.options.removeUser).setDescriptionLocalizations({ 'es-ES': modEs.command.silentban.options.removeUser }).setRequired(true))
                )
                .addSubcommand((sub) => sub
                    .setName('list')
                    .setDescription(modEn.command.silentban.subcommands.list)
                    .setDescriptionLocalizations({ 'es-ES': modEs.command.silentban.subcommands.list }))
        );
    }


    // Add ──────────

    public async chatInputAdd(interaction: Subcommand.ChatInputCommandInteraction) {
        await requireModPermission(interaction.member as GuildMember, 'silentban');
        await interaction.deferReply();

        const target   = interaction.options.getUser('user', true);
        const duration = interaction.options.getString('duration');
        const reason   = interaction.options.getString('reason')?.slice(0, 500) ?? null;

        if (target.id === interaction.user.id) throw new AegisUserError('modcommands:mod.silentban.self');
        if (target.bot) throw new AegisUserError('modcommands:mod.silentban.bot');

        // Every other sanctioning command runs validateMod, which blocks acting
        // on someone whose highest role is at or above the invoker's. Without it
        // a moderator holding only a silentban ALLOW override could sanction
        // administrators and the guild owner.
        //
        // Resolved leniently: a silent ban may legitimately be placed on a user
        // who is not currently in the guild, and there is no hierarchy to check
        // in that case.
        const targetMember = await interaction.guild?.members.fetch(target.id).catch(() => null);
        if (targetMember) await validateMod(interaction, targetMember);

        const durationMs = duration ? DURATION_MAP[duration] : null;

        const ban = await addSilentBan(interaction.guildId!, target.id, interaction.user.id, reason, durationMs);
        const permanentLabel = await resolveKey(interaction, 'modcommands:mod.mute.permanent');
        return interaction.editReply(getSilentBanLayout('add', { userTag: target.username, duration: duration ?? permanentLabel, reason, caseNumber: ban.caseNumber }));
    }


    // Remove ──────────

    public async chatInputRemove(interaction: Subcommand.ChatInputCommandInteraction) {
        await requireModPermission(interaction.member as GuildMember, 'silentban');
        await interaction.deferReply();
        const target = interaction.options.getUser('user', true);

        await removeSilentBan(interaction.guildId!, target.id);
        return interaction.editReply(getSilentBanLayout('remove', { userTag: target.username }));
    }


    // List ──────────

    public async chatInputList(interaction: Subcommand.ChatInputCommandInteraction) {
        await requireModPermission(interaction.member as GuildMember, 'silentban');
        await interaction.deferReply();

        const bans = await listSilentBans(interaction.guildId!);
        if (bans.length === 0) throw new AegisUserError('modcommands:mod.silentban.noBans');

        // formatExpiry is async, so interpolating it directly rendered
        // "[object Promise]" on every row. Resolved together rather than one
        // at a time: the permanent case goes through i18n.
        const listText = (
            await Promise.all(
                bans.map(async (ban) =>
                    `${Emojis.bullet_emoji} <@${ban.userId}> › expires ${await this.formatExpiry(ban.expiresAt, interaction)}`
                )
            )
        ).join('\n');

        return interaction.editReply(getSilentBanLayout('list', { count: bans.length, listText }));
    }


    // Formats a date as a Discord timestamp ──────────

    private async formatExpiry(date: Date | null, interaction: Subcommand.ChatInputCommandInteraction) {
        if (!date) return resolveKey(interaction, 'modcommands:mod.silentban.never');
        return `<t:${Math.floor(date.getTime() / 1000)}:R>`;
    }
}

