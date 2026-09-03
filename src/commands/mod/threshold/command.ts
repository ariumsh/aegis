import { Command, Args } from '@sapphire/framework';
import { ApplyOptions } from '@sapphire/decorators';
import { PermissionFlagsBits, Message } from 'discord.js';
import { AegisUserError } from '../../../lib/structures/Errors';
import modEn from '../../../lib/i18n/en-US/modcommands.json';
import modEs from '../../../lib/i18n/es-ES/modcommands.json';
import {
    executeAddThreshold,
    executeListThreshold,
    executeRemoveThreshold,
    normalizeAction,
    normalizeTrigger,
    parseAndValidateDuration
} from '../../../command-helpers/mod/threshold/core/service';

@ApplyOptions<Command.Options>({
    name: 'threshold',
    description: modEn.command.threshold.description,
})
export class ThresholdCommand extends Command {
    public override registerApplicationCommands(registry: Command.Registry) {
        registry.registerChatInputCommand((builder) =>
            builder
                .setName(this.name)
                .setDescription(this.description)
                .setDescriptionLocalizations({ 'es-ES': modEs.command.threshold.description })
                .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
                .addSubcommand(sub =>
                    sub
                        .setName('add')
                        .setDescription(modEn.command.threshold.subcommands.add)
                        .setDescriptionLocalizations({ 'es-ES': modEs.command.threshold.subcommands.add })
                        .addStringOption(opt => opt
                            .setName('trigger')
                            .setDescription(modEn.command.threshold.options.trigger)
                            .setDescriptionLocalizations({ 'es-ES': modEs.command.threshold.options.trigger })
                            .setRequired(true)
                            .addChoices(
                                { name: 'All Actions', value: 'all' },
                                { name: 'Warnings', value: 'warn' },
                                { name: 'Mutes', value: 'mute' },
                                { name: 'Timeouts', value: 'timeout' },
                                { name: 'Kicks', value: 'kick' },
                                { name: 'Bans', value: 'ban' },
                                { name: 'Temp Bans', value: 'tempban' },
                                { name: 'Soft Bans', value: 'softban' }
                            ))
                        .addIntegerOption(opt => opt
                            .setName('count')
                            .setDescription(modEn.command.threshold.options.count)
                            .setDescriptionLocalizations({ 'es-ES': modEs.command.threshold.options.count })
                            .setRequired(true)
                            .setMinValue(1)
                        )
                        .addStringOption(opt => opt
                            .setName('action')
                            .setDescription(modEn.command.threshold.options.action)
                            .setDescriptionLocalizations({ 'es-ES': modEs.command.threshold.options.action })
                            .setRequired(true)
                            .addChoices(
                                { name: 'Mute', value: 'mute' },
                                { name: 'Timeout', value: 'timeout' },
                                { name: 'Kick', value: 'kick' },
                                { name: 'Ban', value: 'ban' },
                                { name: 'Temp Ban', value: 'tempban' },
                                { name: 'Soft Ban', value: 'softban' }
                            ))
                        .addStringOption(opt => opt
                            .setName('duration')
                            .setDescription(modEn.command.threshold.options.duration)
                            .setDescriptionLocalizations({ 'es-ES': modEs.command.threshold.options.duration })
                        )
                )
                .addSubcommand(sub =>
                    sub
                        .setName('list')
                        .setDescription(modEn.command.threshold.subcommands.list)
                        .setDescriptionLocalizations({ 'es-ES': modEs.command.threshold.subcommands.list })
                        .addStringOption(opt => opt
                            .setName('trigger')
                            .setDescription(modEn.command.threshold.options.listTrigger)
                            .setDescriptionLocalizations({ 'es-ES': modEs.command.threshold.options.listTrigger })
                            .addChoices(
                                { name: 'All Branches', value: 'all' },
                                { name: 'Warnings', value: 'warn' },
                                { name: 'Mutes', value: 'mute' },
                                { name: 'Timeouts', value: 'timeout' },
                                { name: 'Kicks', value: 'kick' },
                                { name: 'Bans', value: 'ban' },
                                { name: 'Temp Bans', value: 'tempban' },
                                { name: 'Soft Bans', value: 'softban' }
                            ))
                )
                .addSubcommand(sub =>
                    sub
                        .setName('remove')
                        .setDescription(modEn.command.threshold.subcommands.remove)
                        .setDescriptionLocalizations({ 'es-ES': modEs.command.threshold.subcommands.remove })
                        .addIntegerOption(opt => opt
                            .setName('id')
                            .setDescription(modEn.command.threshold.options.id)
                            .setDescriptionLocalizations({ 'es-ES': modEs.command.threshold.options.id })
                            .setRequired(true)
                            .setMinValue(1)
                        )
                )
        );
    }

