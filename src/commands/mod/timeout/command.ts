import { Command, Args } from '@sapphire/framework';
import { ApplyOptions } from '@sapphire/decorators';
import { PermissionFlagsBits, GuildMember, Message } from 'discord.js';
import { requireModConfig, validateMod, sendModDM, parseDuration } from '../../../lib/utils/ModUtils';
import { prisma } from '../../../database/db';
import { CacheManager } from '../../../database/CacheManager';
import { Emojis } from '../../../lib/constants/emojis';
import { AegisUserError } from '../../../lib/structures/Errors';
import modEn from '../../../lib/i18n/en-US/modcommands.json';
import modEs from '../../../lib/i18n/es-ES/modcommands.json';
import { recordAndBuildSanctionConfirmation } from '../../../command-helpers/mod/shared/sanctionFlow';
import { requireModPermission } from '../../../command-helpers/mod/shared/permissionGuard';

@ApplyOptions<Command.Options>({
    name: 'timeout',
    description: modEn.command.timeout.description,
})
export class TimeoutCommand extends Command {
    public readonly usage = 'modcommands:mod.usage.timeout';

    private async ensureTimeoutOverlapAllowed(guildId: string, target: GuildMember) {
        const { mutedRoleId } = await CacheManager.getModConfig(guildId);
        const hasTimeout = target.isCommunicationDisabled();

        if (hasTimeout) {
            throw new AegisUserError('modcommands:mod.timeout.alreadyTimedOut');
        }
    }

    private async executeTimeout(data: {
        source: Command.ChatInputCommandInteraction | Message;
        guildId: string;
        guild: NonNullable<Command.ChatInputCommandInteraction['guild']>;
        moderatorId: string;
        target: GuildMember;
        durationInput: string;
        reason: string | null;
    }) {
        const { source, guildId, guild, moderatorId, target, durationInput, reason } = data;

        const executor = source instanceof Message ? source.member as GuildMember : source.member as GuildMember;
        await requireModPermission(executor, 'timeout');
        await validateMod(source, target);
        await requireModConfig(guildId);
        await this.ensureTimeoutOverlapAllowed(guildId, target);

        const duration = parseDuration(durationInput);
        if (!duration) throw new AegisUserError('errors:mod_invalidDuration');
        if (duration.ms > 28 * 24 * 60 * 60 * 1000) throw new AegisUserError('modcommands:mod.timeout.tooLong');

        await sendModDM({ userId: target.id, moderatorId, action: 'timeout', guild, reason, duration: duration.formatted });

        await target.timeout(duration.ms, reason ?? undefined);

        await prisma.activeMute.upsert({
            where: { mute_guild_user_unique: { guildId, userId: target.id } },
            create: {
                guildId,
                userId: target.id,
                moderatorId,
                reason,
                expiresAt: duration.expiresAt
            },
            update: {
                moderatorId,
                reason,
                expiresAt: duration.expiresAt
            },
        });

        const { caseNumber, layout } = await recordAndBuildSanctionConfirmation({
            source,
            guildId,
            action: 'timeout',
            userId: target.id,
            userTag: target.user.tag,
            moderatorId,
            guild,
            reason,
            duration: duration.formatted,
            expiresAt: duration.expiresAt,
            confirmationKey: 'modcommands:sanctions.confirmations.timeout',
            emoji: Emojis.timeout_emoji,
            userDisplay: target.toString(),
            thresholdActionTriggered: 'timeout'
        });

        if (caseNumber !== null) {
            await prisma.activeMute.updateMany({
                where: { guildId, userId: target.id },
                data: { caseNumber }
            });
        }

        return layout;
    }

    public override registerApplicationCommands(registry: Command.Registry) {
        registry.registerChatInputCommand((builder) =>
            builder
                .setName(this.name)
                .setDescription(this.description)
                .setDescriptionLocalizations({ 'es-ES': modEs.command.timeout.description })
                .setDefaultMemberPermissions(0n)
                .addUserOption(opt => opt
                    .setName('user')
                    .setDescription(modEn.command.timeout.options.user)
                    .setDescriptionLocalizations({ 'es-ES': modEs.command.timeout.options.user })
                    .setRequired(true)
                )
                .addStringOption(opt => opt
                    .setName('duration')
                    .setDescription(modEn.command.timeout.options.duration)
                    .setDescriptionLocalizations({ 'es-ES': modEs.command.timeout.options.duration })
                    .setRequired(true)
                )
                .addStringOption(opt => opt
                    .setName('reason')
                    .setDescription(modEn.command.timeout.options.reason)
                    .setDescriptionLocalizations({ 'es-ES': modEs.command.timeout.options.reason })
                )
        );
    }

    public async chatInputRun(interaction: Command.ChatInputCommandInteraction) {
        const target = interaction.options.getMember('user') as GuildMember | null;
        const durationInput = interaction.options.getString('duration', true);
        const reason = interaction.options.getString('reason') ?? null;

        if (!target) throw new AegisUserError('errors:memberNotFound');

        // Run overlap guard checks before defer so slash validation errors are sent as true ephemeral replies.
        await requireModConfig(interaction.guildId!);
        await this.ensureTimeoutOverlapAllowed(interaction.guildId!, target);

        await interaction.deferReply();

        const response = await this.executeTimeout({
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

        const response = await this.executeTimeout({
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

