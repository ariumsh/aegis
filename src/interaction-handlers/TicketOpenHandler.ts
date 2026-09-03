import { InteractionHandler, InteractionHandlerTypes } from '@sapphire/framework';
import { ChannelType, StringSelectMenuInteraction } from 'discord.js';
import { prisma } from '../database/db';
import { getTicketConfig, getNextTicketNumber, buildChannelPermissions, logTicketEvent } from '../lib/utils/ticketUtils';
import { getTicketWelcomeLayout } from '../lib/layouts/ticketLayouts';


// Handles the category select menu on the panel message ──────────────────

export class TicketOpenHandler extends InteractionHandler {
    public constructor(ctx: InteractionHandler.LoaderContext, options: InteractionHandler.Options) {
        super(ctx, { ...options, interactionHandlerType: InteractionHandlerTypes.SelectMenu });
    }

    public override parse(interaction: StringSelectMenuInteraction) {
        if (interaction.customId !== 'ticket_category_select') return this.none();
        return this.some();
    }

    public async run(interaction: StringSelectMenuInteraction) {
        const { guild, user } = interaction;
        if (!guild) return;

        const category = interaction.values[0] as 'general' | 'reports' | 'appeals';

        await interaction.deferReply({ ephemeral: true } as any);

        const config = await getTicketConfig(guild.id);
        if (!config.module) {
            return interaction.editReply('The tickets module is not enabled.');
        }

        // Atomic lock: SET NX prevents race conditions from double-clicking
        const redis = this.container.redis;
        const lockKey = `tickets:open:${guild.id}:${user.id}`;
        const placeholderSet = await redis.set(lockKey, 'pending', 'EX', 30, 'NX');
        if (!placeholderSet) {
            return interaction.editReply('You already have an open ticket!');
        }

        try {
            const ticketNumber = await getNextTicketNumber(guild.id);
            const permissionOverwrites = buildChannelPermissions(guild, user.id, config.supporterRoleIds);

            const channel = await guild.channels.create({
                name: `ticket-${ticketNumber}`,
                type: ChannelType.GuildText,
                parent: config.categoryId ?? undefined,
                permissionOverwrites,
                topic: `Ticket #${ticketNumber} | ${user.tag} | ${category}`
            });

            const ticket = await prisma.ticket.create({
                data: {
                    guildId: guild.id,
                    channelId: channel.id,
                    userId: user.id,
                    ticketNumber,
                    status: 'open'
                }
            });

            // Replace placeholder with real ticketId — persist indefinitely (cleared on close/reopen)
            await redis.set(lockKey, String(ticket.id));
            await redis.set(
                `tickets:channel_map:${guild.id}:${channel.id}`,
                JSON.stringify({ ticketId: ticket.id, userId: user.id })
            );

            await channel.send(getTicketWelcomeLayout(ticketNumber, user.id, false, null) as any);
            await logTicketEvent('opened', ticket, user.id, guild, config);

            return interaction.editReply(`Ticket opened! Head over to <#${channel.id}>`);
        } catch (err) {
            // Clean up the lock so the user can retry
            await redis.del(lockKey);
            this.container.logger.error('[TICKET_OPEN] Error creating ticket:', err);
            return interaction.editReply('Failed to open ticket. Please try again.');
        }
    }
}
