import { Command, Args } from '@sapphire/framework';
import { ApplyOptions } from '@sapphire/decorators';
import { PermissionFlagsBits, Guild, GuildMember, Message } from 'discord.js';
import { resolveKey } from '@sapphire/plugin-i18next';
import { requireModConfig, requireMutedRole, validateMod, sendModDM, parseDuration } from '../../../lib/utils/ModUtils';
import { prisma } from '../../../database/db';
import { Emojis } from '../../../lib/constants/emojis';
import { AegisUserError } from '../../../lib/structures/Errors';
import modEn from '../../../lib/i18n/en-US/modcommands.json';
import modEs from '../../../lib/i18n/es-ES/modcommands.json';
import { recordAndBuildSanctionConfirmation } from '../../../command-helpers/mod/shared/sanctionFlow';
import { requireModPermission } from '../../../command-helpers/mod/shared/permissionGuard';

@ApplyOptions<Command.Options>({
    name: 'mute',
    description: modEn.command.mute.description,
})
export class MuteCommand extends Command {
    public readonly usage = 'modcommands:mod.usage.mute';

    private async ensureMuteOverlapAllowed(mutedRoleId: string, target: GuildMember) {
        const hasMutedRole = target.roles.cache.has(mutedRoleId);

        if (hasMutedRole) {
            throw new AegisUserError('modcommands:mod.mute.alreadyMuted');
        }
    }

    private async executeMute(data: {
        source: Command.ChatInputCommandInteraction | Message;
        guildId: string;
        guild: Guild;
        moderatorId: string;
        target: GuildMember;
        durationInput: string | null;
        reason: string | null;
    }) {
        const { source, guildId, guild, moderatorId, target, durationInput, reason } = data;

        const executor = source instanceof Message ? source.member as GuildMember : source.member as GuildMember;
        await requireModPermission(executor, 'mute');
        await validateMod(source, target);
        await requireModConfig(guildId);
        const mutedRoleId = await requireMutedRole(guildId);
        await this.ensureMuteOverlapAllowed(mutedRoleId, target);

        let parsed = null;
        if (durationInput) {
            parsed = parseDuration(durationInput);
            if (!parsed) throw new AegisUserError('errors:mod_invalidDuration');
        }

        const permanentLabel = await resolveKey(source, 'modcommands:mod.mute.permanent');

        await target.roles.add(mutedRoleId, reason ?? undefined);
        await prisma.activeMute.upsert({
            where: { mute_guild_user_unique: { guildId, userId: target.id } },
            create: { guildId, userId: target.id, moderatorId, reason, expiresAt: parsed?.expiresAt ?? null },
            update: { moderatorId, reason, expiresAt: parsed?.expiresAt ?? null },
        });

        await sendModDM({ userId: target.id, moderatorId, action: 'mute', guild, reason, duration: parsed?.formatted ?? permanentLabel });
        const { layout } = await recordAndBuildSanctionConfirmation({
            source,
            guildId,
            action: 'mute',
            userId: target.id,
            userTag: target.user.tag,
            moderatorId,
            guild,
            reason,
            duration: parsed?.formatted ?? permanentLabel,
            expiresAt: parsed?.expiresAt ?? null,
            confirmationKey: 'modcommands:sanctions.confirmations.mute',
            emoji: Emojis.mute_emoji,
            userDisplay: target.toString(),
            thresholdActionTriggered: 'mute'
        });

        return layout;
    }

    public override registerApplicationCommands(registry: Command.Registry) {
        registry.registerChatInputCommand((builder) =>
            builder
                .setName(this.name)
                .setDescription(this.description)
                .setDescriptionLocalizations({ 'es-ES': modEs.command.mute.description })
                .setDefaultMemberPermissions(0n)
                .addUserOption(opt => opt.setName('user').setDescription(modEn.command.mute.options.user).setDescriptionLocalizations({ 'es-ES': modEs.command.mute.options.user }).setRequired(true))
                .addStringOption(opt => opt.setName('duration').setDescription(modEn.command.mute.options.duration).setDescriptionLocalizations({ 'es-ES': modEs.command.mute.options.duration }))
                .addStringOption(opt => opt.setName('reason').setDescription(modEn.command.mute.options.reason).setDescriptionLocalizations({ 'es-ES': modEs.command.mute.options.reason }))
        );
    }

    public async chatInputRun(interaction: Command.ChatInputCommandInteraction) {
        const target = interaction.options.getMember('user') as GuildMember | null;
        const durationInput = interaction.options.getString('duration') ?? null;
        const reason = interaction.options.getString('reason') ?? null;

        if (!target) throw new AegisUserError('errors:memberNotFound');

        // Run overlap guard checks before defer so slash validation errors are sent as true ephemeral replies.
        await requireModConfig(interaction.guildId!);
        const mutedRoleId = await requireMutedRole(interaction.guildId!);
        await this.ensureMuteOverlapAllowed(mutedRoleId, target);

        await interaction.deferReply();

        const response = await this.executeMute({
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
        const target = await args.pick('member');
        const durationInput = await args.pick('string').catch(() => null);
        const reason = await args.rest('string').catch(() => null);

        const response = await this.executeMute({
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

