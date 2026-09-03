/**
 * Bot-wide identity constants.
 *
 * The default prefix used to be a bare 'a!' literal repeated across the client,
 * the cache layer, the prefix-command error handler and the database schema
 * default. Four copies of the same decision drift apart the moment one of them
 * is changed, so they now read from here.
 *
 * The schema default in prisma/schema.prisma is the one copy that cannot import
 * this — it is declarative — so changing DEFAULT_PREFIX also means writing a
 * migration for the guild_configs.prefix default.
 */
export const DEFAULT_PREFIX = 'a!';

/**
 * Name the bot registers its webhooks under, and matches on when looking for
 * one it already created.
 *
 * This is compared against live Discord state: a webhook created under a
 * different name is invisible to the lookup, and the bot will create a second
 * one alongside it rather than reuse it. Treat a change here as a data
 * migration, not a rename.
 */
export const WEBHOOK_NAME = 'Aegis';
