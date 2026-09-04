import { ApplyOptions } from '@sapphire/decorators';
import { Listener } from '@sapphire/framework';
import { resolveKey } from '@sapphire/plugin-i18next';
import { Events, type Message } from 'discord.js';
import { CacheManager } from '../../database/CacheManager';
import { SOURCE_URL } from '../../lib/constants/bot';

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

        // AGPL-3.0 section 13: anyone running a modified copy for users over a
        // network must prominently offer those users the corresponding source.
        // Appended unconditionally rather than folded into defaultResponse,
        // because a guild can replace that message entirely — and the offer
        // disappearing the moment someone customises their greeting is exactly
        // the failure mode the clause exists to prevent.
        const sourceOffer = await resolveKey(message, 'modules:config.mention.sourceOffer', { url: SOURCE_URL })
            .catch(() => `-# Source: ${SOURCE_URL} · AGPL-3.0`);

        await message.reply({ content: `${replyText}\n${sourceOffer}` }).catch(() => {});
    }
}
