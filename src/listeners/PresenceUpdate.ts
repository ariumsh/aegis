import { ApplyOptions } from '@sapphire/decorators';
import { Listener } from '@sapphire/framework';
import { Presence, Events, ActivityType } from 'discord.js';
import { addVanityJob } from '../lib/utils/vanity';


// Presence update listener ──────────────────

@ApplyOptions<Listener.Options>({
    event: Events.PresenceUpdate
})
export class PresenceUpdateListener extends Listener {
    public async run(oldPresence: Presence | null, newPresence: Presence) {
        const { guild, member } = newPresence;
        if (!guild || !member || member.user.bot) return;

        const oldState = oldPresence?.activities.find(a => a.type === ActivityType.Custom)?.state ?? null;
        const newState = newPresence.activities.find(a => a.type === ActivityType.Custom)?.state ?? null;

        // Vanity block ──────────

        // Going offline says nothing about the custom status. Discord stops
        // publishing activities for an offline user entirely — invisible included
        // — so the presence is indistinguishable from one where the vanity was
        // cleared. Acting on it would strip the role and then re-announce on the
        // next reconnect, so it is ignored and the role is left where it is.
        if (newPresence.status === 'offline') return;

        // No previous presence means offline too: either they just came back or
        // the bot restarted and never saw them.
        const wasOffline = (oldPresence?.status ?? 'offline') === 'offline';

        // Coming back from offline the old text is unknown rather than empty, so
        // comparing against it proves nothing. Fall through and let the worker
        // reconcile against the role, which is the only state that survived.
        if (!wasOffline && oldState === newState) return;

        const vanityString = await this.container.redis.get(`vanity:string:${guild.id}`);
        if (!vanityString) return;

        const oldHas = oldState?.toLowerCase().includes(vanityString.toLowerCase()) ?? false;
        const newHas = newState?.toLowerCase().includes(vanityString.toLowerCase()) ?? false;

        // Same reasoning: skip the queue when nothing that matters moved, but only
        // when there was a real "before" to compare with.
        if (!wasOffline && oldHas === newHas) return;

        try {
            await addVanityJob(member, newHas);
            this.container.logger.info(`[VANITY] Status update for ${member.user.tag}. Job sent. hasVanity=${newHas}`);
        } catch (error) {
            this.container.logger.error(`[QUEUE-ERROR] ${error}`);
        }
    }
}
