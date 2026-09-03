import { InteractionHandler, InteractionHandlerTypes } from '@sapphire/framework';
import { ButtonInteraction, GuildMember } from 'discord.js';
import { prisma } from '../database/db';
import { getSanctionLayout } from '../lib/layouts/modCommandLayouts';
import { ContainerComponent, TextDisplayComponent } from '../lib/layouts/ui';
import { requireModPermission } from '../command-helpers/mod/shared/permissionGuard';
import { resolveKey } from '@sapphire/plugin-i18next';

export class ModCaseHandler extends InteractionHandler {
    public constructor(context: InteractionHandler.LoaderContext, options: InteractionHandler.Options) {
        super(context, {
            ...options,
            interactionHandlerType: InteractionHandlerTypes.Button
        });
    }

    public override parse(interaction: ButtonInteraction) {
        if (!interaction.customId.startsWith('mod_case_')) return this.none();
        return this.some(interaction.customId.replace('mod_case_', ''));
    }

    public async run(interaction: ButtonInteraction, caseId: string) {
        await requireModPermission(interaction.member as GuildMember, 'case');

        const caseNumber = parseInt(caseId);

        if (Number.isNaN(caseNumber) || caseNumber <= 0) {
            const invalidCase = await resolveKey(interaction, 'modcommands:mod.case.invalidNumber').catch(() => 'Invalid case number.');
            return interaction.reply({ flags: ['Ephemeral', 'IsComponentsV2'], components: [ContainerComponent([TextDisplayComponent(invalidCase)])] });
        }

        const modLog = await prisma.modLog.findFirst({
            where: {
                guildId: interaction.guildId!,
                caseNumber: caseNumber
            }
        });

        if (!modLog) {
            const notFound = await resolveKey(interaction, 'modcommands:mod.case.notFound', { case: caseNumber }).catch(() => 'Case not found.');
            return interaction.reply({ flags: ['Ephemeral', 'IsComponentsV2'], components: [ContainerComponent([TextDisplayComponent(notFound)])] });
        }

        const ns = 'modcommands:sanctions';
        const labels = {
            typeLabel:    await resolveKey(interaction, `${ns}.types.${modLog.action}`),
            targetLabel:  await resolveKey(interaction, `${ns}.fields.target`),
            modLabel:     await resolveKey(interaction, `${ns}.fields.staff`),
            reasonLabel:  await resolveKey(interaction, `${ns}.fields.reason`),
            durationLabel: await resolveKey(interaction, `${ns}.fields.duration`),
            permanent:    await resolveKey(interaction, `${ns}.fields.permanent`)
        };

        return interaction.reply({
            ...getSanctionLayout({
                type: modLog.action as any,
                targetId: modLog.userId,
                moderatorId: modLog.moderatorId,
                reason: modLog.reason ?? 'No reason provided',
                duration: modLog.duration,
                labels: {
                    typeLabel: labels.typeLabel,
                    targetLabel: labels.targetLabel,
                    modLabel: labels.modLabel,
                    reasonLabel: labels.reasonLabel,
                    durationLabel: labels.durationLabel,
                    permanent: labels.permanent
                },
                caseId: caseNumber,
                createdAt: modLog.createdAt
            }),
            flags: ['Ephemeral', 'IsComponentsV2']
        });
    }
}
