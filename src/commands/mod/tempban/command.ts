import { Command, Args } from '@sapphire/framework';
import { ApplyOptions } from '@sapphire/decorators';
import { Guild, GuildMember, Message, User } from 'discord.js';
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
        /** The user being banned. Present in the guild or not. */
        target: User;
        /** Their membership, when they are still in the guild. */
        member: GuildMember | null;
        durationInput: string;
        reason: string | null;
    }) {
        const { source, guildId, guild, moderatorId, target, member, durationInput, reason } = data;

        const executor = source instanceof Message ? source.member as GuildMember : source.member as GuildMember;
        await requireModPermission(executor, 'tempban');
        if (member) {
            // Hierarchy compares role positions, which means nothing for
            // someone who has left and has no roles here.
            await validateMod(source, member);
            if (!member.bannable) throw new AegisUserError('modcommands:mod.ban.notBannable');
        } else {
            // The two checks from validateMod that still apply with no member.
            if (target.id === moderatorId) throw new AegisUserError('errors:mod_self');
            if (target.id === this.container.client.user?.id) throw new AegisUserError('errors:mod_bot');
        }
        await requireModConfig(guildId);

        const duration = parseDuration(durationInput);
        if (!duration) throw new AegisUserError('errors:mod_invalidDuration');

        await sendModDM({ userId: target.id, moderatorId, action: 'tempban', guild, reason, duration: duration.formatted });

        const { caseNumber, layout } = await recordAndBuildSanctionConfirmation({
            source,
            guildId,
            action: 'tempban',
            userId: target.id,
            userTag: target.tag,
            moderatorId,
            guild,
            reason,
            duration: duration.formatted,
            expiresAt: duration.expiresAt,
            confirmationKey: 'modcommands:sanctions.confirmations.tempban',
            emoji: Emojis.ban_emoji,
            userDisplay: `<@${target.id}>`,
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

        // bans.create takes an id, so it works whether or not they are still in
        // the guild -- unlike member.ban(), which needs a membership.
        await guild.bans.create(target.id, { reason: reason ?? `Tempban: ${duration.formatted}` });

        await checkThresholds({
            guildId,
            userId: target.id,
            userTag: target.tag,
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
        // getUser rather than getMember: a user option resolves for anyone
        // Discord knows about, while getMember returns null the moment they are
        // not in this guild -- which is exactly when a ban is most wanted.
        const target = interaction.options.getUser('user', true);
        const member = interaction.options.getMember('user') as GuildMember | null;
        const durationInput = interaction.options.getString('duration', true);
        const reason = interaction.options.getString('reason') ?? null;

        await interaction.deferReply();

        const response = await this.executeTempBan({
            source: interaction,
            guildId: interaction.guildId!,
            guild: interaction.guild!,
            moderatorId: interaction.user.id,
            target,
            member,
            durationInput,
            reason
        });

        return interaction.editReply(response);
    }

    public async messageRun(message: Message, args: Args) {
        // 'user' resolves a mention or a raw id without requiring membership.
        const target = await args.pick('user').catch(() => { throw new AegisUserError('errors:memberNotFound'); });
        const durationInput = await args.pick('string').catch(() => { throw new AegisUserError('errors:mod_invalidDuration'); });
        const reason = await args.rest('string').catch(() => null);

        const response = await this.executeTempBan({
            source: message,
            guildId: message.guildId!,
            guild: message.guild!,
            moderatorId: message.author.id,
            target,
            member: await message.guild!.members.fetch(target.id).catch(() => null),
            durationInput,
            reason
        });

        return message.reply(response);
    }
}

