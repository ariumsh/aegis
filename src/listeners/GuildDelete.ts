import { ApplyOptions } from '@sapphire/decorators';
import { Listener } from '@sapphire/framework';
import { Events, type Guild } from 'discord.js';
import { scheduleGuildPurge } from '../services/GuildRetentionService';

// Guild removed ──────────────────
//
// Fires when the bot is kicked, banned, or the guild is deleted. Also fires
// during an outage on Discord's side, which is why the deletion is delayed and
// re-checked rather than done here and now.

@ApplyOptions<Listener.Options>({ event: Events.GuildDelete })
export class GuildDeleteListener extends Listener {
    public async run(guild: Guild) {
        // `unavailable` means Discord lost the guild, not that the bot left it.
        // Purging on that would delete a live server's history during an
        // incident the operator did not cause and cannot see.
        if (guild.available === false) return;

        this.container.logger.info(`[RETENTION] Removed from guild ${guild.id} (${guild.name ?? 'unknown'}).`);
        await scheduleGuildPurge(guild.id);
    }
}
