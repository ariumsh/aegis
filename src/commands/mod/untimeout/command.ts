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
import { cancelExpiry } from '../../../services/SanctionExpiryService';

@ApplyOptions<Command.Options>({
    name: 'untimeout',
    description: modEn.command.untimeout.description,
})
export class UntimeoutCommand extends Command {
    private async executeUntimeout(data: {
        source: Command.ChatInputCommandInteraction | Message;
        guildId: string;
        guild: Guild;
        moderatorId: string;
        target: GuildMember;
    }) {
        const { source, guildId, guild, moderatorId, target } = data;

        const executor = source instanceof Message ? source.member as GuildMember : source.member as GuildMember;
        await requireModPermission(executor, 'untimeout');
        await validateMod(source, target);
        await requireModConfig(guildId);

        if (!target.isCommunicationDisabled()) {
            throw new AegisUserError('modcommands:mod.timeout.notTimedOut');
        }

        const { mutedRoleId } = await CacheManager.getModConfig(guildId);
        const hasMutedRole = Boolean(mutedRoleId && target.roles.cache.has(mutedRoleId));

        const auditReason = await resolveKey(source, 'modcommands:mod.timeout.auditReason');
        await target.timeout(null, auditReason);

        if (!hasMutedRole) {
            await prisma.activeMute.deleteMany({ where: { guildId, userId: target.id } });
            await cancelExpiry('unmute', guildId, target.id);
        }

        const { layout } = await recordAndBuildSanctionConfirmation({
            source,
            guildId,
            guild,
            moderatorId,
            action: 'untimeout',
            userId: target.id,
            userTag: target.user.tag,
            reason: null,
            confirmationKey: 'modcommands:sanctions.confirmations.untimeout',
            emoji: Emojis.timeout_emoji,
            userDisplay: target.toString()
        });

        return layout;
    }

    public override registerApplicationCommands(registry: Command.Registry) {
        registry.registerChatInputCommand((builder) =>
            builder
                .setName(this.name)
                .setDescription(this.description)
                .setDescriptionLocalizations({ 'es-ES': modEs.command.untimeout.description })
                .setDefaultMemberPermissions(0n)
                .addUserOption((opt) => opt
                    .setName('user')
                    .setDescription(modEn.command.untimeout.options.user)
                    .setDescriptionLocalizations({ 'es-ES': modEs.command.untimeout.options.user })
                    .setRequired(true)
                )
        );
    }

    public async chatInputRun(interaction: Command.ChatInputCommandInteraction) {
        const target = interaction.options.getMember('user') as GuildMember | null;

        await interaction.deferReply();

        if (!target) throw new AegisUserError('errors:memberNotFound');

        const response = await this.executeUntimeout({
            source: interaction,
            guildId: interaction.guildId!,
            guild: interaction.guild!,
            moderatorId: interaction.user.id,
            target
        });

        return interaction.editReply(response);
    }

    public async messageRun(message: Message, args: Args) {
        const target = await args.pick('member').catch(() => {
            throw new AegisUserError('errors:memberNotFound');
        });

        const response = await this.executeUntimeout({
            source: message,
            guildId: message.guildId!,
            guild: message.guild!,
            moderatorId: message.author.id,
            target
        });

        return message.reply(response);
    }
}

