import { ApplyOptions } from '@sapphire/decorators';
import { Listener } from '@sapphire/framework';
import { Events, Message } from 'discord.js';
import { isSilentBannedCached } from '../../services/SilentBanService';
import { silentBanQueue } from '../../lib/utils/SilentBanQueue';


// Silent ban enforcement ──────────────────
//
// A silent ban is meant to make someone's participation disappear without
// telling them: their messages are removed, and they are pulled out of voice.
// The command, the queue and the worker for all of that already existed — but
// nothing ever consulted the ban or enqueued the deletion, so the sanction was
// recorded and never applied.
//
// The lookup is a synchronous in-memory check, which matters because this runs
// on every message the bot can see. Only once a user is actually banned does
// anything reach Redis.

@ApplyOptions<Listener.Options>({
    event: Events.MessageCreate
})
export class SilentBanListener extends Listener {
    public async run(message: Message) {
        if (!message.guild || message.author.bot) return;

        if (!isSilentBannedCached(message.guild.id, message.author.id)) return;

        try {
            // Deleted through the queue rather than inline so a burst of
            // messages is spread across the worker's rate limiting instead of
            // firing one REST call per message from the gateway handler.
            //
            // The job id makes a retry idempotent: the same message enqueued
            // twice is one job, and deleting an already-deleted message is a
            // no-op in the worker.
            await silentBanQueue.add(
                'message_delete',
                {
                    guildId: message.guild.id,
                    channelId: message.channel.id,
                    messageId: message.id
                },
                { jobId: `msgdel-${message.id}` }
            );
        } catch (error) {
            this.container.logger.error(
                `[SILENTBAN] Could not enqueue deletion for message ${message.id}: ${(error as Error).message}`
            );
        }
    }
}
