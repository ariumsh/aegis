import { Command } from '@sapphire/framework';
import { resolveKey } from '@sapphire/plugin-i18next';
import { Message } from 'discord.js';
import { prisma } from '../../../../../database/db';
import { CacheManager } from '../../../../../database/CacheManager';
import { Emojis } from '../../../../../lib/constants/emojis';
import { getMessageLayout } from '../../../../../lib/layouts/defaultLayout';
import { toLanguageDisplay } from '../constants';

export async function setGuildLanguage(
    target: Command.ChatInputCommandInteraction | Message,
    guildId: string,
    newLocale: string
) {
    const updated = await prisma.guildConfig.upsert({
        where: { guildId },
        update: { locale: newLocale },
        create: { guildId, locale: newLocale }
    });

    await CacheManager.syncGuild(guildId, updated);

    const langDisplay = toLanguageDisplay(newLocale);
    const successMessage = await resolveKey(target, 'modules:config.language.success', {
        lang: langDisplay,
        check: Emojis.check_emoji
    });

    const layout = getMessageLayout(successMessage);
    if (target instanceof Message) {
        return target.reply(layout);
    }

    return target.editReply(layout);
}
