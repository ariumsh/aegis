import { Subcommand } from '@sapphire/plugin-subcommands';
import { resolveKey } from '@sapphire/plugin-i18next';
import { ActionRowBuilder, ModalBuilder, TextInputBuilder, TextInputStyle } from 'discord.js';
import { prisma } from '../../../../../database/db';
import { syncMutedRoleOverwrites } from '../../../../../lib/utils/ModUtils';
import {
    moduleConfirmInputs,
    moduleDefaults,
    moduleIds,
    moduleTextInputIds,
    moduleTimeoutsMs
} from '../constants';
import { createPrivateChannel, resolveChannel, resolveRole, runSetupFlow } from './sharedConfirmation';

export async function handleModSetup(interaction: Subcommand.ChatInputCommandInteraction) {
    const config = await prisma.guildConfig.findUnique({ where: { guildId: interaction.guildId! } });
    const modalTitle = await resolveKey(interaction, 'modules:module.setup.mod.modal.title');
    const logChannelLabel = await resolveKey(interaction, 'modules:module.setup.mod.modal.logChannelLabel');
    const logChannelPlaceholder = await resolveKey(interaction, 'modules:module.setup.mod.modal.logChannelPlaceholder');
    const mutedRoleLabel = await resolveKey(interaction, 'modules:module.setup.mod.modal.mutedRoleLabel');
    const mutedRolePlaceholder = await resolveKey(interaction, 'modules:module.setup.mod.modal.mutedRolePlaceholder');
    const thresholdsLabel = await resolveKey(interaction, 'modules:module.setup.mod.modal.thresholdsLabel');
    const thresholdsPlaceholder = await resolveKey(interaction, 'modules:module.setup.mod.modal.thresholdsPlaceholder');
    const thresholdsValueEnabled = await resolveKey(interaction, 'modules:module.setup.mod.modal.thresholdsValueEnabled');
    const thresholdsValueDisabled = await resolveKey(interaction, 'modules:module.setup.mod.modal.thresholdsValueDisabled');

    const modal = new ModalBuilder()
        .setCustomId(`mod_setup_${interaction.id}`)
        .setTitle(modalTitle)
        .addComponents(
            new ActionRowBuilder<TextInputBuilder>().addComponents(
                new TextInputBuilder()
                    .setCustomId(moduleTextInputIds.logChannel)
                    .setLabel(logChannelLabel)
                    .setStyle(TextInputStyle.Short)
                    .setRequired(false)
                    .setPlaceholder(logChannelPlaceholder)
                    .setValue(config?.modLogChannelId ?? '')
            ),
            new ActionRowBuilder<TextInputBuilder>().addComponents(
                new TextInputBuilder()
                    .setCustomId(moduleTextInputIds.mutedRole)
                    .setLabel(mutedRoleLabel)
                    .setStyle(TextInputStyle.Short)
                    .setRequired(false)
                    .setPlaceholder(mutedRolePlaceholder)
                    .setValue(config?.mutedRoleId ?? '')
            ),
            new ActionRowBuilder<TextInputBuilder>().addComponents(
                new TextInputBuilder()
                    .setCustomId(moduleTextInputIds.thresholds)
                    .setLabel(thresholdsLabel)
                    .setStyle(TextInputStyle.Short)
                    .setRequired(false)
                    .setPlaceholder(thresholdsPlaceholder)
                    .setValue(config ? (config.modThresholdsEnabled ? thresholdsValueEnabled : thresholdsValueDisabled) : thresholdsValueEnabled)
            )
        );

    await interaction.showModal(modal);

    const modalSubmit = await interaction.awaitModalSubmit({
        time: moduleTimeoutsMs.setupModal,
        filter: (i) => i.customId === `mod_setup_${interaction.id}`
    }).catch(() => null);

    if (!modalSubmit) return;

    await modalSubmit.deferReply();

    const { guild } = modalSubmit;
    const channelRaw = modalSubmit.fields.getTextInputValue(moduleTextInputIds.logChannel).trim();
    const mutedRoleRaw = modalSubmit.fields.getTextInputValue(moduleTextInputIds.mutedRole).trim();
    const threshRaw = modalSubmit.fields.getTextInputValue(moduleTextInputIds.thresholds).trim().toLowerCase();

    const channelResult = await resolveChannel(modalSubmit, channelRaw, guild!, moduleDefaults.modLogChannelName);
    if (channelResult.error) {
        return modalSubmit.editReply({ content: channelResult.error });
    }

    const roleResult = await resolveRole(modalSubmit, mutedRoleRaw, guild!, moduleDefaults.mutedRoleName);
    if (roleResult.error) {
        return modalSubmit.editReply({ content: roleResult.error });
    }

    const thresholdsEnabled = moduleConfirmInputs.includes(threshRaw as (typeof moduleConfirmInputs)[number]) || threshRaw === '';
    const statusText = await resolveKey(modalSubmit, thresholdsEnabled ? 'modules:module.enabled' : 'modules:module.disabled');
    const thresholdsSummary = await resolveKey(modalSubmit, 'modules:module.setup.mod.summary.thresholds', { status: statusText });

    await runSetupFlow(
        modalSubmit,
        moduleIds.mod,
        [
            channelResult.action,
            roleResult.action,
            thresholdsSummary
        ],
        async (data, summaryActions) => {
            data.modThresholdsEnabled = thresholdsEnabled;
            summaryActions.push(thresholdsSummary);

            if (channelResult.resolvedId) {
                data.modLogChannelId = channelResult.resolvedId;
                data.modChannelCreatedByBot = false;
                const channelLinked = await resolveKey(modalSubmit, 'modules:module.setup.summary.channelLinked', { id: channelResult.resolvedId });
                summaryActions.push(channelLinked);
            } else {
                const newChannel = await createPrivateChannel(guild!, channelRaw || moduleDefaults.modLogChannelName);
                data.modLogChannelId = newChannel.id;
                data.modChannelCreatedByBot = true;
                const channelCreated = await resolveKey(modalSubmit, 'modules:module.setup.summary.channelCreated', { id: newChannel.id });
                summaryActions.push(channelCreated);
            }

            if (roleResult.resolvedId) {
                data.mutedRoleId = roleResult.resolvedId;
                data.modRoleCreatedByBot = false;
                const roleLinked = await resolveKey(modalSubmit, 'modules:module.setup.summary.roleLinked', { id: roleResult.resolvedId });
                summaryActions.push(roleLinked);

                const sync = await syncMutedRoleOverwrites(guild!, roleResult.resolvedId);
                const overwritesSynced = sync.failed > 0
                    ? await resolveKey(modalSubmit, 'modules:module.setup.mod.summary.mutedOverwritesWithFailures', {
                        updated: sync.updated,
                        failed: sync.failed
                    })
                    : await resolveKey(modalSubmit, 'modules:module.setup.mod.summary.mutedOverwrites', { updated: sync.updated });
                summaryActions.push(overwritesSynced);
            } else {
                const newRole = await guild!.roles.create({
                    name: mutedRoleRaw || moduleDefaults.mutedRoleName,
                    color: 0x818386,
                    reason: 'Aegis - Muted role auto-created'
                });
                data.mutedRoleId = newRole.id;
                data.modRoleCreatedByBot = true;
                const roleCreated = await resolveKey(modalSubmit, 'modules:module.setup.summary.roleCreated', { id: newRole.id });
                summaryActions.push(roleCreated);

                const sync = await syncMutedRoleOverwrites(guild!, newRole.id);
                const overwritesSynced = sync.failed > 0
                    ? await resolveKey(modalSubmit, 'modules:module.setup.mod.summary.mutedOverwritesWithFailures', {
                        updated: sync.updated,
                        failed: sync.failed
                    })
                    : await resolveKey(modalSubmit, 'modules:module.setup.mod.summary.mutedOverwrites', { updated: sync.updated });
                summaryActions.push(overwritesSynced);
            }
        }
    );
}
