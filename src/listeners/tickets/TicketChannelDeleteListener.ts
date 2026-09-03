import { ApplyOptions } from '@sapphire/decorators';
import { Listener } from '@sapphire/framework';
import { Events, GuildChannel } from 'discord.js';
import { prisma } from '../../database/db';


// Handles manual channel deletion for open/closed ticket channels ──────────────────

@ApplyOptions<Listener.Options>({ event: Events.ChannelDelete })
export class TicketChannelDeleteListener extends Listener {
    public async run(channel: GuildChannel) {
        if (!channel.guild) return;

        const ticket = await prisma.ticket.findUnique({ where: { channelId: channel.id } });
        if (!ticket || ticket.status === 'deleted') return;

        await prisma.ticket.update({
            where: { id: ticket.id },
            data: { status: 'deleted', closedAt: ticket.closedAt ?? new Date() }
        });

        await this.container.redis.del(
            `tickets:open:${channel.guild.id}:${ticket.userId}`,
            `tickets:channel_map:${channel.guild.id}:${ticket.channelId}`
        );

        this.container.logger.info(
            `[TICKETS] Channel ${channel.id} deleted manually. Ticket #${ticket.ticketNumber} marked as deleted.`
        );
    }
}
