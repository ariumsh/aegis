import { InteractionHandler, InteractionHandlerTypes } from '@sapphire/framework';
import { ButtonInteraction, TextChannel } from 'discord.js';
import { prisma } from '../database/db';
import { getTicketConfig, logTicketEvent, closeTicket } from '../lib/utils/ticketUtils';
import { getTicketWelcomeLayout, getReminderCountdownLayout } from '../lib/layouts/ticketLayouts';
import { scheduleAutoClose } from '../lib/utils/ticketQueue';


// Handles all ticket action buttons: close, claim, remind, reopen, delete ──────────────────

export class TicketActionHandler extends InteractionHandler {
    public constructor(ctx: InteractionHandler.LoaderContext, options: InteractionHandler.Options) {
        super(ctx, { ...options, interactionHandlerType: InteractionHandlerTypes.Button });
    }

    public override parse(interaction: ButtonInteraction) {
        // Catch all ticket_ prefixed buttons except ticket_open (handled by TicketOpenHandler)
        if (!interaction.customId.startsWith('ticket_')) return this.none();
        if (interaction.customId === 'ticket_open') return this.none();
        return this.some();
    }

    public async run(interaction: ButtonInteraction) {
        const { guild, user, customId } = interaction;
        const channel = interaction.channel as TextChannel | null;
        if (!guild || !channel) return;

        const ticket = await prisma.ticket.findUnique({ where: { channelId: channel.id } });
        if (!ticket) {
            return interaction.reply({ content: 'Ticket not found.', ephemeral: true } as any);
        }

        const config = await getTicketConfig(guild.id);
        const member = interaction.member as any;
        const isSupporterRole = config.supporterRoleIds.some(roleId =>
            member?.roles?.cache?.has(roleId)
        );

        switch (customId) {

            // ── Close ──────────────────

            case 'ticket_close': {
                if (!isSupporterRole && ticket.userId !== user.id) {
                    return interaction.reply({ content: 'Only supporters or the ticket owner can close this ticket.', ephemeral: true } as any);
                }
                if (ticket.status !== 'open') {
                    return interaction.reply({ content: 'This ticket is already closed.', ephemeral: true } as any);
                }
                await interaction.deferUpdate();
                await closeTicket(ticket, guild, config, user.id, 'manual');
                break;
            }

            // ── Claim ──────────────────

            case 'ticket_claim': {
                if (!isSupporterRole) {
                    return interaction.reply({ content: 'Only supporters can claim tickets.', ephemeral: true } as any);
                }
                if (ticket.claimedById) {
                    return interaction.reply({ content: `This ticket is already claimed by <@${ticket.claimedById}>.`, ephemeral: true } as any);
                }
                await interaction.deferUpdate();
                const claimedTicket = await prisma.ticket.update({
                    where: { id: ticket.id },
                    data: { claimedById: user.id }
                });

                await this.editWelcomeMessage(
                    guild.id,
                    ticket.id,
                    channel,
                    getTicketWelcomeLayout(ticket.ticketNumber, ticket.userId, true, user.id)
                );

                await logTicketEvent('claimed', claimedTicket, user.id, guild, config);
                await interaction.followUp({ content: `You claimed ticket #${ticket.ticketNumber}.`, ephemeral: true } as any);
                break;
            }

            // ── Remind (triggers auto-close timer) ──────────────────

            case 'ticket_remind': {
                if (ticket.claimedById !== user.id) {
                    const msg = ticket.claimedById
                        ? 'Only the staff member who claimed this ticket can send a reminder.'
                        : 'This ticket must be claimed before a reminder can be sent.';
                    return interaction.reply({ content: msg, ephemeral: true } as any);
                }

                // Anti-spam lock: one reminder per 30 seconds
                const lockKey = `tickets:remind_lock:${ticket.id}`;
                const locked = await this.container.redis.set(lockKey, '1', 'EX', 30, 'NX');
                if (!locked) {
                    return interaction.reply({ content: 'A reminder was already sent recently. Wait 30 seconds.', ephemeral: true } as any);
                }

                await interaction.deferUpdate();
                const closeAtUnix = Math.floor((Date.now() + 1200000) / 1000); // 20 minutes
                await channel.send(getReminderCountdownLayout(ticket.userId, closeAtUnix) as any);

                const jobId = await scheduleAutoClose(
                    { guildId: guild.id, ticketId: ticket.id, channelId: ticket.channelId, userId: ticket.userId },
                    1200000
                );
                await prisma.ticket.update({ where: { id: ticket.id }, data: { autoCloseJobId: jobId } });
                await this.container.redis.set(`tickets:autoclose_job:${guild.id}:${ticket.id}`, jobId, 'EX', 1300);

                await interaction.followUp({ content: 'Reminder sent. Ticket will auto-close in 20 minutes if there is no response.', ephemeral: true } as any);
                break;
            }

            // ── Reopen ──────────────────

            case 'ticket_reopen': {
                if (!isSupporterRole) {
                    return interaction.reply({ content: 'Only supporters can reopen tickets.', ephemeral: true } as any);
                }
                await interaction.deferUpdate();
                await prisma.ticket.update({
                    where: { id: ticket.id },
                    data: { status: 'open', claimedById: null, autoCloseJobId: null, closedAt: null }
                });

                // Restore user's channel permissions
                await channel.permissionOverwrites.create(ticket.userId, {
                    ViewChannel: true,
                    SendMessages: true,
                    ReadMessageHistory: true,
                    AttachFiles: true,
                    EmbedLinks: true
                });

                // Restore Redis runtime keys
                await this.container.redis.set(`tickets:open:${guild.id}:${ticket.userId}`, String(ticket.id));
                await this.container.redis.set(
                    `tickets:channel_map:${guild.id}:${ticket.channelId}`,
                    JSON.stringify({ ticketId: ticket.id, userId: ticket.userId })
                );

                await this.editWelcomeMessage(
                    guild.id,
                    ticket.id,
                    channel,
                    getTicketWelcomeLayout(ticket.ticketNumber, ticket.userId, false, null)
                );

                await logTicketEvent('reopened', ticket, user.id, guild, config);
                break;
            }

            // ── Delete ──────────────────

            case 'ticket_delete': {
                if (!isSupporterRole) {
                    return interaction.reply({ content: 'Only supporters can delete tickets.', ephemeral: true } as any);
                }
                if (ticket.status !== 'closed') {
                    return interaction.reply({ content: 'Close the ticket before deleting it.', ephemeral: true } as any);
                }
                await interaction.deferUpdate();
                await prisma.ticket.update({ where: { id: ticket.id }, data: { status: 'deleted' } });
                await this.container.redis.del(
                    `tickets:open:${guild.id}:${ticket.userId}`,
                    `tickets:channel_map:${guild.id}:${ticket.channelId}`
                );
                await logTicketEvent('deleted', ticket, user.id, guild, config);
                // Brief delay so the staff sees the interaction acknowledged before the channel disappears
                setTimeout(() => channel.delete('Ticket deleted by staff').catch(() => null), 3000);
                break;
            }
        }
    }

    /**
     * Edits the ticket's welcome message, found by the id stored when the ticket
     * was opened.
     *
     * Both call sites used to search the last ten messages for one authored by
     * the bot and edit the first match. That is whichever message the bot posted
     * most recently -- frequently the auto-close countdown rather than the
     * welcome -- so claiming a ticket after sending a reminder overwrote the
     * countdown and the pending close became invisible while still scheduled.
     *
     * Tickets opened before this change have no stored id; they keep the old
     * behaviour as a fallback rather than losing the update entirely.
     */
    private async editWelcomeMessage(
        guildId: string,
        ticketId: number,
        channel: TextChannel,
        payload: unknown
    ): Promise<void> {
        const key = `tickets:welcome_message:${guildId}:${ticketId}`;
        const messageId = await this.container.redis.get(key);

        if (messageId) {
            const edited = await channel.messages.edit(messageId, payload as any).catch(() => null);
            if (edited) return;
        }

        const recent = await channel.messages.fetch({ limit: 10 }).catch(() => null);
        const fallback = recent?.find((m) => m.author.id === channel.guild.members.me?.id);
        if (!fallback) return;

        await fallback.edit(payload as any).catch(() => null);
        await this.container.redis.set(key, fallback.id);
    }
}
