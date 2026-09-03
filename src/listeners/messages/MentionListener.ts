import { ApplyOptions } from '@sapphire/decorators';
import { Listener } from '@sapphire/framework';
import { resolveKey } from '@sapphire/plugin-i18next';
import { Events, type Message } from 'discord.js';
import { CacheManager } from '../../database/CacheManager';

@ApplyOptions<Listener.Options>({
    event: Events.MessageCreate
})
export class MentionListener extends Listener {
    public async run(message: Message) {
        if (message.author.bot || !message.guild) return;

        const botId = this.container.client.user?.id;
        if (!botId) return;

        const mentionPrefix = new RegExp(`^<@!?${botId}>\\s*`);
        if (!mentionPrefix.test(message.content)) return;

        const guildId = message.guild.id;

        const [mentionResponse, prefix] = await Promise.all([
            CacheManager.getMentionResponse(guildId),
            CacheManager.getPrefix(guildId)
        ]);

        const replyText = mentionResponse ?? await resolveKey(message, 'modules:config.mention.defaultResponse', { prefix });

        await message.reply({ content: replyText }).catch(() => {});
    }
}
