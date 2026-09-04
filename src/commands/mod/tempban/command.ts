import { Command, Args } from '@sapphire/framework';
import { ApplyOptions } from '@sapphire/decorators';
import { Guild, GuildMember, Message } from 'discord.js';
import { requireModConfig, validateMod, sendModDM, parseDuration, checkThresholds } from '../../../lib/utils/ModUtils';
import { prisma } from '../../../database/db';
import { Emojis } from '../../../lib/constants/emojis';
import { AegisUserError } from '../../../lib/structures/Errors';
import modEn from '../../../lib/i18n/en-US/modcommands.json';
import modEs from '../../../lib/i18n/es-ES/modcommands.json';
import { recordAndBuildSanctionConfirmation } from '../../../command-helpers/mod/shared/sanctionFlow';
import { requireModPermission } from '../../../command-helpers/mod/shared/permissionGuard';
import { scheduleExpiry } from '../../../services/SanctionExpiryService';

@ApplyOptions<Command.Options>({
    name: 'tempban',
    description: modEn.command.tempban.description,
    preconditions: ['GuildOnly']
})
export class TempBanCommand extends Command {
    public readonly usage = 'modcommands:mod.usage.tempban';

    private async executeTempBan(data: {
        source: Command.ChatInputCommandInteraction | Message;
        guildId: string;
        guild: Guild;
        moderatorId: string;
        target: GuildMember;
        durationInput: string;
        reason: string | null;
    }) {
        const { source, guildId, guild, moderatorId, target, durationInput, reason } = data;

        const executor = source instanceof Message ? source.member as GuildMember : source.member as GuildMember;
        await requireModPermission(executor, 'tempban');
        await validateMod(source, target);
        await requireModConfig(guildId);

        const duration = parseDuration(durationInput);
        if (!duration) throw new AegisUserError('errors:mod_invalidDuration');

        await sendModDM({ userId: target.id, moderatorId, action: 'tempban', guild, reason, duration: duration.formatted });

        const { caseNumber, layout } = await recordAndBuildSanctionConfirmation({
            source,
            guildId,
            action: 'tempban',
            userId: target.id,
            userTag: target.user.tag,
            moderatorId,
            guild,
            reason,
            duration: duration.formatted,
            expiresAt: duration.expiresAt,
            confirmationKey: 'modcommands:sanctions.confirmations.tempban',
            emoji: Emojis.ban_emoji,
            userDisplay: target.toString(),
            thresholdActionTriggered: 'tempban',
            skipThresholdCheck: true
        });

        await prisma.activeTempBan.upsert({
            where:  { tempban_guild_user_unique: { guildId, userId: target.id } },
            create: {
                guildId,
                userId: target.id,
                moderatorId,
                reason,
                expiresAt: duration.expiresAt,
                ...(caseNumber !== null ? { caseNumber } : {})
            },
            update: {
                moderatorId,
                reason,
                expiresAt: duration.expiresAt,
                ...(caseNumber !== null ? { caseNumber } : {})
            },
        });

        await scheduleExpiry('unban', guildId, target.id, duration.expiresAt);

        await target.ban({ reason: reason ?? `Tempban: ${duration.formatted}` });

        await checkThresholds({
            guildId,
            userId: target.id,
            userTag: target.user.tag,
            moderatorId,
            guild,
            actionTriggered: 'tempban'
        });

        return layout;
    }

    public override registerApplicationCommands(registry: Command.Registry) {
        registry.registerChatInputCommand((builder) =>
            builder
                .setName(this.name)
                .setDescription(this.description)
                .setDescriptionLocalizations({ 'es-ES': modEs.command.tempban.description })
                .setDefaultMemberPermissions(0n)
                .addUserOption(opt => opt.setName('user').setDescription(modEn.command.tempban.options.user).setDescriptionLocalizations({ 'es-ES': modEs.command.tempban.options.user }).setRequired(true))
                .addStringOption(opt => opt.setName('duration').setDescription(modEn.command.tempban.options.duration).setDescriptionLocalizations({ 'es-ES': modEs.command.tempban.options.duration }).setRequired(true))
                .addStringOption(opt => opt.setName('reason').setDescription(modEn.command.tempban.options.reason).setDescriptionLocalizations({ 'es-ES': modEs.command.tempban.options.reason }))
        );
    }

    public async chatInputRun(interaction: Command.ChatInputCommandInteraction) {
        const target = interaction.options.getMember('user') as GuildMember | null;
        const durationInput = interaction.options.getString('duration', true);
        const reason = interaction.options.getString('reason') ?? null;
        
        await interaction.deferReply();

        if (!target) throw new AegisUserError('errors:memberNotFound');

        const response = await this.executeTempBan({
            source: interaction,
            guildId: interaction.guildId!,
            guild: interaction.guild!,
            moderatorId: interaction.user.id,
            target,
            durationInput,
            reason
        });

        return interaction.editReply(response);
    }

    public async messageRun(message: Message, args: Args) {
        const target = await args.pick('member').catch(() => { throw new AegisUserError('errors:memberNotFound'); });
        const durationInput = await args.pick('string').catch(() => { throw new AegisUserError('errors:mod_invalidDuration'); });
        const reason = await args.rest('string').catch(() => null);

        const response = await this.executeTempBan({
            source: message,
            guildId: message.guildId!,
            guild: message.guild!,
            moderatorId: message.author.id,
            target,
            durationInput,
            reason
        });

        return message.reply(response);
    }
}

