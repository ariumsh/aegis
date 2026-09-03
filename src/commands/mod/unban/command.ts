import { Command, Args } from '@sapphire/framework';
import { ApplyOptions } from '@sapphire/decorators';
import { PermissionFlagsBits, Guild, GuildMember, Message } from 'discord.js';
import { requireModConfig } from '../../../lib/utils/ModUtils';
import { Emojis } from '../../../lib/constants/emojis';
import { AegisUserError } from '../../../lib/structures/Errors';
import { recordAndBuildSanctionConfirmation } from '../../../command-helpers/mod/shared/sanctionFlow';
import modEn from '../../../lib/i18n/en-US/modcommands.json';
import modEs from '../../../lib/i18n/es-ES/modcommands.json';
import { requireModPermission } from '../../../command-helpers/mod/shared/permissionGuard';

@ApplyOptions<Command.Options>({
    name: 'unban',
    description: modEn.command.unban.description,
})
export class UnbanCommand extends Command {
    public readonly usage = 'modcommands:mod.usage.unban';

    private normalizeUserId(input: string): string {
        const normalized = input.replace(/[<@!>\s]/g, '');
        if (!/^\d{17,20}$/.test(normalized)) {
            throw new AegisUserError('modcommands:mod.ban.invalidUserId');
        }

        return normalized;
    }

    private async executeUnban(data: {
        source: Command.ChatInputCommandInteraction | Message;
        guildId: string;
        guild: Guild;
        moderatorId: string;
        userId: string;
        reason: string | null;
    }) {
        const { source, guildId, guild, moderatorId, userId, reason } = data;

        const executor = source instanceof Message ? source.member as GuildMember : source.member as GuildMember;
        await requireModPermission(executor, 'unban');
        await requireModConfig(guildId);

        // A snowflake can be syntactically valid but not represent a Discord user.
        const targetUser = await this.container.client.users.fetch(userId).catch(() => null);
        if (!targetUser) throw new AegisUserError('modcommands:mod.ban.invalidUserId');

        const ban = await guild.bans.fetch(userId).catch(() => null);
        if (!ban) throw new AegisUserError('modcommands:mod.ban.notBanned');

        await guild.members.unban(userId, reason ?? undefined);

        const { layout } = await recordAndBuildSanctionConfirmation({
            source,
            guildId,
            action: 'unban',
            userId,
            userTag: ban.user.tag,
            moderatorId,
            guild,
            reason,
            confirmationKey: 'modcommands:sanctions.confirmations.unban',
            emoji: Emojis.check_emoji,
            userDisplay: `<@${userId}>`
        });

        return layout;
    }

    public override registerApplicationCommands(registry: Command.Registry) {
        registry.registerChatInputCommand((builder) =>
            builder
                .setName(this.name)
                .setDescription(this.description)
                .setDescriptionLocalizations({ 'es-ES': modEs.command.unban.description })
                .setDefaultMemberPermissions(0n)
                .addStringOption(opt => opt
                    .setName('user_id')
                    .setDescription(modEn.command.unban.options.userId)
                    .setDescriptionLocalizations({ 'es-ES': modEs.command.unban.options.userId })
                    .setRequired(true)
                )
                .addStringOption(opt => opt
                    .setName('reason')
                    .setDescription(modEn.command.unban.options.reason)
                    .setDescriptionLocalizations({ 'es-ES': modEs.command.unban.options.reason })
                )
        );
    }

    public async chatInputRun(interaction: Command.ChatInputCommandInteraction) {
        const userId = this.normalizeUserId(interaction.options.getString('user_id', true));
        const reason = interaction.options.getString('reason') ?? null;
        
        await interaction.deferReply();

        const response = await this.executeUnban({
            source: interaction,
            guildId: interaction.guildId!,
            guild: interaction.guild!,
            moderatorId: interaction.user.id,
            userId,
            reason
        });

        return interaction.editReply(response);
    }

    public async messageRun(message: Message, args: Args) {
        const userId = this.normalizeUserId(await args.pick('string'));
        const reason = await args.rest('string').catch(() => null);

        const response = await this.executeUnban({
            source: message,
            guildId: message.guildId!,
            guild: message.guild!,
            moderatorId: message.author.id,
            userId,
            reason
        });

        return message.reply(response);
    }
}

