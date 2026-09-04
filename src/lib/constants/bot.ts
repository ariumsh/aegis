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

/**
 * Where the source for this bot lives.
 *
 * Aegis is AGPL-3.0. Section 13 requires that anyone who modifies it and runs
 * it for users over a network prominently offer those users the corresponding
 * source. A Discord bot is exactly that situation, so the offer is appended to
 * every mention reply rather than left to a README nobody in the server reads.
 *
 * If you fork and deploy this, point this at your fork. Leaving it pointing
 * here while running modified code does not satisfy the licence.
 */
export const SOURCE_URL = 'https://github.com/ariumsh/aegis';
