import { InteractionHandler, InteractionHandlerTypes } from '@sapphire/framework';
import { ChannelType, StringSelectMenuInteraction } from 'discord.js';
import { getTicketConfig, createTicketWithNumber, buildChannelPermissions, logTicketEvent } from '../lib/utils/ticketUtils';
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

        // Created outside the try so the failure handler below can still see it
        // and clean up. Previously a channel created here survived a failed
        // insert as an orphan nobody owned.
        let channel: Awaited<ReturnType<typeof guild.channels.create>> | null = null;

        try {
            const permissionOverwrites = buildChannelPermissions(guild, user.id, config.supporterRoleIds);

            // Provisional name: the real number is only known once the row is
            // reserved, and reserving it needs a channel id.
            channel = await guild.channels.create({
                name: 'ticket',
                type: ChannelType.GuildText,
                parent: config.categoryId ?? undefined,
                permissionOverwrites
            });

            const ticket = await createTicketWithNumber(guild.id, channel.id, user.id);
            const ticketNumber = ticket.ticketNumber;

            await channel.edit({
                name: `ticket-${ticketNumber}`,
                topic: `Ticket #${ticketNumber} | ${user.tag} | ${category}`
            });

            // Replace placeholder with real ticketId — persist indefinitely (cleared on close/reopen)
            await redis.set(lockKey, String(ticket.id));
            await redis.set(
                `tickets:channel_map:${guild.id}:${channel.id}`,
                JSON.stringify({ ticketId: ticket.id, userId: user.id })
            );

            const welcome = await channel.send(getTicketWelcomeLayout(ticketNumber, user.id, false, null) as any);

            // Remembered rather than rediscovered. Claim and reopen used to look
            // for "the newest message from the bot" among the last ten, which
            // picks up whatever the bot posted most recently -- the auto-close
            // countdown, say -- and overwrite that instead.
            await redis.set(`tickets:welcome_message:${guild.id}:${ticket.id}`, welcome.id);

            await logTicketEvent('opened', ticket, user.id, guild, config);

            return interaction.editReply(`Ticket opened! Head over to <#${channel.id}>`);
        } catch (err) {
            // Release the lock so the user can retry, and take the channel with
            // it: leaving it behind gives them a ticket channel with no ticket.
            await redis.del(lockKey);
            if (channel) await channel.delete('Ticket creation failed').catch(() => null);
            this.container.logger.error('[TICKET_OPEN] Error creating ticket:', err);
            return interaction.editReply('Failed to open ticket. Please try again.');
        }
    }
}
