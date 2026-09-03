import { Subcommand } from '@sapphire/plugin-subcommands';
import { ApplyOptions } from '@sapphire/decorators';
import { GuildMember, PermissionFlagsBits } from 'discord.js';
import { resolveKey } from '@sapphire/plugin-i18next';
import modEn from '../../../lib/i18n/en-US/modcommands.json';
import modEs from '../../../lib/i18n/es-ES/modcommands.json';
import { getMessageLayout } from '../../../lib/layouts/defaultLayout.js';
import { prisma } from '../../../database/db.js';
import {
    executePermsAllow,
    executePermsDeny,
    executePermsDelete,
    executePermsList,
} from '../../../command-helpers/mod/perms/core/service.js';

const ACTION_CHOICES = [
    { name: 'Ban',         value: 'ban'        },
    { name: 'Kick',        value: 'kick'       },
    { name: 'Warn',        value: 'warn'       },
    { name: 'Mute',        value: 'mute'       },
    { name: 'Timeout',     value: 'timeout'    },
    { name: 'Softban',     value: 'softban'    },
    { name: 'Tempban',     value: 'tempban'    },
    { name: 'Silent Ban',  value: 'silentban'  },
    { name: 'Unban',       value: 'unban'      },
    { name: 'Unmute',      value: 'unmute'     },
    { name: 'Un-timeout',  value: 'untimeout'  },
    { name: 'Lockdown',    value: 'lockdown'   },
    { name: 'Slowmode',    value: 'slowmode'   },
    { name: 'Cases',       value: 'case'       },
    { name: 'Remove Case', value: 'removecase' },
    { name: 'Threshold',   value: 'threshold'  },
    { name: 'User Info',   value: 'user'       },
    { name: 'History',     value: 'history'    },
] as const;

@ApplyOptions<Subcommand.Options>({
    name: 'permission',
    description: modEn.command.perms.description,
    preconditions: ['GuildOnly'],
    subcommands: [
        { name: 'allow',  chatInputRun: 'chatInputAllow'  },
        { name: 'deny',   chatInputRun: 'chatInputDeny'   },
        { name: 'reset', chatInputRun: 'chatInputReset' },
        { name: 'list',   chatInputRun: 'chatInputList'   },
    ],
})
export class PermsCommand extends Subcommand {
    public override registerApplicationCommands(registry: Subcommand.Registry) {
        registry.registerChatInputCommand((builder) =>
            builder
                .setName(this.name)
                .setDescription(this.description)
                .setDescriptionLocalizations({ 'es-ES': modEs.command.perms.description })
                .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
                // allow ──────────
                .addSubcommand((sub) =>
                    sub
                        .setName('allow')
                        .setDescription(modEn.command.perms.subcommands.allow)
                        .setDescriptionLocalizations({ 'es-ES': modEs.command.perms.subcommands.allow })
                        .addRoleOption((o) => o.setName('role').setDescription(modEn.command.perms.options.role).setDescriptionLocalizations({ 'es-ES': modEs.command.perms.options.role }))
                        .addUserOption((o) => o.setName('user').setDescription(modEn.command.perms.options.user).setDescriptionLocalizations({ 'es-ES': modEs.command.perms.options.user }))
                        .addStringOption((o) =>
                            o.setName('action')
                                .setDescription(modEn.command.perms.options.action)
                                .setDescriptionLocalizations({ 'es-ES': modEs.command.perms.options.action })
                                .addChoices(...ACTION_CHOICES)
                        )
                )
                // deny ──────────
                .addSubcommand((sub) =>
                    sub
                        .setName('deny')
                        .setDescription(modEn.command.perms.subcommands.deny)
                        .setDescriptionLocalizations({ 'es-ES': modEs.command.perms.subcommands.deny })
                        .addRoleOption((o) => o.setName('role').setDescription(modEn.command.perms.options.role).setDescriptionLocalizations({ 'es-ES': modEs.command.perms.options.role }))
                        .addUserOption((o) => o.setName('user').setDescription(modEn.command.perms.options.user).setDescriptionLocalizations({ 'es-ES': modEs.command.perms.options.user }))
                        .addStringOption((o) =>
                            o.setName('action')
                                .setDescription(modEn.command.perms.options.action)
                                .setDescriptionLocalizations({ 'es-ES': modEs.command.perms.options.action })
                                .addChoices(...ACTION_CHOICES)
                        )
                )
                // reset ──────────
                .addSubcommand((sub) =>
                    sub
                        .setName('reset')
                        .setDescription(modEn.command.perms.subcommands.reset)
                        .setDescriptionLocalizations({ 'es-ES': modEs.command.perms.subcommands.reset })
                        .addRoleOption((o) => o.setName('role').setDescription(modEn.command.perms.options.role).setDescriptionLocalizations({ 'es-ES': modEs.command.perms.options.role }))
                        .addUserOption((o) => o.setName('user').setDescription(modEn.command.perms.options.user).setDescriptionLocalizations({ 'es-ES': modEs.command.perms.options.user }))
                        .addStringOption((o) =>
                            o.setName('action')
                                .setDescription(modEn.command.perms.options.action)
                                .setDescriptionLocalizations({ 'es-ES': modEs.command.perms.options.action })
                                .setAutocomplete(true)
                        )
                )
                // list ──────────
                .addSubcommand((sub) =>
                    sub
                        .setName('list')
                        .setDescription(modEn.command.perms.subcommands.list)
                        .setDescriptionLocalizations({ 'es-ES': modEs.command.perms.subcommands.list })
                        .addRoleOption((o) => o.setName('role').setDescription(modEn.command.perms.options.role).setDescriptionLocalizations({ 'es-ES': modEs.command.perms.options.role }))
                        .addUserOption((o) => o.setName('user').setDescription(modEn.command.perms.options.user).setDescriptionLocalizations({ 'es-ES': modEs.command.perms.options.user }))
                )
        );
    }

