import { Command, Args } from '@sapphire/framework';
import { ApplyOptions } from '@sapphire/decorators';
import { GuildMember, Message, User } from 'discord.js';
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
        /** The user being banned. Present in the guild or not. */
        target: User;
        /** Their membership, when they are still in the guild. */
        member: GuildMember | null;
        reason: string | null;
        deleteDays: number;
    }) {
        const { source, guildId, guild, moderatorId, target, member, reason, deleteDays } = data;

        const executor = source.member as GuildMember;
        await requireModPermission(executor, 'ban');

        if (member) {
            // Hierarchy only means something while they are in the guild: it
            // compares role positions, and someone who has left has no roles
            // here to compare.
            await validateMod(source, member);
            if (!member.bannable) throw new AegisUserError('modcommands:mod.ban.notBannable');
        } else {
            // The two checks from validateMod that still apply with no member.
            if (target.id === moderatorId) throw new AegisUserError('errors:mod_self');
            if (target.id === this.container.client.user?.id) throw new AegisUserError('errors:mod_bot');
        }

        await requireModConfig(guildId);

        // Only worth attempting while they can still receive it. Discord will
        // not deliver a DM to someone with no mutual server.
        if (member) {
            await sendModDM({ userId: target.id, moderatorId, action: 'ban', guild, reason });
        }

        // guild.bans.create takes an id, so it covers both cases -- unlike
        // member.ban(), which needs a membership the target may not have.
        await guild.bans.create(target.id, {
            reason: reason ?? undefined,
            deleteMessageSeconds: deleteDays * 24 * 60 * 60
        });

        const { layout } = await recordAndBuildSanctionConfirmation({
            source,
            guildId,
            action: 'ban',
            userId: target.id,
            userTag: target.tag,
            moderatorId,
            guild,
            reason,
            confirmationKey: 'modcommands:sanctions.confirmations.ban',
            emoji: Emojis.ban_emoji,
            userDisplay: `<@${target.id}>`,
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
        // getUser rather than getMember: a user option resolves for anyone
        // Discord knows about, while getMember returns null the moment they are
        // not in this guild -- which is exactly when a ban is most wanted.
        const target     = interaction.options.getUser('user', true);
        const member     = interaction.options.getMember('user') as GuildMember | null;
        const reason     = interaction.options.getString('reason') ?? null;
        const deleteDays = interaction.options.getInteger('delete_days') ?? 0;

        await interaction.deferReply();

        const response = await this.executeBan({
            source: interaction,
            guildId: interaction.guildId!,
            guild: interaction.guild!,
            moderatorId: interaction.user.id,
            target,
            member,
            reason,
            deleteDays
        });

        return interaction.editReply(response);
    }

    public async messageRun(message: Message, args: Args) {
        // 'user' resolves a mention or a raw id without requiring membership;
        // 'member' would fail outright for someone who has left.
        const target = await args.pick('user').catch(() => {
            throw new AegisUserError('errors:memberNotFound');
        });
        const reason = await args.rest('string').catch(() => null);

        const member = await message.guild!.members.fetch(target.id).catch(() => null);

        const response = await this.executeBan({
            source: message,
            guildId: message.guildId!,
            guild: message.guild!,
            moderatorId: message.author.id,
            target,
            member,
            reason,
            deleteDays: 0
        });

        return message.reply(response);
    }
}
