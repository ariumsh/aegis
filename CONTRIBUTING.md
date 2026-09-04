# Contributing to Aegis

Thanks for taking an interest. This document is short on ceremony and specific
about the things that actually cause problems in this codebase.

## Before you start

Aegis is **AGPL-3.0-or-later**. Contributing means licensing your work under the
same terms. If that does not work for you, open an issue and say so before
writing code rather than after.

## Setup

```bash
git clone https://github.com/ariumsh/aegis.git
cd aegis
cp .env.example .env      # set DISCORD_TOKEN at minimum
docker compose up -d      # PostgreSQL on 5433, Redis on 6380
pnpm install
pnpm exec prisma generate
pnpm exec prisma migrate deploy
pnpm run dev
```

Set `DEVELOPMENT_GUILD_IDS` to a test server you own. Without it, slash commands
register globally and can take an hour to appear.

## Before opening a pull request

```bash
pnpm run typecheck   # src/ and tests/
pnpm run lint        # must be 0 errors, 0 warnings
pnpm run test
pnpm run build
```

CI runs all four plus a repository hygiene job and a Docker image build. All of
them must pass; they are required status checks and cannot be bypassed.

## Branches and commits

`feature/* → develop → main`. Nothing is pushed directly to either protected
branch, including by maintainers — branch protection enforces this for
administrators too.

Commit subjects follow `type(scope): summary`, where scope names the file, files
or area touched:

```
fix(lib/utils/ModUtils.ts): apply the timeout before recording it
security(permissionGuard.ts, commands/mod): guard the prefix command paths
test(tests): cover the six-step permission resolution order
```

Types in use: `feat`, `fix`, `chore`, `docs`, `test`, `ci`, `perf`, `security`,
`i18n`.

Keep commits small and atomic. A commit that changes one thing and explains
*why* in its body is worth more than five that say what the diff already shows.

**Do not add AI or agent attribution** — no `Co-Authored-By` trailers, no
"generated with" footers, no agent signatures, in commits, pull requests or file
headers. CI fails the build if it finds any.

## Things that will get a pull request sent back

These are not style preferences. Each one corresponds to a bug that has already
happened here.

**A `messageRun` without a permission check on the shared path.**
`setDefaultMemberPermissions()` constrains only the slash command surface in
Discord's UI. It does nothing for prefix commands. Any command exposing both
entry points must call `requireModPermissionFrom()` or `requireGuildAdmin()`
inside the function they both route through. Six commands once relied on the
registration alone and were runnable by any member who knew the prefix.

**A key added to one locale and not the other.** A key present in `en-US` but
missing from `es-ES` renders as the raw key string for every Spanish user. CI
checks parity across all five namespaces and fails on a mismatch.

**User-facing text that is not translated.** Everything a user reads goes
through `resolveKey(source, 'namespace:key')`. That includes error replies from
interaction handlers and anything a validator returns — return keys, not
sentences, and let the caller resolve them.

**A `GuildConfig` write without `CacheManager.syncGuild()`.** Redis is the read
path. Skip the sync and the two stores drift until the next restart.

**A classic embed or a bare `content` string.** Messages are built from the
Components V2 factories in `lib/layouts/ui.ts`.

**Raw interpolation into a transcript.** Message content, attachment filenames
and author tags are all attacker-controlled. Everything goes through
`escapeHtml` / `safeHref`.

**Changing `WEBHOOK_NAME` or a BullMQ queue prefix casually.** Both are matched
against live Discord and Redis state. Changing either orphans what already
exists — a data migration, not a rename.

## Areas to be careful in

- `lib/utils/ModUtils.ts` is a 400-line module mixing validation, DMs, mod logs,
  webhooks, threshold evaluation and mute application. Changes ripple.
- `checkThresholds` swallows errors into a log line, so a failed automatic
  sanction is invisible to the moderator who triggered it.
- Sanction expiry is scheduled at write time. Anything that creates or removes
  an `ActiveMute` or `ActiveTempBan` row must call `scheduleExpiry` or
  `cancelExpiry` alongside it, or the sanction outlives its duration.
- `ticketUtils.ts` uses a dynamic `await import()` to break a circular
  dependency. Do not tidy it without resolving the cycle first.

## Tests

There is no coverage target. Tests are expected where the cost of being wrong is
high: authorization, escaping, anything parsing user input into a duration or a
permission.

If you fix a bug, add the test that would have caught it. If you add a test,
check it has teeth — break the code deliberately and confirm the test fails.

## Reporting security issues

Do not open a public issue. See [SECURITY.md](SECURITY.md).
