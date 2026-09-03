import { Subcommand } from '@sapphire/plugin-subcommands';
import { resolveKey } from '@sapphire/plugin-i18next';
import { ActionRowBuilder, ModalBuilder, PermissionFlagsBits, TextInputBuilder, TextInputStyle } from 'discord.js';
import { container } from '@sapphire/framework';
import { prisma } from '../../../../../database/db';
import { isCounterChannel, type CounterChannel } from '../../../../../lib/utils/counterStats';
import { moduleDefaults, moduleIds, moduleTextInputIds, moduleTimeoutsMs } from '../constants';
import { resolveChannel, runSetupFlow } from './sharedConfirmation';

/** The minimum needed to publish the message and keep editing it afterwards. */
const REQUIRED_PERMISSIONS = [
    PermissionFlagsBits.ViewChannel,
    PermissionFlagsBits.SendMessages
] as const;

function hasRequiredPermissions(channel: CounterChannel): boolean {
    const me = channel.guild.members.me;
    const permissions = me === null ? null : channel.permissionsFor(me);
    if (permissions === null) return false;

    return REQUIRED_PERMISSIONS.every((flag) => permissions.has(flag));
}

export async function handleCounterSetup(interaction: Subcommand.ChatInputCommandInteraction) {
    const config = await prisma.guildConfig.findUnique({ where: { guildId: interaction.guildId! } });
    const modalTitle = await resolveKey(interaction, 'modules:module.setup.counter.modal.title');
    const channelLabel = await resolveKey(interaction, 'modules:module.setup.counter.modal.channelLabel');
    const channelPlaceholder = await resolveKey(interaction, 'modules:module.setup.counter.modal.channelPlaceholder');

    const modal = new ModalBuilder()
        .setCustomId(`counter_setup_${interaction.id}`)
        .setTitle(modalTitle)
        .addComponents(
            new ActionRowBuilder<TextInputBuilder>().addComponents(
                new TextInputBuilder()
                    .setCustomId(moduleTextInputIds.channel)
                    .setLabel(channelLabel)
                    .setStyle(TextInputStyle.Short)
                    .setRequired(false)
                    .setPlaceholder(channelPlaceholder)
                    .setValue(config?.counterChannelId ?? '')
            )
        );

    await interaction.showModal(modal);

    const modalSubmit = await interaction.awaitModalSubmit({
        time: moduleTimeoutsMs.setupModal,
        filter: (i) => i.customId === `counter_setup_${interaction.id}`
    }).catch(() => null);

    if (!modalSubmit) return;

    await modalSubmit.deferReply();

    const { guild } = modalSubmit;
    const channelRaw = modalSubmit.fields.getTextInputValue(moduleTextInputIds.channel).trim();

    const channelResult = await resolveChannel(modalSubmit, channelRaw, guild!, moduleDefaults.counterChannelName);
    if (channelResult.error) {
        return modalSubmit.editReply({ content: channelResult.error });
    }

    // Validated up front rather than inside runSetupFlow: a throw in there is
    // reported as a generic failure, which would hide exactly what is wrong.
    let existingChannel: CounterChannel | null = null;

    if (channelResult.resolvedId) {
        const resolved = await guild!.channels.fetch(channelResult.resolvedId).catch(() => null);

        if (!isCounterChannel(resolved)) {
            const message = await resolveKey(modalSubmit, 'modules:module.setup.counter.errors.wrongChannelType');
            return modalSubmit.editReply({ content: message });
        }

        if (!hasRequiredPermissions(resolved)) {
            const message = await resolveKey(modalSubmit, 'modules:module.setup.counter.errors.missingPermissions', {
                id: resolved.id
            });
            return modalSubmit.editReply({ content: message });
        }

        existingChannel = resolved;
    }

    await runSetupFlow(
        modalSubmit,
        moduleIds.counter,
        [channelResult.action],
        async (data, summaryActions) => {
            // Created public on purpose: a member counter nobody can see is pointless.
            const channel =
                existingChannel ??
                ((await guild!.channels.create({
                    name: channelRaw || moduleDefaults.counterChannelName
                })) as CounterChannel);

            const channelKey = existingChannel
                ? 'modules:module.setup.summary.channelLinked'
                : 'modules:module.setup.summary.channelCreated';
            summaryActions.push(await resolveKey(modalSubmit, channelKey, { id: channel.id }));

            data.counterChannelId = channel.id;

            // Publishes and stores the message id. Safe to run before
            // runSetupFlow writes the row: the service upserts.
            await container.counterService.setChannel(guild!, channel);

            const published = await resolveKey(modalSubmit, 'modules:module.setup.counter.summary.published', {
                id: channel.id
            });
            summaryActions.push(published);
        }
    );
}
