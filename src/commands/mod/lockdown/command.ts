import { Command, Args } from '@sapphire/framework';
import { ApplyOptions } from '@sapphire/decorators';
import { PermissionFlagsBits, Message, TextChannel, NewsChannel } from 'discord.js';
import { resolveKey } from '@sapphire/plugin-i18next';
import { requireModConfig } from '../../../lib/utils/ModUtils';
import { Emojis } from '../../../lib/constants/emojis';
import { ContainerComponent, TextDisplayComponent } from '../../../lib/layouts/ui';
import { AegisUserError } from '../../../lib/structures/Errors';
import modEn from '../../../lib/i18n/en-US/modcommands.json';
import modEs from '../../../lib/i18n/es-ES/modcommands.json';
import { requireModPermissionFrom } from '../../../command-helpers/mod/shared/permissionGuard';

@ApplyOptions<Command.Options>({
    name: 'lockdown',
    description: modEn.command.lockdown.description,
})
export class LockdownCommand extends Command {
    private async executeLockdown(data: {
        source: Command.ChatInputCommandInteraction | Message;
        guildId: string;
        currentChannelId: string;
        targetChannel: TextChannel | NewsChannel;
    }) {
        const { source, guildId, currentChannelId, targetChannel } = data;

        await requireModPermissionFrom(source, 'lockdown');
        await requireModConfig(guildId);

        const isLocked = targetChannel.permissionOverwrites.cache.get(guildId)?.deny.has(PermissionFlagsBits.SendMessages);
        const isRemote = targetChannel.id !== currentChannelId;

        let content: string;
        let remoteContent = '';

        if (isLocked) {
            await targetChannel.permissionOverwrites.edit(guildId, { SendMessages: null }, { reason: 'Manual Unlock' });

            if (isRemote) {
                content = `${Emojis.channel_unlocked_emoji} ${await resolveKey(source, 'modcommands:sanctions.confirmations.unlockdown_remote', { channel: targetChannel.toString() })}`;
                remoteContent = `${Emojis.channel_unlocked_emoji} ${await resolveKey(source, 'modcommands:sanctions.confirmations.unlockdown')}`;
            } else {
                content = `${Emojis.channel_unlocked_emoji} ${await resolveKey(source, 'modcommands:sanctions.confirmations.unlockdown')}`;
            }
        } else {
            await targetChannel.permissionOverwrites.edit(guildId, { SendMessages: false }, { reason: 'Manual Lockdown' });

            if (isRemote) {
                content = `${Emojis.channel_locked_emoji} ${await resolveKey(source, 'modcommands:sanctions.confirmations.lockdown_remote', { channel: targetChannel.toString() })}`;
                remoteContent = `${Emojis.channel_locked_emoji} ${await resolveKey(source, 'modcommands:sanctions.confirmations.lockdown')}`;
            } else {
                content = `${Emojis.channel_locked_emoji} ${await resolveKey(source, 'modcommands:sanctions.confirmations.lockdown')}`;
            }
        }

        if (isRemote && remoteContent) {
            await targetChannel.send({ flags: 32768, components: [ContainerComponent([TextDisplayComponent(remoteContent)])] }).catch(() => null);
        }

        return { flags: 32768, components: [ContainerComponent([TextDisplayComponent(content)])] };
    }

    public override registerApplicationCommands(registry: Command.Registry) {
        registry.registerChatInputCommand((builder) =>
            builder
                .setName(this.name)
                .setDescription(this.description)
                .setDescriptionLocalizations({ 'es-ES': modEs.command.lockdown.description })
                .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
                .addChannelOption(opt => opt.setName('channel').setDescription(modEn.command.lockdown.options.channel).setDescriptionLocalizations({ 'es-ES': modEs.command.lockdown.options.channel }))
        );
    }

    public async chatInputRun(interaction: Command.ChatInputCommandInteraction) {
        const targetChannel = interaction.options.getChannel('channel') ?? interaction.channel;

        await interaction.deferReply();

        if (!interaction.guild) throw new AegisUserError('errors:unexpected');
        if (!targetChannel || !('permissionOverwrites' in targetChannel)) {
            throw new AegisUserError('errors:unexpected');
        }

        const response = await this.executeLockdown({
            source: interaction,
            guildId: interaction.guildId!,
            currentChannelId: interaction.channelId,
            targetChannel: targetChannel as TextChannel | NewsChannel
        });

        return interaction.editReply(response);
    }

    public async messageRun(message: Message, args: Args) {
        const targetChannel = await args.pick('guildTextChannel').catch(() => message.channel as TextChannel);

        if (!message.guild) throw new AegisUserError('errors:unexpected');

        const response = await this.executeLockdown({
            source: message,
            guildId: message.guildId!,
            currentChannelId: message.channelId,
            targetChannel: targetChannel as TextChannel | NewsChannel
        });

        return message.reply(response);
    }
}
