import { Command, Args } from '@sapphire/framework';
import { ApplyOptions } from '@sapphire/decorators';
import { PermissionFlagsBits, Message } from 'discord.js';
import { resolveKey } from '@sapphire/plugin-i18next';
import { prisma } from '../../../database/db';
import { getCaseDetailLayout } from '../../../lib/layouts/modCommandLayouts';
import { AegisUserError } from '../../../lib/structures/Errors';
import modEn from '../../../lib/i18n/en-US/modcommands.json';
import modEs from '../../../lib/i18n/es-ES/modcommands.json';

@ApplyOptions<Command.Options>({
    name: 'case',
    description: modEn.command.case.description,
    preconditions: ['GuildOnly']
})
export class CaseCommand extends Command {
    public readonly usage = 'modcommands:mod.usage.case';

    private async executeCase(data: {
        source: Command.ChatInputCommandInteraction | Message;
        guildId: string;
        caseNumber: number;
    }) {
        const { source, guildId, caseNumber } = data;

        const caseData = await prisma.modLog.findFirst({
            where: { guildId, caseNumber }
        });

        if (!caseData) {
            throw new AegisUserError('modcommands:mod.case.notFound', undefined, { case: caseNumber });
        }

        const labels = {
            title:     await resolveKey(source, 'modcommands:mod.case.title', { case: caseNumber }),
            user:      await resolveKey(source, 'modcommands:sanctions.fields.target'),
            moderator: await resolveKey(source, 'modcommands:sanctions.fields.staff'),
            action:    await resolveKey(source, 'modcommands:mod.case.fields.action'),
            reason:    await resolveKey(source, 'modcommands:sanctions.fields.reason'),
            duration:  await resolveKey(source, 'modcommands:sanctions.fields.duration'),
            date:      await resolveKey(source, 'modcommands:sanctions.fields.date')
        };

        const noReason = await resolveKey(source, 'modcommands:mod.case.noReason');

        return getCaseDetailLayout({
            caseNumber,
            userId:      caseData.userId,
            moderatorId: caseData.moderatorId,
            action:      caseData.action,
            reason:      caseData.reason ?? noReason,
            duration:    caseData.duration,
            createdAt:   caseData.createdAt,
            labels
        });
    }

    public override registerApplicationCommands(registry: Command.Registry) {
        registry.registerChatInputCommand((builder) =>
            builder
                .setName(this.name)
                .setDescription(this.description)
                .setDescriptionLocalizations({ 'es-ES': modEs.command.case.description })
                .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
                .addIntegerOption(opt => opt.setName('number').setDescription(modEn.command.case.options.number).setDescriptionLocalizations({ 'es-ES': modEs.command.case.options.number }).setRequired(true))
        );
    }

    public async chatInputRun(interaction: Command.ChatInputCommandInteraction) {
        const caseNumber = interaction.options.getInteger('number', true);
        await interaction.deferReply();

        const response = await this.executeCase({
            source: interaction,
            guildId: interaction.guildId!,
            caseNumber
        });

        return interaction.editReply(response as any);
    }

    public async messageRun(message: Message, args: Args) {
        const caseNumber = await args.pick('integer').catch(() => { throw new AegisUserError('modcommands:mod.case.invalidNumber'); });

        const response = await this.executeCase({
            source: message,
            guildId: message.guildId!,
            caseNumber
        });

        return message.reply(response as any);
    }
}

