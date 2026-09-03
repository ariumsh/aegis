import { ApplyOptions } from '@sapphire/decorators';
import { Listener } from '@sapphire/framework';
import { Events, type VoiceState } from 'discord.js';
import { isSilentBannedCached } from '../services/SilentBanService';
import { silentBanQueue } from '../lib/utils/SilentBanQueue';


// Voice state update listener ──────────────────
//
// The member counter reads voice out of the gateway cache, so it needs no
// request to know the number — only a nudge telling it the number moved. That
// nudge is what puts the counter within a second or two of reality instead of
// waiting for its own timer.

@ApplyOptions<Listener.Options>({
    event: Events.VoiceStateUpdate
})
export class VoiceStateUpdateListener extends Listener {
    public run(oldState: VoiceState, newState: VoiceState) {
        // The event also fires for mute, deafen and stream toggles, none of which
        // change how many people are in voice. Only connections matter here.
        if (oldState.channelId === newState.channelId) return;

        const guildId = newState.guild?.id ?? oldState.guild?.id;
        if (!guildId) return;

        // Cheap and guild-scoped: it no-ops unless the module is published there.
        this.container.counterService?.notifyVoiceChange(guildId);

        // Silent ban enforcement. addSilentBan disconnects once at the moment of
        // sanction, which a user defeats by simply rejoining; without this the
        // voice half of the ban lasts only until they click the channel again.
        const userId = newState.id ?? oldState.id;
        if (newState.channelId !== null && userId && isSilentBannedCached(guildId, userId)) {
            void silentBanQueue
                .add(
                    'voice_disconnect',
                    { guildId, userId },
                    // Collapses a burst of rejoin attempts into one job.
                    { jobId: `vcdis-${guildId}-${userId}-${Math.floor(Date.now() / 5000)}` }
                )
                .catch((error: any) =>
                    this.container.logger.error(
                        `[SILENTBAN] Could not enqueue voice disconnect for ${userId}: ${error?.message ?? error}`
                    )
                );
        }
    }
}