    public override async autocompleteRun(interaction: Subcommand.AutocompleteInteraction) {
        const focused = interaction.options.getFocused(true);
        if (focused.name !== 'action') return interaction.respond([]);

        const role   = (interaction.options as any).getRole('role');
        const user   = (interaction.options as any).getMember('user') ?? (interaction.options as any).getUser('user');
        const targetId = role?.id ?? (user as any)?.id ?? null;

        if (!targetId) return interaction.respond([]);

        const perms = await prisma.modPermission.findMany({
            where:  { guildId: interaction.guildId!, targetId, type: 'ALLOW' },
            select: { action: true },
            orderBy: { action: 'asc' },
        }).catch(() => []);

        const typed = focused.value.toLowerCase();
        const choices = perms
            .filter(p => p.action.includes(typed))
            .map(p => ({ name: p.action, value: p.action }));

        return interaction.respond(choices);
    }

    private async rejectBothTargets(interaction: Subcommand.ChatInputCommandInteraction): Promise<boolean> {
        const role   = interaction.options.getRole('role');
        const member = interaction.options.getMember('user');
        if (role && member) {
            const msg = await resolveKey(interaction, 'modcommands:perms.errors.bothTargets');
            await interaction.reply({ ...getMessageLayout(msg), flags: ['Ephemeral', 'IsComponentsV2'] });
            return true;
        }
        return false;
    }

    public async chatInputAllow(interaction: Subcommand.ChatInputCommandInteraction) {
        if (await this.rejectBothTargets(interaction)) return;
        await interaction.deferReply({ flags: 64 });
        const role   = interaction.options.getRole('role');
        const member = interaction.options.getMember('user') as GuildMember | null;
        const action = interaction.options.getString('action') ?? undefined;
        return executePermsAllow({ interaction, guildId: interaction.guildId!, role, member, action });
    }

    public async chatInputDeny(interaction: Subcommand.ChatInputCommandInteraction) {
        if (await this.rejectBothTargets(interaction)) return;
        await interaction.deferReply({ flags: 64 });
        const role   = interaction.options.getRole('role');
        const member = interaction.options.getMember('user') as GuildMember | null;
        const action = interaction.options.getString('action') ?? undefined;
        return executePermsDeny({ interaction, guildId: interaction.guildId!, role, member, action });
    }

    public async chatInputReset(interaction: Subcommand.ChatInputCommandInteraction) {
        if (await this.rejectBothTargets(interaction)) return;
        await interaction.deferReply({ flags: 64 });
        const role   = interaction.options.getRole('role');
        const member = interaction.options.getMember('user') as GuildMember | null;
        const action = interaction.options.getString('action') ?? undefined;
        return executePermsDelete({ interaction, guildId: interaction.guildId!, role, member, action });
    }

    public async chatInputList(interaction: Subcommand.ChatInputCommandInteraction) {
        if (await this.rejectBothTargets(interaction)) return;
        await interaction.deferReply({ flags: 64 });
        const role   = interaction.options.getRole('role');
        const member = interaction.options.getMember('user') as GuildMember | null;
        return executePermsList({ interaction, guildId: interaction.guildId!, role, member });
    }
}
