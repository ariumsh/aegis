import { Command } from '@sapphire/framework';
import { resolveKey } from '@sapphire/plugin-i18next';
import { PermissionFlagsBits } from 'discord.js';
import { getMessageLayout } from '../../../lib/layouts/defaultLayout';
import { Emojis } from '../../../lib/constants/emojis';
import modulesEnUs from '../../../lib/i18n/en-US/modules.json';
import modulesEsEs from '../../../lib/i18n/es-ES/modules.json';
import { isPrefixValid, prefixMaxLength, prefixOptionDescription, prefixOptionName, setGuildPrefix } from '../../../command-helpers/config/prefix/core';

const prefixCommandLocales = {
    en: modulesEnUs.config.prefix.command,
    es: modulesEsEs.config.prefix.command
};

const prefixOptionLocales = {
    en: modulesEnUs.config.prefix.optionDescription,
    es: modulesEsEs.config.prefix.optionDescription
};

export class PrefixCommand extends Command {
    public constructor(context: Command.LoaderContext, options: Command.Options) {
        super(context, {
            ...options,
            name: 'prefix',
            description: prefixCommandLocales.en.description,
            preconditions: ['GuildOnly']
        });
    }

    public override registerApplicationCommands(registry: Command.Registry) {
        registry.registerChatInputCommand((builder) =>
            builder
                .setName(this.name)
                .setDescription(this.description)
                .setDescriptionLocalizations({ 'es-ES': prefixCommandLocales.es.description })
                .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
                .addStringOption((option) =>
                    option
                        .setName(prefixOptionName)
                        .setDescription(prefixOptionDescription)
                        .setDescriptionLocalizations({ 'es-ES': prefixOptionLocales.es })
                        .setRequired(true)
                        .setMaxLength(prefixMaxLength)
                )
        );
    }

    public async chatInputRun(interaction: Command.ChatInputCommandInteraction) {
        const { guildId } = interaction;
        const newPrefix = interaction.options.getString(prefixOptionName, true).trim();

        if (!isPrefixValid(newPrefix)) {
            const errorMsg = await resolveKey(interaction, 'modules:config.prefix.invalid');
            return interaction.reply({ ...getMessageLayout(`${Emojis.cross_emoji} ${errorMsg}`), flags: ['Ephemeral', 'IsComponentsV2'] });
        }

        await interaction.deferReply();
        return setGuildPrefix(interaction, guildId!, newPrefix);
    }
}

