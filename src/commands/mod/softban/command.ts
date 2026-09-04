import { Command, Args } from '@sapphire/framework';
import { ApplyOptions } from '@sapphire/decorators';
import { Guild, GuildMember, Message } from 'discord.js';
import { resolveKey } from '@sapphire/plugin-i18next';
import { requireModConfig, validateMod, sendModDM } from '../../../lib/utils/ModUtils';
import { Emojis } from '../../../lib/constants/emojis';
import { AegisUserError } from '../../../lib/structures/Errors';
import modEn from '../../../lib/i18n/en-US/modcommands.json';
import modEs from '../../../lib/i18n/es-ES/modcommands.json';
import { recordAndBuildSanctionConfirmation } from '../../../command-helpers/mod/shared/sanctionFlow';
import { requireModPermission } from '../../../command-helpers/mod/shared/permissionGuard';

@ApplyOptions<Command.Options>({
    name: 'softban',
    description: modEn.command.softban.description,
})
export class SoftbanCommand extends Command {
    public readonly usage = 'modcommands:mod.usage.softban';

    private async executeSoftban(data: {
        source: Command.ChatInputCommandInteraction | Message;
        guildId: string;
        guild: Guild;
        moderatorId: string;
        target: GuildMember;
        reason: string | null;
        deleteDays: number;
    }) {
        const { source, guildId, guild, moderatorId, target, reason, deleteDays } = data;

        const executor = source instanceof Message ? source.member as GuildMember : source.member as GuildMember;
        await requireModPermission(executor, 'softban');
        await validateMod(source, target);
        if (!target.bannable) throw new AegisUserError('modcommands:mod.ban.notBannable');
        await requireModConfig(guildId);

        await sendModDM({ userId: target.id, moderatorId, action: 'softban', guild, reason });
        await target.ban({ reason: reason ?? undefined, deleteMessageSeconds: deleteDays * 24 * 60 * 60 });

        const auditReason = await resolveKey(source, 'modcommands:mod.ban.softbanAuditReason');
        await guild.members.unban(target.id, auditReason).catch((err: any) => {
            if (err?.code === 10026 || err?.code === 10013) return;
            throw err;
        });

        const { layout } = await recordAndBuildSanctionConfirmation({
            source,
            guildId,
            action: 'softban',
            userId: target.id,
            userTag: target.user.tag,
            moderatorId,
            guild,
            reason: reason ?? null,
            confirmationKey: 'modcommands:sanctions.confirmations.softban',
            emoji: Emojis.softban_emoji,
            userDisplay: target.toString(),
            thresholdActionTriggered: 'softban'
        });

        return layout;
    }

    public override registerApplicationCommands(registry: Command.Registry) {
        registry.registerChatInputCommand((builder) =>
            builder
                .setName(this.name)
                .setDescription(this.description)
                .setDescriptionLocalizations({ 'es-ES': modEs.command.softban.description })
                .setDefaultMemberPermissions(0n)
                .addUserOption(opt => opt.setName('user').setDescription(modEn.command.softban.options.user).setDescriptionLocalizations({ 'es-ES': modEs.command.softban.options.user }).setRequired(true))
                .addStringOption(opt => opt.setName('reason').setDescription(modEn.command.softban.options.reason).setDescriptionLocalizations({ 'es-ES': modEs.command.softban.options.reason }))
                .addIntegerOption(opt => opt.setName('delete_days').setDescription(modEn.command.softban.options.deleteDays).setDescriptionLocalizations({ 'es-ES': modEs.command.softban.options.deleteDays }).setMinValue(0).setMaxValue(7))
        );
    }

    public async chatInputRun(interaction: Command.ChatInputCommandInteraction) {
        const target     = interaction.options.getMember('user') as GuildMember | null;
        const reason     = interaction.options.getString('reason') ?? null;
        const deleteDays = interaction.options.getInteger('delete_days') ?? 3;
        
        await interaction.deferReply();

        if (!target) throw new AegisUserError('errors:memberNotFound');

        const response = await this.executeSoftban({
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
        const target = await args.pick('member').catch(() => { throw new AegisUserError('errors:memberNotFound'); });
        const reason = await args.rest('string').catch(() => null);

        const response = await this.executeSoftban({
            source: message,
            guildId: message.guildId!,
            guild: message.guild!,
            moderatorId: message.author.id,
            target,
            reason,
            deleteDays: 3
        });

        return message.reply(response);
    }
}

