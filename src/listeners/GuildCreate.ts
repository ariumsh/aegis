import { ApplyOptions } from '@sapphire/decorators';
import { Listener } from '@sapphire/framework';
import { Events, type Guild } from 'discord.js';
import { cancelGuildPurge } from '../services/GuildRetentionService';

// Guild joined ──────────────────
//
// Being removed and re-added is common: a permissions mistake, a server
// rebuild, a brief argument. Coming back inside the grace period cancels the
// pending deletion, so the guild's configuration and moderation history are
// still there.

@ApplyOptions<Listener.Options>({ event: Events.GuildCreate })
export class GuildCreateListener extends Listener {
    public async run(guild: Guild) {
        await cancelGuildPurge(guild.id);
    }
}
