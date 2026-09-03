import { Command, Args } from '@sapphire/framework';
import { ApplyOptions } from '@sapphire/decorators';
import { GuildMember, Message } from 'discord.js';
import { requireModConfig, validateMod, sendModDM } from '../../../lib/utils/ModUtils';
import { Emojis } from '../../../lib/constants/emojis';
import { AegisUserError } from '../../../lib/structures/Errors';
import modEn from '../../../lib/i18n/en-US/modcommands.json';
import modEs from '../../../lib/i18n/es-ES/modcommands.json';
import { recordAndBuildSanctionConfirmation } from '../../../command-helpers/mod/shared/sanctionFlow';
import { requireModPermission } from '../../../command-helpers/mod/shared/permissionGuard';

@ApplyOptions<Command.Options>({
    name: 'warn',
    description: modEn.command.warn.description,
})
export class WarnCommand extends Command {
    public readonly usage = 'modcommands:mod.usage.warn';

    private async executeWarn(data: {
        source: Command.ChatInputCommandInteraction | Message;
        guildId: string;
        guild: NonNullable<Command.ChatInputCommandInteraction['guild']>;
        moderatorId: string;
        target: GuildMember;
        reason: string | null;
    }) {
        const { source, guildId, guild, moderatorId, target, reason } = data;

        const executor = source instanceof Message ? source.member as GuildMember : source.member as GuildMember;
        await requireModPermission(executor, 'warn');
        await validateMod(source, target);
        await requireModConfig(guildId);

        await sendModDM({ userId: target.id, moderatorId, action: 'warn', guild, reason });
        const { layout } = await recordAndBuildSanctionConfirmation({
            source,
            guildId,
            action: 'warn',
            userId: target.id,
            userTag: target.user.tag,
            moderatorId,
            guild,
            reason,
            confirmationKey: 'modcommands:sanctions.confirmations.warn',
            emoji: Emojis.warn_emoji,
            userDisplay: target.toString(),
            thresholdActionTriggered: 'warn'
        });

        return layout;
    }

    public override registerApplicationCommands(registry: Command.Registry) {
        registry.registerChatInputCommand((builder) =>
            builder
                .setName(this.name)
                .setDescription(this.description)
                .setDescriptionLocalizations({ 'es-ES': modEs.command.warn.description })
                .setDefaultMemberPermissions(0n)
                .addUserOption(opt => opt
                    .setName('user')
                    .setDescription(modEn.command.warn.options.user)
                    .setDescriptionLocalizations({ 'es-ES': modEs.command.warn.options.user })
                    .setRequired(true)
                )
                .addStringOption(opt => opt
                    .setName('reason')
                    .setDescription(modEn.command.warn.options.reason)
                    .setDescriptionLocalizations({ 'es-ES': modEs.command.warn.options.reason })
                )
        );
    }

    public async chatInputRun(interaction: Command.ChatInputCommandInteraction) {
        const target = interaction.options.getMember('user') as GuildMember | null;
        const reason = interaction.options.getString('reason') ?? null;
        await interaction.deferReply();

        if (!target) throw new AegisUserError('errors:memberNotFound');

        const response = await this.executeWarn({
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
        const target = await args.pick('member').catch(() => { throw new AegisUserError('errors:memberNotFound'); });
        const reason = await args.rest('string').catch(() => null);

        const response = await this.executeWarn({
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

