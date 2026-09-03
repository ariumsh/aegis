import { Command, Args } from '@sapphire/framework';
import { ApplyOptions } from '@sapphire/decorators';
import { Guild, GuildMember, Message } from 'discord.js';
import { resolveKey } from '@sapphire/plugin-i18next';
import { requireModConfig, validateMod } from '../../../lib/utils/ModUtils';
import { prisma } from '../../../database/db';
import { CacheManager } from '../../../database/CacheManager';
import { Emojis } from '../../../lib/constants/emojis';
import { AegisUserError } from '../../../lib/structures/Errors';
import { recordAndBuildSanctionConfirmation } from '../../../command-helpers/mod/shared/sanctionFlow';
import modEn from '../../../lib/i18n/en-US/modcommands.json';
import modEs from '../../../lib/i18n/es-ES/modcommands.json';
import { requireModPermission } from '../../../command-helpers/mod/shared/permissionGuard';

@ApplyOptions<Command.Options>({
    name: 'unmute',
    description: modEn.command.unmute.description,
})
export class UnmuteCommand extends Command {
    private async executeUnmute(data: {
        source: Command.ChatInputCommandInteraction | Message;
        guildId: string;
        guild: Guild;
        moderatorId: string;
        target: GuildMember;
    }) {
        const { source, guildId, guild, moderatorId, target } = data;

        const executor = source instanceof Message ? source.member as GuildMember : source.member as GuildMember;
        await requireModPermission(executor, 'unmute');
        await validateMod(source, target);
        await requireModConfig(guildId);

        const { mutedRoleId } = await CacheManager.getModConfig(guildId);
        const hasMutedRole = Boolean(mutedRoleId && target.roles.cache.has(mutedRoleId));
        if (!hasMutedRole) throw new AegisUserError('modcommands:mod.mute.notMuted');
        const hasTimeout = target.isCommunicationDisabled();

        const auditReason = await resolveKey(source, 'modcommands:mod.mute.auditReason');
        if (hasMutedRole && mutedRoleId) {
            await target.roles.remove(mutedRoleId, auditReason);
        }

        if (!hasTimeout) {
            await prisma.activeMute.deleteMany({ where: { guildId, userId: target.id } });
        }

        const { layout } = await recordAndBuildSanctionConfirmation({
            source,
            guildId,
            guild,
            moderatorId,
            action: 'unmute',
            userId: target.id,
            userTag: target.user.tag,
            reason: null,
            confirmationKey: 'modcommands:sanctions.confirmations.unmute',
            emoji: Emojis.unmute_emoji,
            userDisplay: target.toString()
        });

        return layout;
    }

    public override registerApplicationCommands(registry: Command.Registry) {
        registry.registerChatInputCommand((builder) =>
            builder
                .setName(this.name)
                .setDescription(this.description)
                .setDescriptionLocalizations({ 'es-ES': modEs.command.unmute.description })
                .setDefaultMemberPermissions(0n)
                .addUserOption(opt => opt
                    .setName('user')
                    .setDescription(modEn.command.unmute.options.user)
                    .setDescriptionLocalizations({ 'es-ES': modEs.command.unmute.options.user })
                    .setRequired(true)
                )
        );
    }

    public async chatInputRun(interaction: Command.ChatInputCommandInteraction) {
        const target = interaction.options.getMember('user') as GuildMember | null;
        
        await interaction.deferReply();

        if (!target) throw new AegisUserError('errors:memberNotFound');

        const response = await this.executeUnmute({
            source: interaction,
            guildId: interaction.guildId!,
            guild: interaction.guild!,
            moderatorId: interaction.user.id,
            target
        });

        return interaction.editReply(response);
    }

    public async messageRun(message: Message, args: Args) {
        const target = await args.pick('member').catch(() => { throw new AegisUserError('errors:memberNotFound'); });

        const response = await this.executeUnmute({
            source: message,
            guildId: message.guildId!,
            guild: message.guild!,
            moderatorId: message.author.id,
            target
        });

        return message.reply(response);
    }
}

