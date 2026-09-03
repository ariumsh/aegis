import { Subcommand } from '@sapphire/plugin-subcommands';
import { resolveKey } from '@sapphire/plugin-i18next';
import { prisma } from '../../../../../database/db';
import { CacheManager } from '../../../../../database/CacheManager';
import { getStatusUpdateLayout } from '../../../../../lib/layouts/modCommandLayouts';
import { getMessageLayout } from '../../../../../lib/layouts/defaultLayout';
import { Emojis } from '../../../../../lib/constants/emojis';
import { ModuleValidators } from '../../../../../validators/ModuleValidator';
import { getDisplayNameKey, moduleOptionName } from '../constants';

export async function handleEnable(interaction: Subcommand.ChatInputCommandInteraction) {
    const { guildId, options, guild } = interaction;
    const moduleValue = options.getString(moduleOptionName, true);
    const displayName = await resolveKey(interaction, getDisplayNameKey(moduleValue));

    await interaction.deferReply();

    const config = await prisma.guildConfig.findUnique({ where: { guildId: guildId! } });
    const configKey = `${moduleValue}Module` as keyof typeof config;

    if (config && (config as any)[configKey] === true) {
        const alreadyEnabled = await resolveKey(interaction, 'modules:module.alreadyEnabled', { name: displayName });
        return interaction.editReply({ ...getMessageLayout(alreadyEnabled) });
    }

    const validator = ModuleValidators[moduleValue];
    if (!validator) {
        const validatorNotFound = await resolveKey(interaction, 'modules:module.errors.validatorNotFound');
        return interaction.editReply({ ...getMessageLayout(validatorNotFound) });
    }

    const { isValid, missing, needsChannel } = await validator(config, guild);

    if (!isValid) {
        if (needsChannel) {
            const needsLogChannel = await resolveKey(interaction, 'modules:module.errors.needsLogChannel', { name: displayName });
            return interaction.editReply({
                ...getMessageLayout(needsLogChannel)
            });
        }
        const setupFirst = await resolveKey(interaction, 'modules:module.errors.setupFirst');
        const cannotEnable = await resolveKey(interaction, 'modules:module.errors.cannotEnable', { name: displayName });
        const missingText = missing?.map((m) => `${Emojis.static_setting_emoji} ${m}`).join('\n') ?? setupFirst;
        return interaction.editReply({
            ...getMessageLayout(`${cannotEnable}\n${missingText}`)
        });
    }

    const updated = await prisma.guildConfig.update({
        where: { guildId: guildId! },
        data: { [configKey]: true }
    });
    await CacheManager.syncGuild(guildId!, updated);

    const enableSuccess = await resolveKey(interaction, 'modules:module.enableSuccess', { name: displayName });
    return interaction.editReply(getStatusUpdateLayout(displayName, enableSuccess, true));
}
