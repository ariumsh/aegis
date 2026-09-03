import { Command, Args } from '@sapphire/framework';
import { ApplyOptions } from '@sapphire/decorators';
import { PermissionFlagsBits, Message, TextChannel } from 'discord.js';
import { resolveKey } from '@sapphire/plugin-i18next';
import { requireModConfig, parseSlowmode, formatSeconds } from '../../../lib/utils/ModUtils';
import { Emojis } from '../../../lib/constants/emojis';
import { ContainerComponent, TextDisplayComponent } from '../../../lib/layouts/ui';
import { AegisUserError } from '../../../lib/structures/Errors';
import modEn from '../../../lib/i18n/en-US/modcommands.json';
import modEs from '../../../lib/i18n/es-ES/modcommands.json';
import { requireModPermissionFrom } from '../../../command-helpers/mod/shared/permissionGuard';

@ApplyOptions<Command.Options>({
    name: 'slowmode',
    description: modEn.command.slowmode.description,
})
export class SlowmodeCommand extends Command {
    public readonly usage = 'modcommands:mod.usage.slowmode';

    private async executeSlowmode(data: {
        source: Command.ChatInputCommandInteraction | Message;
        guildId: string;
        currentChannelId: string;
        targetChannel: TextChannel;
        durationInput: string;
    }) {
        const { source, guildId, currentChannelId, targetChannel, durationInput } = data;

        await requireModPermissionFrom(source, 'slowmode');
        await requireModConfig(guildId);

        let seconds = parseSlowmode(durationInput);
        if (seconds === null) throw new AegisUserError('errors:mod_invalidDuration');

        let capped = false;
        if (seconds > 21600) {
            seconds = 21600;
            capped = true;
        }

        await targetChannel.setRateLimitPerUser(seconds);

        const isRemote = targetChannel.id !== currentChannelId;
        let successMsg: string;
        let remoteMsg = '';

        if (seconds === 0) {
            if (isRemote) {
                successMsg = await resolveKey(source, 'modcommands:sanctions.confirmations.slowmode_disabled_remote', { channel: targetChannel.toString() });
                remoteMsg = await resolveKey(source, 'modcommands:sanctions.confirmations.slowmode_disabled');
            } else {
                successMsg = await resolveKey(source, 'modcommands:sanctions.confirmations.slowmode_disabled');
            }
        } else {
            const timeStr = formatSeconds(seconds);
            if (isRemote) {
                successMsg = await resolveKey(source, 'modcommands:sanctions.confirmations.slowmode_remote', { time: timeStr, channel: targetChannel.toString() });
                remoteMsg = await resolveKey(source, 'modcommands:sanctions.confirmations.slowmode', { time: timeStr });
            } else {
                successMsg = await resolveKey(source, 'modcommands:sanctions.confirmations.slowmode', { time: timeStr });
            }
        }

        if (isRemote && remoteMsg) {
            await targetChannel.send({ flags: 32768, components: [ContainerComponent([TextDisplayComponent(`${Emojis.slowmode_emoji} ${remoteMsg}`)])] }).catch(() => null);
        }

        const warningMsg = capped
            ? `${Emojis.warning_emoji} ${await resolveKey(source, 'modcommands:sanctions.confirmations.slowmode_cap')}`
            : null;

        return {
            response: { flags: 32768, components: [ContainerComponent([TextDisplayComponent(`${Emojis.slowmode_emoji} ${successMsg}`)])] },
            warningMsg
        };
    }

    public override registerApplicationCommands(registry: Command.Registry) {
        registry.registerChatInputCommand((builder) =>
            builder
                .setName(this.name)
                .setDescription(this.description)
                .setDescriptionLocalizations({ 'es-ES': modEs.command.slowmode.description })
                .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
                .addStringOption(opt => opt.setName('duration').setDescription(modEn.command.slowmode.options.duration).setDescriptionLocalizations({ 'es-ES': modEs.command.slowmode.options.duration }).setRequired(true))
                .addChannelOption(opt => opt.setName('channel').setDescription(modEn.command.slowmode.options.channel).setDescriptionLocalizations({ 'es-ES': modEs.command.slowmode.options.channel }))
        );
    }

    public async chatInputRun(interaction: Command.ChatInputCommandInteraction) {
        const durationInput = interaction.options.getString('duration', true);
        const targetChannel = interaction.options.getChannel('channel') ?? interaction.channel;

        await interaction.deferReply();

        if (!interaction.guild) throw new AegisUserError('errors:unexpected');
        if (!targetChannel || !('setRateLimitPerUser' in targetChannel)) throw new AegisUserError('errors:unexpected');

        const { response, warningMsg } = await this.executeSlowmode({
            source: interaction,
            guildId: interaction.guildId!,
            currentChannelId: interaction.channelId,
            targetChannel: targetChannel as TextChannel,
            durationInput
        });

        await interaction.editReply(response);

        if (warningMsg) {
            await interaction.followUp({ flags: ['Ephemeral', 'IsComponentsV2'], components: [ContainerComponent([TextDisplayComponent(warningMsg)])] });
        }

        return;
    }

    public async messageRun(message: Message, args: Args) {
        const durationInput = await args.pick('string').catch(() => { throw new AegisUserError('errors:mod_invalidDuration'); });
        const targetChannel = await args.pick('guildTextChannel').catch(() => message.channel as TextChannel);

        if (!message.guild) throw new AegisUserError('errors:unexpected');

        if (!targetChannel || !('setRateLimitPerUser' in targetChannel)) throw new AegisUserError('errors:unexpected');

        const { response, warningMsg } = await this.executeSlowmode({
            source: message,
            guildId: message.guildId!,
            currentChannelId: message.channelId,
            targetChannel,
            durationInput
        });

        await message.reply(response);

        if (warningMsg && 'send' in message.channel) {
            await (message.channel as TextChannel).send({ flags: 32768, components: [ContainerComponent([TextDisplayComponent(warningMsg)])] });
        }

        return;
    }
}