    public async chatInputRun(interaction: Command.ChatInputCommandInteraction) {
        const subcommand = interaction.options.getSubcommand(true);

        if (subcommand === 'add') {
            await interaction.deferReply();
            await this.handleAddSlash(interaction);
            return;
        }

        if (subcommand === 'list') {
            await interaction.deferReply();
            await this.handleListSlash(interaction);
            return;
        }

        if (subcommand === 'remove') {
            await interaction.deferReply();
            await this.handleRemoveSlash(interaction);
        }
    }

    public async messageRun(message: Message, args: Args) {
        const subcommand = (await args.pick('string').catch(() => null))?.toLowerCase();
        if (!subcommand) throw new AegisUserError('modcommands:mod.threshold.errors.subcommandRequired');

        if (subcommand === 'add') {
            await this.handleAddMessage(message, args);
            return;
        }

        if (subcommand === 'list') {
            await this.handleListMessage(message, args);
            return;
        }

        if (subcommand === 'remove') {
            await this.handleRemoveMessage(message, args);
            return;
        }

        throw new AegisUserError('modcommands:mod.threshold.errors.unknownSubcommand', undefined, { subcommand });
    }

    private async handleAddSlash(interaction: Command.ChatInputCommandInteraction) {
        const trigger = normalizeTrigger(interaction.options.getString('trigger', true));
        const count = interaction.options.getInteger('count', true);
        const action = normalizeAction(interaction.options.getString('action', true));
        const duration = parseAndValidateDuration(action, interaction.options.getString('duration'));

        const response = await executeAddThreshold({
            source: interaction,
            guildId: interaction.guildId!,
            trigger,
            count,
            action,
            duration
        });

        await interaction.editReply(response);
    }

    private async handleAddMessage(message: Message, args: Args) {
        const trigger = normalizeTrigger(await args.pick('string'));
        const count = await args.pick('integer').catch(() => {
            throw new AegisUserError('modcommands:mod.threshold.errors.invalidCount');
        });

        if (count < 1) throw new AegisUserError('modcommands:mod.threshold.errors.invalidCount');

        const action = normalizeAction(await args.pick('string'));
        const durationInput = await args.pick('string').catch(() => null);
        const duration = parseAndValidateDuration(action, durationInput);

        const response = await executeAddThreshold({
            source: message,
            guildId: message.guildId!,
            trigger,
            count,
            action,
            duration
        });

        await message.reply(response);
    }

    private async handleListSlash(interaction: Command.ChatInputCommandInteraction) {
        const triggerFilter = interaction.options.getString('trigger')?.toLowerCase() ?? null;

        const response = await executeListThreshold({
            source: interaction,
            guildId: interaction.guildId!,
            triggerFilter
        });

        await interaction.editReply(response);
    }

    private async handleListMessage(message: Message, args: Args) {
        const triggerFilter = (await args.pick('string').catch(() => null))?.toLowerCase() ?? null;

        const response = await executeListThreshold({
            source: message,
            guildId: message.guildId!,
            triggerFilter
        });

        await message.reply(response);
    }

    private async handleRemoveSlash(interaction: Command.ChatInputCommandInteraction) {
        const id = interaction.options.getInteger('id', true);

        const response = await executeRemoveThreshold({
            source: interaction,
            guildId: interaction.guildId!,
            id
        });

        await interaction.editReply(response);
    }

    private async handleRemoveMessage(message: Message, args: Args) {
        const id = await args.pick('integer').catch(() => {
            throw new AegisUserError('modcommands:mod.threshold.errors.invalidId');
        });

        const response = await executeRemoveThreshold({
            source: message,
            guildId: message.guildId!,
            id
        });

        await message.reply(response);
    }
}

