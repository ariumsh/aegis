import { Command } from '@sapphire/framework';
import { PermissionFlagsBits } from 'discord.js';
import modulesEnUs from '../../../lib/i18n/en-US/modules.json';
import modulesEsEs from '../../../lib/i18n/es-ES/modules.json';
import { mentionOptionName, mentionMaxLength, mentionOptionDescription, setMentionResponse } from '../../../command-helpers/config/mention/core';

const mentionCommandLocales = {
    en: modulesEnUs.config.mention.command,
    es: modulesEsEs.config.mention.command
};

const mentionOptionLocales = {
    en: modulesEnUs.config.mention.optionDescription,
    es: modulesEsEs.config.mention.optionDescription
};

export class MentionCommand extends Command {
    public constructor(context: Command.LoaderContext, options: Command.Options) {
        super(context, {
            ...options,
            name: 'mention',
            description: mentionCommandLocales.en.description,
            preconditions: ['GuildOnly']
        });
    }

    public override registerApplicationCommands(registry: Command.Registry) {
        registry.registerChatInputCommand((builder) =>
            builder
                .setName(this.name)
                .setDescription(this.description)
                .setDescriptionLocalizations({ 'es-ES': mentionCommandLocales.es.description })
                .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
                .addStringOption((option) =>
                    option
                        .setName(mentionOptionName)
                        .setDescription(mentionOptionLocales.en)
                        .setDescriptionLocalizations({ 'es-ES': mentionOptionLocales.es })
                        .setRequired(false)
                        .setMaxLength(mentionMaxLength)
                )
        );
    }

    public override async chatInputRun(interaction: Command.ChatInputCommandInteraction) {
        await interaction.deferReply();

        const guildId = interaction.guildId!;
        const text = interaction.options.getString(mentionOptionName)?.trim() || null;

        return setMentionResponse(interaction, guildId, text);
    }
}
