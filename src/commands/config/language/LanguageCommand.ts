import { Args, Command } from '@sapphire/framework';
import { PermissionFlagsBits, Message } from 'discord.js';
import { AegisUserError } from '../../../lib/structures/Errors';
import { requireGuildAdmin } from '../../../command-helpers/mod/shared/permissionGuard';
import modulesEnUs from '../../../lib/i18n/en-US/modules.json';
import modulesEsEs from '../../../lib/i18n/es-ES/modules.json';
import {
    acceptedLanguageInputs,
    languageChoices,
    languageOptionDescription,
    languageOptionName,
    normalizeLocale,
    setGuildLanguage
} from '../../../command-helpers/config/language/core';

const languageCommandLocales = {
    en: modulesEnUs.config.language.command,
    es: modulesEsEs.config.language.command
};

const languageOptionLocales = {
    en: modulesEnUs.config.language.optionDescription,
    es: modulesEsEs.config.language.optionDescription
};

export class LanguageCommand extends Command {
    public constructor(context: Command.LoaderContext, options: Command.Options) {
        super(context, {
            ...options,
            name: 'language',
            aliases: ['lang'],
            description: languageCommandLocales.en.description,
            preconditions: ['GuildOnly'],
            runIn: ['GUILD_ANY']
        });
    }

    public override registerApplicationCommands(registry: Command.Registry) {
        registry.registerChatInputCommand((builder) =>
            builder
                .setName(this.name)
                .setDescription(this.description)
                .setDescriptionLocalizations({ 'es-ES': languageCommandLocales.es.description })
                .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
                .addStringOption((option) =>
                    option
                    .setName(languageOptionName)
                    .setDescription(languageOptionDescription)
                    .setDescriptionLocalizations({ 'es-ES': languageOptionLocales.es })
                        .setRequired(true)
                        .addChoices(...languageChoices)
                )
        );
    }

    public override async chatInputRun(interaction: Command.ChatInputCommandInteraction) {
        await interaction.deferReply();

        const guildId = interaction.guildId!;
        const newLocale = interaction.options.getString(languageOptionName, true);

        return setGuildLanguage(interaction, guildId, newLocale);
    }

    public override async messageRun(message: Message, args: Args) {
        await requireGuildAdmin(message);

        const newLocaleInput = await args.pick('string').catch(() => {
            throw new AegisUserError('modules:config.language.invalid');
        });

        if (!acceptedLanguageInputs.includes(newLocaleInput as (typeof acceptedLanguageInputs)[number])) {
            throw new AegisUserError('modules:config.language.invalid');
        }

        const normalizedLocale = normalizeLocale(newLocaleInput);
        return setGuildLanguage(message, message.guildId!, normalizedLocale);
    }
}

