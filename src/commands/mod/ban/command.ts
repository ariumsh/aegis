import { Command, Args } from '@sapphire/framework';
import { ApplyOptions } from '@sapphire/decorators';
import { PermissionFlagsBits, GuildMember, Message } from 'discord.js';
import { requireModConfig, validateMod, sendModDM } from '../../../lib/utils/ModUtils';
import { Emojis } from '../../../lib/constants/emojis';
import { AegisUserError } from '../../../lib/structures/Errors';
import modEn from '../../../lib/i18n/en-US/modcommands.json';
import modEs from '../../../lib/i18n/es-ES/modcommands.json';
import { recordAndBuildSanctionConfirmation } from '../../../command-helpers/mod/shared/sanctionFlow';
import { requireModPermission } from '../../../command-helpers/mod/shared/permissionGuard';

@ApplyOptions<Command.Options>({
    name: 'ban',
    description: modEn.command.ban.description,
})
export class BanCommand extends Command {
    public readonly usage = 'modcommands:mod.usage.ban';

    private async executeBan(data: {
        source: Command.ChatInputCommandInteraction | Message;
        guildId: string;
        guild: NonNullable<Command.ChatInputCommandInteraction['guild']>;
        moderatorId: string;
        target: GuildMember;
        reason: string | null;
        deleteDays: number;
    }) {
        const { source, guildId, guild, moderatorId, target, reason, deleteDays } = data;

        const executor = source instanceof Message ? source.member as GuildMember : source.member as GuildMember;
        await requireModPermission(executor, 'ban');
        await validateMod(source, target);
        if (!target.bannable) throw new AegisUserError('modcommands:mod.ban.notBannable');
        await requireModConfig(guildId);

        await sendModDM({ userId: target.id, moderatorId, action: 'ban', guild, reason });
        await target.ban({ reason: reason ?? undefined, deleteMessageDays: deleteDays });

        const { layout } = await recordAndBuildSanctionConfirmation({
            source,
            guildId,
            action: 'ban',
            userId: target.id,
            userTag: target.user.tag,
            moderatorId,
            guild,
            reason,
            confirmationKey: 'modcommands:sanctions.confirmations.ban',
            emoji: Emojis.ban_emoji,
            userDisplay: target.toString(),
            thresholdActionTriggered: 'ban'
        });

        return layout;
    }

    public override registerApplicationCommands(registry: Command.Registry) {
        registry.registerChatInputCommand((builder) =>
            builder
                .setName(this.name)
                .setDescription(this.description)
                .setDescriptionLocalizations({ 'es-ES': modEs.command.ban.description })
                .setDefaultMemberPermissions(0n)
                .addUserOption(opt => opt.setName('user').setDescription(modEn.command.ban.options.user).setDescriptionLocalizations({ 'es-ES': modEs.command.ban.options.user }).setRequired(true))
                .addStringOption(opt => opt.setName('reason').setDescription(modEn.command.ban.options.reason).setDescriptionLocalizations({ 'es-ES': modEs.command.ban.options.reason }))
                .addIntegerOption(opt => opt.setName('delete_days').setDescription(modEn.command.ban.options.deleteDays).setDescriptionLocalizations({ 'es-ES': modEs.command.ban.options.deleteDays }).setMinValue(0).setMaxValue(7))
        );
    }

    public async chatInputRun(interaction: Command.ChatInputCommandInteraction) {
        const target     = interaction.options.getMember('user') as GuildMember | null;
        const reason     = interaction.options.getString('reason') ?? null;
        const deleteDays = interaction.options.getInteger('delete_days') ?? 0;
        
        await interaction.deferReply();

        if (!target) throw new AegisUserError('errors:memberNotFound');

        const response = await this.executeBan({
            source: interaction,
            guildId: interaction.guildId!,
            guild: interaction.guild!,
            moderatorId: interaction.user.id,
            target,
            reason,
            deleteDays
        });

        return interaction.editReply(response);
    }

    public async messageRun(message: Message, args: Args) {
        const target = await args.pick('member');
        const reason = await args.rest('string').catch(() => null);

        const response = await this.executeBan({
            source: message,
            guildId: message.guildId!,
            guild: message.guild!,
            moderatorId: message.author.id,
            target,
            reason,
            deleteDays: 0
        });

        return message.reply(response);
    }
}

