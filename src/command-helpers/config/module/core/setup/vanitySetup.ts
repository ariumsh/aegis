import { Subcommand } from '@sapphire/plugin-subcommands';
import { resolveKey } from '@sapphire/plugin-i18next';
import { ActionRowBuilder, ModalBuilder, TextInputBuilder, TextInputStyle } from 'discord.js';
import { prisma } from '../../../../../database/db';
import { moduleDefaults, moduleIds, moduleTextInputIds, moduleTimeoutsMs } from '../constants';
import { resolveChannel, resolveRole, runSetupFlow, createPrivateChannel } from './sharedConfirmation';

export async function handleVanitySetup(interaction: Subcommand.ChatInputCommandInteraction) {
    const config = await prisma.guildConfig.findUnique({ where: { guildId: interaction.guildId! } });
    const modalTitle = await resolveKey(interaction, 'modules:module.setup.vanity.modal.title');
    const keywordLabel = await resolveKey(interaction, 'modules:module.setup.vanity.modal.keywordLabel');
    const keywordPlaceholder = await resolveKey(interaction, 'modules:module.setup.vanity.modal.keywordPlaceholder');
    const roleLabel = await resolveKey(interaction, 'modules:module.setup.vanity.modal.roleLabel');
    const rolePlaceholder = await resolveKey(interaction, 'modules:module.setup.vanity.modal.rolePlaceholder');
    const channelLabel = await resolveKey(interaction, 'modules:module.setup.vanity.modal.channelLabel');
    const channelPlaceholder = await resolveKey(interaction, 'modules:module.setup.vanity.modal.channelPlaceholder');

    const modal = new ModalBuilder()
        .setCustomId(`vanity_setup_${interaction.id}`)
        .setTitle(modalTitle)
        .addComponents(
            new ActionRowBuilder<TextInputBuilder>().addComponents(
                new TextInputBuilder()
                    .setCustomId(moduleTextInputIds.keyword)
                    .setLabel(keywordLabel)
                    .setStyle(TextInputStyle.Short)
                    .setRequired(true)
                    .setPlaceholder(keywordPlaceholder)
                    .setMaxLength(100)
                    .setValue(config?.vanityString ?? '')
            ),
            new ActionRowBuilder<TextInputBuilder>().addComponents(
                new TextInputBuilder()
                    .setCustomId(moduleTextInputIds.role)
                    .setLabel(roleLabel)
                    .setStyle(TextInputStyle.Short)
                    .setRequired(false)
                    .setPlaceholder(rolePlaceholder)
                    .setValue(config?.vanityRoleId ?? '')
            ),
            new ActionRowBuilder<TextInputBuilder>().addComponents(
                new TextInputBuilder()
                    .setCustomId(moduleTextInputIds.channel)
                    .setLabel(channelLabel)
                    .setStyle(TextInputStyle.Short)
                    .setRequired(false)
                    .setPlaceholder(channelPlaceholder)
                    .setValue(config?.vanityChannelId ?? '')
            )
        );

    await interaction.showModal(modal);

    const modalSubmit = await interaction.awaitModalSubmit({
        time: moduleTimeoutsMs.setupModal,
        filter: (i) => i.customId === `vanity_setup_${interaction.id}`
    }).catch(() => null);

    if (!modalSubmit) return;

    await modalSubmit.deferReply();

    const { guild } = modalSubmit;
    const keyword = modalSubmit.fields.getTextInputValue(moduleTextInputIds.keyword);
    const roleRaw = modalSubmit.fields.getTextInputValue(moduleTextInputIds.role).trim();
    const channelRaw = modalSubmit.fields.getTextInputValue(moduleTextInputIds.channel).trim();

    const roleResult = await resolveRole(modalSubmit, roleRaw, guild!, `Vanity Role [${guild!.name}]`);
    if (roleResult.error) {
        return modalSubmit.editReply({ content: roleResult.error });
    }

    const channelResult = await resolveChannel(modalSubmit, channelRaw, guild!, moduleDefaults.vanityChannelName);
    if (channelResult.error) {
        return modalSubmit.editReply({ content: channelResult.error });
    }

    const setKeyword = await resolveKey(modalSubmit, 'modules:module.setup.summary.setKeyword', { keyword });

    await runSetupFlow(
        modalSubmit,
        moduleIds.vanity,
        [setKeyword, roleResult.action, channelResult.action],
        async (data, summaryActions) => {
            data.vanityString = keyword;
            const keywordSet = await resolveKey(modalSubmit, 'modules:module.setup.summary.keywordSet', { keyword });
            summaryActions.push(keywordSet);

            if (roleResult.resolvedId) {
                data.vanityRoleId = roleResult.resolvedId;
                data.vanityRoleCreatedByBot = false;
                const roleLinked = await resolveKey(modalSubmit, 'modules:module.setup.summary.roleLinked', { id: roleResult.resolvedId });
                summaryActions.push(roleLinked);
            } else {
                const newRole = await guild!.roles.create({ name: roleRaw || `Vanity Role [${guild!.name}]` });
                data.vanityRoleId = newRole.id;
                data.vanityRoleCreatedByBot = true;
                const roleCreated = await resolveKey(modalSubmit, 'modules:module.setup.summary.roleCreated', { id: newRole.id });
                summaryActions.push(roleCreated);
            }

            if (channelResult.resolvedId) {
                data.vanityChannelId = channelResult.resolvedId;
                data.vanityChannelCreatedByBot = false;
                const channelLinked = await resolveKey(modalSubmit, 'modules:module.setup.summary.channelLinked', { id: channelResult.resolvedId });
                summaryActions.push(channelLinked);
            } else {
                const newChannel = await createPrivateChannel(guild!, channelRaw || moduleDefaults.vanityChannelName);
                data.vanityChannelId = newChannel.id;
                data.vanityChannelCreatedByBot = true;
                const channelCreated = await resolveKey(modalSubmit, 'modules:module.setup.summary.channelCreated', { id: newChannel.id });
                summaryActions.push(channelCreated);
            }
        }
    );
}
