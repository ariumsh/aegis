/**
 * Guilds that slash commands are registered to while developing.
 *
 * Global registration can take up to an hour to propagate, which makes testing
 * painful. Setting DEVELOPMENT_GUILD_IDS registers commands to those guilds
 * instead, where they appear instantly. Leave it empty in production so the
 * commands register globally.
 *
 * Format: a comma-separated list of guild IDs.
 */
export const developmentGuildIds: string[] =
    process.env.DEVELOPMENT_GUILD_IDS?.split(',')
        .map((id) => id.trim())
        .filter(Boolean) ?? [];
