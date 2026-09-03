import { Subcommand } from '@sapphire/plugin-subcommands';
import { PermissionFlagsBits } from 'discord.js';
import { AegisUserError } from '../../../lib/structures/Errors';
import modulesEnUs from '../../../lib/i18n/en-US/modules.json';
import modulesEsEs from '../../../lib/i18n/es-ES/modules.json';
import {
    handleCounterSetup,
    handleDisable,
    handleEnable,
    handleModSetup,
    handleReset,
    handleSettings,
    handleTicketsSetup,
    handleVanitySetup,
    moduleChoices,
    moduleIds,
    moduleOptionName
} from '../../../command-helpers/config/module/core';

const moduleCommandLocales = {
    en: modulesEnUs.module.command,
    es: modulesEsEs.module.command
};

export class ModuleCommand extends Subcommand {
    public constructor(context: Subcommand.LoaderContext, options: Subcommand.Options) {
        super(context, {
            ...options,
            name: 'module',
            description: moduleCommandLocales.en.description,
            preconditions: ['GuildOnly'],
            subcommands: [
                { name: 'setup', chatInputRun: 'chatInputSetup' },
                { name: 'settings', chatInputRun: 'chatInputSettings' },
                { name: 'enable', chatInputRun: 'chatInputEnable' },
                { name: 'disable', chatInputRun: 'chatInputDisable' },
                { name: 'reset', chatInputRun: 'chatInputReset' }
            ]
        });
    }

    public override registerApplicationCommands(registry: Subcommand.Registry) {
        const withModuleOption = (sub: any, description: string, choices: readonly any[] = moduleChoices) =>
            sub.addStringOption((opt: any) =>
                opt
                    .setName(moduleOptionName)
                    .setDescription(description)
                        .setDescriptionLocalizations({ 'es-ES': moduleCommandLocales.es.options.moduleName })
                    .setRequired(true)
                    .addChoices(...choices)
            );

        registry.registerChatInputCommand((builder) =>
            builder
                .setName(this.name)
                .setDescription(this.description)
                .setDescriptionLocalizations({ 'es-ES': moduleCommandLocales.es.description })
                .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
                .addSubcommand((sub) =>
                    withModuleOption(
                        sub
                            .setName('setup')
                            .setDescription(moduleCommandLocales.en.subcommands.setup)
                            .setDescriptionLocalizations({ 'es-ES': moduleCommandLocales.es.subcommands.setup }),
                        moduleCommandLocales.en.options.moduleNameSetup
                    )
                )
                .addSubcommand((sub) =>
                    withModuleOption(
                        sub
                            .setName('settings')
                            .setDescription(moduleCommandLocales.en.subcommands.settings)
                            .setDescriptionLocalizations({ 'es-ES': moduleCommandLocales.es.subcommands.settings }),
                        moduleCommandLocales.en.options.moduleName
                    )
                )
                .addSubcommand((sub) =>
                    withModuleOption(
                        sub
                            .setName('enable')
                            .setDescription(moduleCommandLocales.en.subcommands.enable)
                            .setDescriptionLocalizations({ 'es-ES': moduleCommandLocales.es.subcommands.enable }),
                        moduleCommandLocales.en.options.moduleName
                    )
                )
                .addSubcommand((sub) =>
                    withModuleOption(
                        sub
                            .setName('disable')
                            .setDescription(moduleCommandLocales.en.subcommands.disable)
                            .setDescriptionLocalizations({ 'es-ES': moduleCommandLocales.es.subcommands.disable }),
                        moduleCommandLocales.en.options.moduleName
                    )
                )
                .addSubcommand((sub) =>
                    withModuleOption(
                        sub
                            .setName('reset')
                            .setDescription(moduleCommandLocales.en.subcommands.reset)
                            .setDescriptionLocalizations({ 'es-ES': moduleCommandLocales.es.subcommands.reset }),
                        moduleCommandLocales.en.options.moduleName
                    )
                )
        );
    }

    public async chatInputSetup(interaction: Subcommand.ChatInputCommandInteraction) {
        const moduleValue = interaction.options.getString(moduleOptionName, true);

        if (moduleValue === moduleIds.vanity) return handleVanitySetup(interaction);
        if (moduleValue === moduleIds.mod) return handleModSetup(interaction);
        if (moduleValue === moduleIds.tickets) return handleTicketsSetup(interaction);
        if (moduleValue === moduleIds.counter) return handleCounterSetup(interaction);

        throw new AegisUserError('errors:unexpected');
    }

    public async chatInputSettings(interaction: Subcommand.ChatInputCommandInteraction) {
        return handleSettings(interaction);
    }

    public async chatInputEnable(interaction: Subcommand.ChatInputCommandInteraction) {
        return handleEnable(interaction);
    }

    public async chatInputDisable(interaction: Subcommand.ChatInputCommandInteraction) {
        return handleDisable(interaction);
    }

    public async chatInputReset(interaction: Subcommand.ChatInputCommandInteraction) {
        return handleReset(interaction);
    }
}

