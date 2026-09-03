import { Command, Args } from '@sapphire/framework';
import { ApplyOptions } from '@sapphire/decorators';
import { PermissionFlagsBits, Message } from 'discord.js';
import { resolveKey } from '@sapphire/plugin-i18next';
import { requireModConfig } from '../../../lib/utils/ModUtils';
import { prisma } from '../../../database/db';
import { Emojis } from '../../../lib/constants/emojis';
import { ContainerComponent, TextDisplayComponent } from '../../../lib/layouts/ui';
import { AegisUserError } from '../../../lib/structures/Errors';
import modEn from '../../../lib/i18n/en-US/modcommands.json';
import modEs from '../../../lib/i18n/es-ES/modcommands.json';
import { requireModPermissionFrom } from '../../../command-helpers/mod/shared/permissionGuard';

@ApplyOptions<Command.Options>({
    name: 'remove-case',
    aliases: ['removecase'],
    description: modEn.command.removeCase.description,
})
export class RemoveCaseCommand extends Command {
    public readonly usage = 'modcommands:mod.usage.removeCase';

    private async executeRemoveCase(data: {
        source: Command.ChatInputCommandInteraction | Message;
        guildId: string;
        moderatorId: string;
        caseNumber: number;
        reason: string | null;
    }) {
        const { source, guildId, moderatorId, caseNumber, reason } = data;

        await requireModPermissionFrom(source, 'removecase');
        await requireModConfig(guildId);

        const modLog = await prisma.modLog.findFirst({
            where: { guildId, caseNumber }
        });

        if (!modLog) throw new AegisUserError('modcommands:mod.case.notFound', undefined, { case: caseNumber });

        await prisma.modLog.delete({
            where: { id: modLog.id }
        });

        this.container.logger.info(
            `[MOD] Case #${caseNumber} removed in guild ${guildId} by ${moderatorId} (${reason ?? 'no reason provided'})`
        );

        const successMsg = await resolveKey(source, 'modcommands:mod.case.removed', { emoji: Emojis.check_emoji, case: caseNumber });
        return { flags: 32768, components: [ContainerComponent([TextDisplayComponent(successMsg)])] };
    }

    public override registerApplicationCommands(registry: Command.Registry) {
        registry.registerChatInputCommand((builder) =>
            builder
                .setName(this.name)
                .setDescription(this.description)
                .setDescriptionLocalizations({ 'es-ES': modEs.command.removeCase.description })
                .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
                .addIntegerOption(opt => opt.setName('case_number').setDescription(modEn.command.removeCase.options.caseNumber).setDescriptionLocalizations({ 'es-ES': modEs.command.removeCase.options.caseNumber }).setRequired(true))
                .addStringOption(opt => opt.setName('reason').setDescription(modEn.command.removeCase.options.reason).setDescriptionLocalizations({ 'es-ES': modEs.command.removeCase.options.reason }))
        );
    }

    public async chatInputRun(interaction: Command.ChatInputCommandInteraction) {
        const caseNumber = interaction.options.getInteger('case_number', true);
        const reason = interaction.options.getString('reason') ?? null;
        
        await interaction.deferReply();

        const response = await this.executeRemoveCase({
            source: interaction,
            guildId: interaction.guildId!,
            moderatorId: interaction.user.id,
            caseNumber,
            reason
        });

        return interaction.editReply(response);
    }

    public async messageRun(message: Message, args: Args) {
        const caseNumber = await args.pick('integer').catch(() => { throw new AegisUserError('modcommands:mod.case.invalidNumber'); });
        const reason = await args.rest('string').catch(() => null);

        const response = await this.executeRemoveCase({
            source: message,
            guildId: message.guildId!,
            moderatorId: message.author.id,
            caseNumber,
            reason
        });

        return message.reply(response);
    }
}
