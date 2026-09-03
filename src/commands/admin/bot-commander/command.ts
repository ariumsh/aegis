import { Subcommand } from '@sapphire/plugin-subcommands';
import { ApplyOptions } from '@sapphire/decorators';
import { GuildMember, PermissionFlagsBits } from 'discord.js';
import adminEn from '../../../lib/i18n/en-US/admincommands.json';
import adminEs from '../../../lib/i18n/es-ES/admincommands.json';
import {
    executeBotCommanderAllow,
    executeBotCommanderRemove,
} from '../../../command-helpers/admin/bot-commander/core/service.js';

@ApplyOptions<Subcommand.Options>({
    name: 'bot-commander',
    description: adminEn.command.botCommander.description,
    preconditions: ['GuildOnly'],
    subcommands: [
        { name: 'allow',  chatInputRun: 'chatInputAllow'  },
        { name: 'remove', chatInputRun: 'chatInputRemove' },
    ],
})
export class BotCommanderCommand extends Subcommand {
    public override registerApplicationCommands(registry: Subcommand.Registry) {
        registry.registerChatInputCommand(
            (builder) =>
                builder
                    .setName(this.name)
                    .setDescription(this.description)
                    .setDescriptionLocalizations({ 'es-ES': adminEs.command.botCommander.description })
                    // Discord enforces this: only real Administrators can run this command.
                    // Bot Commanders themselves cannot elevate others — Discord blocks them at the API level.
                    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
                    // allow ──────────
                    .addSubcommand((sub) =>
                        sub
                            .setName('allow')
                            .setDescription(adminEn.command.botCommander.subcommands.allow)
                            .setDescriptionLocalizations({ 'es-ES': adminEs.command.botCommander.subcommands.allow })
                            .addRoleOption((o) =>
                                o
                                    .setName('role')
                                    .setDescription(adminEn.command.botCommander.options.role)
                                    .setDescriptionLocalizations({ 'es-ES': adminEs.command.botCommander.options.role })
                            )
                            .addUserOption((o) =>
                                o
                                    .setName('member')
                                    .setDescription(adminEn.command.botCommander.options.member)
                                    .setDescriptionLocalizations({ 'es-ES': adminEs.command.botCommander.options.member })
                            )
                    )
                    // remove ──────────
                    .addSubcommand((sub) =>
                        sub
                            .setName('remove')
                            .setDescription(adminEn.command.botCommander.subcommands.remove)
                            .setDescriptionLocalizations({ 'es-ES': adminEs.command.botCommander.subcommands.remove })
                            .addRoleOption((o) =>
                                o
                                    .setName('role')
                                    .setDescription(adminEn.command.botCommander.options.role)
                                    .setDescriptionLocalizations({ 'es-ES': adminEs.command.botCommander.options.role })
                            )
                            .addUserOption((o) =>
                                o
                                    .setName('member')
                                    .setDescription(adminEn.command.botCommander.options.member)
                                    .setDescriptionLocalizations({ 'es-ES': adminEs.command.botCommander.options.member })
                            )
                    )
        );
    }

    public async chatInputAllow(interaction: Subcommand.ChatInputCommandInteraction) {
        await interaction.deferReply({ flags: 64 });
        const role   = interaction.options.getRole('role');
        const member = interaction.options.getMember('member') as GuildMember | null;
        return executeBotCommanderAllow({ interaction, guildId: interaction.guildId!, role, member });
    }

    public async chatInputRemove(interaction: Subcommand.ChatInputCommandInteraction) {
        await interaction.deferReply({ flags: 64 });
        const role   = interaction.options.getRole('role');
        const member = interaction.options.getMember('member') as GuildMember | null;
        return executeBotCommanderRemove({ interaction, guildId: interaction.guildId!, role, member });
    }
}
