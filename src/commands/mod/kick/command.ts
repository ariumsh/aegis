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
    name: 'kick',
    description: modEn.command.kick.description,
})
export class KickCommand extends Command {
    public readonly usage = 'modcommands:mod.usage.kick';

    private async executeKick(data: {
        source: Command.ChatInputCommandInteraction | Message;
        guildId: string;
        guild: NonNullable<Command.ChatInputCommandInteraction['guild']>;
        moderatorId: string;
        target: GuildMember;
        reason: string | null;
    }) {
        const { source, guildId, guild, moderatorId, target, reason } = data;

        const executor = source instanceof Message ? source.member as GuildMember : source.member as GuildMember;
        await requireModPermission(executor, 'kick');
        await validateMod(source, target);
        if (!target.kickable) throw new AegisUserError('modcommands:mod.kick.notKickable');
        await requireModConfig(guildId);

        await sendModDM({ userId: target.id, moderatorId, action: 'kick', guild, reason });
        await target.kick(reason ?? undefined);

        const { layout } = await recordAndBuildSanctionConfirmation({
            source,
            guildId,
            action: 'kick',
            userId: target.id,
            userTag: target.user.tag,
            moderatorId,
            guild,
            reason,
            confirmationKey: 'modcommands:sanctions.confirmations.kick',
            emoji: Emojis.kick_emoji,
            userDisplay: target.toString(),
            thresholdActionTriggered: 'kick'
        });

        return layout;
    }

    public override registerApplicationCommands(registry: Command.Registry) {
        registry.registerChatInputCommand((builder) =>
            builder
                .setName(this.name)
                .setDescription(this.description)
                .setDescriptionLocalizations({ 'es-ES': modEs.command.kick.description })
                .setDefaultMemberPermissions(0n)
                .addUserOption(opt => opt.setName('user').setDescription(modEn.command.kick.options.user).setDescriptionLocalizations({ 'es-ES': modEs.command.kick.options.user }).setRequired(true))
                .addStringOption(opt => opt.setName('reason').setDescription(modEn.command.kick.options.reason).setDescriptionLocalizations({ 'es-ES': modEs.command.kick.options.reason }))
        );
    }

    public async chatInputRun(interaction: Command.ChatInputCommandInteraction) {
        const target = interaction.options.getMember('user') as GuildMember | null;
        const reason = interaction.options.getString('reason') ?? null;
        await interaction.deferReply();

        if (!target) throw new AegisUserError('errors:memberNotFound');

        const response = await this.executeKick({
            source: interaction,
            guildId: interaction.guildId!,
            guild: interaction.guild!,
            moderatorId: interaction.user.id,
            target,
            reason
        });

        return interaction.editReply(response);
    }

    public async messageRun(message: Message, args: Args) {
        const target = await args.pick('member');
        const reason = await args.rest('string').catch(() => null);

        const response = await this.executeKick({
            source: message,
            guildId: message.guildId!,
            guild: message.guild!,
            moderatorId: message.author.id,
            target,
            reason
        });

        return message.reply(response);
    }
}

