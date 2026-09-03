import { Command } from '@sapphire/framework';
import { resolveKey } from '@sapphire/plugin-i18next';
import { prisma } from '../../../../../database/db';
import { CacheManager } from '../../../../../database/CacheManager';
import { getMessageLayout } from '../../../../../lib/layouts/defaultLayout';
import { Emojis } from '../../../../../lib/constants/emojis';

export async function setGuildPrefix(interaction: Command.ChatInputCommandInteraction, guildId: string, newPrefix: string) {
    const config = await prisma.guildConfig.upsert({
        where: { guildId },
        create: { guildId, prefix: newPrefix },
        update: { prefix: newPrefix }
    });

    await CacheManager.syncGuild(guildId, config);

    const successMsg = await resolveKey(interaction, 'modules:config.prefix.success', { prefix: newPrefix });
    return interaction.editReply({ ...getMessageLayout(`${Emojis.check_emoji} ${successMsg}`) });
}
