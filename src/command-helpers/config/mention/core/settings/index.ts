import { Command } from '@sapphire/framework';
import { resolveKey } from '@sapphire/plugin-i18next';
import { prisma } from '../../../../../database/db';
import { CacheManager } from '../../../../../database/CacheManager';
import { getMessageLayout } from '../../../../../lib/layouts/defaultLayout';
import { Emojis } from '../../../../../lib/constants/emojis';

export async function setMentionResponse(
    interaction: Command.ChatInputCommandInteraction,
    guildId: string,
    text: string | null
) {
    const config = await prisma.guildConfig.upsert({
        where:  { guildId },
        create: { guildId, mentionResponse: text ?? undefined },
        update: { mentionResponse: text }
    });

    await CacheManager.syncGuild(guildId, config);

    const i18nKey = text === null
        ? 'modules:config.mention.reset'
        : 'modules:config.mention.success';

    const msg = await resolveKey(interaction, i18nKey, {
        check: Emojis.check_emoji
    });

    return interaction.editReply({ ...getMessageLayout(msg) });
}
