import { ApplyOptions } from '@sapphire/decorators';
import { Listener } from '@sapphire/framework';
import { Events, Message } from 'discord.js';
import { prisma } from '../../database/db';
import { cancelAutoClose } from '../../lib/utils/ticketQueue';


// Cancels a pending auto-close when the ticket owner replies ──────────────────

@ApplyOptions<Listener.Options>({ event: Events.MessageCreate })
export class TicketMessageListener extends Listener {
    public async run(message: Message) {
        if (!message.guild || message.author.bot) return;

        const channelMapKey = `tickets:channel_map:${message.guild.id}:${message.channel.id}`;
        const channelData = await this.container.redis.get(channelMapKey);
        if (!channelData) return;

        const { ticketId, userId } = JSON.parse(channelData);
        // Only the ticket owner's reply resets the timer
        if (message.author.id !== userId) return;

        const jobIdKey = `tickets:autoclose_job:${message.guild.id}:${ticketId}`;
        const jobId = await this.container.redis.get(jobIdKey);
        if (!jobId) return;

        // Cancel the queued auto-close job
        await cancelAutoClose(jobId).catch(() => null);
        await prisma.ticket.update({ where: { id: ticketId }, data: { autoCloseJobId: null } });
        await this.container.redis.del(jobIdKey, `tickets:remind_lock:${ticketId}`);
        await message.react('✅').catch(() => null);
    }
}
