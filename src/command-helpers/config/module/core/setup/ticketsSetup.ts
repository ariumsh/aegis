import { Subcommand } from '@sapphire/plugin-subcommands';
import { resolveKey } from '@sapphire/plugin-i18next';
import { TextChannel } from 'discord.js';
import { prisma } from '../../../../../database/db';
import { moduleIds, moduleTimeoutsMs } from '../constants';
import { resolveChannel, runSetupFlow } from './sharedConfirmation';
import { getTicketPanelLayout } from '../../../../../lib/layouts/ticketLayouts';
import { LabelComponent, TextInputComponent, RoleSelectModalComponent } from '../../../../../lib/layouts/ui';


// Tickets module setup ──────────────────

const TICKETS_INPUT_IDS = {
    panelChannel: 'tickets_panel_channel',
    category: 'tickets_category',
    transcriptChannel: 'tickets_transcript_channel',
    logChannel: 'tickets_log_channel',
    supporterRoles: 'tickets_supporter_roles'
} as const;


export async function handleTicketsSetup(interaction: Subcommand.ChatInputCommandInteraction) {
    const config = await prisma.guildConfig.findUnique({ where: { guildId: interaction.guildId! } });

    const modalTitle = await resolveKey(interaction, 'modules:module.setup.tickets.modal.title');
    const panelChannelLabel = await resolveKey(interaction, 'modules:module.setup.tickets.modal.panelChannelLabel');
    const panelChannelPlaceholder = await resolveKey(interaction, 'modules:module.setup.tickets.modal.panelChannelPlaceholder');
    const categoryLabel = await resolveKey(interaction, 'modules:module.setup.tickets.modal.categoryLabel');
    const categoryPlaceholder = await resolveKey(interaction, 'modules:module.setup.tickets.modal.categoryPlaceholder');
    const transcriptChannelLabel = await resolveKey(interaction, 'modules:module.setup.tickets.modal.transcriptChannelLabel');
    const transcriptChannelPlaceholder = await resolveKey(interaction, 'modules:module.setup.tickets.modal.transcriptChannelPlaceholder');
    const logChannelLabel = await resolveKey(interaction, 'modules:module.setup.tickets.modal.logChannelLabel');
    const logChannelPlaceholder = await resolveKey(interaction, 'modules:module.setup.tickets.modal.logChannelPlaceholder');
    const supporterRolesLabel = await resolveKey(interaction, 'modules:module.setup.tickets.modal.supporterRolesLabel');
    const supporterRolesPlaceholder = await resolveKey(interaction, 'modules:module.setup.tickets.modal.supporterRolesPlaceholder');

    await (interaction.showModal as any)({
        title: modalTitle,
        custom_id: `tickets_setup_${interaction.id}`,
        components: [
            LabelComponent(panelChannelLabel, TextInputComponent(TICKETS_INPUT_IDS.panelChannel, 1, {
                placeholder: panelChannelPlaceholder,
                value: config?.ticketsPanelChannelId ?? '',
                required: true
            })),
            LabelComponent(categoryLabel, TextInputComponent(TICKETS_INPUT_IDS.category, 1, {
                placeholder: categoryPlaceholder,
                value: config?.ticketsCategoryId ?? '',
                required: false
            })),
            LabelComponent(transcriptChannelLabel, TextInputComponent(TICKETS_INPUT_IDS.transcriptChannel, 1, {
                placeholder: transcriptChannelPlaceholder,
                value: config?.ticketsTranscriptChannelId ?? '',
                required: false
            })),
            LabelComponent(logChannelLabel, TextInputComponent(TICKETS_INPUT_IDS.logChannel, 1, {
                placeholder: logChannelPlaceholder,
                value: config?.ticketsLogChannelId ?? '',
                required: false
            })),
            LabelComponent(supporterRolesLabel, RoleSelectModalComponent(TICKETS_INPUT_IDS.supporterRoles, supporterRolesPlaceholder, 10, false)),
        ]
    });

    const modalSubmit = await interaction.awaitModalSubmit({
        time: moduleTimeoutsMs.setupModal,
        filter: (i) => i.customId === `tickets_setup_${interaction.id}`
    }).catch(() => null);

    if (!modalSubmit) return;

    await modalSubmit.deferReply();

    const { guild } = modalSubmit;
    const panelChannelRaw = modalSubmit.fields.getTextInputValue(TICKETS_INPUT_IDS.panelChannel).trim();
    const categoryRaw = modalSubmit.fields.getTextInputValue(TICKETS_INPUT_IDS.category).trim();
    const transcriptChannelRaw = modalSubmit.fields.getTextInputValue(TICKETS_INPUT_IDS.transcriptChannel).trim();
    const logChannelRaw = modalSubmit.fields.getTextInputValue(TICKETS_INPUT_IDS.logChannel).trim();
    const supporterRoleIds = ((modalSubmit.fields.getSelectedRoles(TICKETS_INPUT_IDS.supporterRoles) ?? []) as any[]).map((r: any) => r.id as string);

    // Validate panel channel (required)
    const panelChannelResult = await resolveChannel(modalSubmit, panelChannelRaw, guild!, 'tickets');
    if (panelChannelResult.error) {
        return modalSubmit.editReply({ content: panelChannelResult.error });
    }
    if (!panelChannelResult.resolvedId && !panelChannelRaw) {
        return modalSubmit.editReply({ content: 'A panel channel is required. Please provide an existing channel ID.' });
    }

    // Preview actions
    const previewActions: string[] = [panelChannelResult.action];
    if (categoryRaw) previewActions.push(`Use category: <#${categoryRaw}>`);
    if (transcriptChannelRaw) previewActions.push(`Transcript channel: <#${transcriptChannelRaw}>`);
    if (logChannelRaw) previewActions.push(`Log channel: <#${logChannelRaw}>`);
    if (supporterRoleIds.length) previewActions.push(`Supporter roles: ${supporterRoleIds.map((id: string) => `<@&${id}>`).join(', ')}`);
    previewActions.push('Send panel message to panel channel');

    await runSetupFlow(
        modalSubmit,
        moduleIds.tickets,
        previewActions,
        async (data, summaryActions) => {
            // Panel channel (must exist — we don't auto-create it since it's typically a public channel)
            let panelChannelId: string;
            if (panelChannelResult.resolvedId) {
                panelChannelId = panelChannelResult.resolvedId;
            } else {
                // Treat input as a channel ID that wasn't a snowflake format — try fetching by name
                const found = guild!.channels.cache.find(c => c.name === panelChannelRaw);
                if (!found) {
                    summaryActions.push(`Panel channel "${panelChannelRaw}" not found — skipping.`);
                    return;
                }
                panelChannelId = found.id;
            }
            data.ticketsPanelChannelId = panelChannelId;
            summaryActions.push(`Panel channel linked: <#${panelChannelId}>`);

            // Category
            if (categoryRaw && /^\d{17,20}$/.test(categoryRaw)) {
                const cat = await guild!.channels.fetch(categoryRaw).catch(() => null);
                if (cat) {
                    data.ticketsCategoryId = categoryRaw;
                    summaryActions.push(`Category linked: <#${categoryRaw}>`);
                }
            }

            // Transcript channel
            if (transcriptChannelRaw && /^\d{17,20}$/.test(transcriptChannelRaw)) {
                const ch = await guild!.channels.fetch(transcriptChannelRaw).catch(() => null);
                if (ch) {
                    data.ticketsTranscriptChannelId = transcriptChannelRaw;
                    summaryActions.push(`Transcript channel linked: <#${transcriptChannelRaw}>`);
                }
            }

            // Log channel
            if (logChannelRaw && /^\d{17,20}$/.test(logChannelRaw)) {
                const ch = await guild!.channels.fetch(logChannelRaw).catch(() => null);
                if (ch) {
                    data.ticketsLogChannelId = logChannelRaw;
                    summaryActions.push(`Log channel linked: <#${logChannelRaw}>`);
                }
            }

            // Supporter roles
            if (supporterRoleIds.length) {
                data.ticketsSupporterRoleIds = supporterRoleIds;
                summaryActions.push(`Supporter roles: ${supporterRoleIds.map((id: string) => `<@&${id}>`).join(', ')}`);
            }

            // Send panel message — fetch the panel description from i18n
            const panelDescription = await resolveKey(modalSubmit, 'modules:module.setup.tickets.panelDescription').catch(() => 'Click the button below to open a ticket.');
            const avatarUrl = 'https://i.imgur.com/Tl7Am4j.png'; // Hammer logo as a placeholder
            const panelChannel = guild!.channels.cache.get(panelChannelId) as TextChannel | null;
            if (panelChannel) {
                const panelMsg = await panelChannel.send(getTicketPanelLayout(panelDescription, avatarUrl) as any).catch(() => null);
                if (panelMsg) {
                    data.ticketsPanelMessageId = panelMsg.id;
                    summaryActions.push(`Panel message sent to <#${panelChannelId}>`);
                }
            }
        }
    );
}
