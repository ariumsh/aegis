# Aegis

A modular Discord moderation bot, built by [Arium](https://github.com/ariumsh).

[![Licence: AGPL v3](https://img.shields.io/badge/licence-AGPL--3.0-blue.svg)](LICENSE)
[![CI](https://github.com/ariumsh/aegis/actions/workflows/ci.yml/badge.svg)](https://github.com/ariumsh/aegis/actions/workflows/ci.yml)

Aegis gives a server's staff a moderation record they can trust: every action is
a numbered case, repeated offences escalate on rules the server writes itself,
and who may run what is decided by a permission model that sits above Discord's
own. Around that core sit three optional modules — support tickets, a status
keyword role, and a live member counter — each configured, enabled and reset per
server without touching the others.

---

## Contents

- [What it does](#what-it-does)
- [Architecture](#architecture)
- [Requirements](#requirements)
- [Local development](#local-development)
- [Configuration](#configuration)
- [Database and migrations](#database-and-migrations)
- [Project layout](#project-layout)
- [Checks](#checks)
- [Deployment](#deployment)
- [Security](#security)
- [Troubleshooting](#troubleshooting)
- [Contributing](#contributing)
- [Licence](#licence)

---

## What it does

### Moderation

Seventeen commands: `warn`, `mute`, `timeout`, `ban`, `tempban`, `softban`,
`silentban`, `kick`, their reversals, plus `slowmode` and `lockdown` for
channels, and `case` / `remove-case` for the record itself.

`ban` and `tempban` accept a user who has already left the server — pass the id
and the ban lands anyway, which is the case where a ban is usually most wanted.

Every sanction is written to `mod_logs` with a per-guild case number, mirrored
into the configured log channel through a webhook, and DM'd to the member.

**Escalation.** `/threshold` defines rules of the form *N of this action → that
action*. Thresholds count either one action type or all of them together
(`thresholdMode`), ignore sanctions the bot itself applied so escalation cannot
feed on its own output, and optionally expire old entries after
`warnExpirationDays`.

**Permissions** resolve in a fixed order, first match wins:

| Step | Rule | Result |
|-----:|------|--------|
| 1 | Explicit `DENY` on the member or any of their roles | Denied — beats everything below, including Administrator |
| 2 | Discord Administrator | Allowed |
| 3 | Listed in `bot_commanders` | Allowed — bot-admin authority without granting Administrator |
| 4 | Explicit `ALLOW` on the member or any of their roles | Allowed |
| 5 | The Discord permission that natively implies the action | Allowed |
| 6 | Nothing matched | Denied |

Both command surfaces — slash and prefix — are checked on the same code path.
`setDefaultMemberPermissions()` constrains only the slash surface in Discord's
UI and is never relied on as the sole guard.

### Tickets

A panel with a category select opens a private channel per user, scoped to them
plus the configured supporter roles. Staff claim tickets, send a reminder that
starts a 20-minute auto-close countdown, close, reopen and delete them. Closing
produces an HTML transcript, posted to the transcript channel and DM'd to the
author.

### Vanity tracker

Watches custom statuses for a configured keyword and grants or removes a reward
role. Presence traffic is high-volume, so matches are handed to a queue rather
than processed on the gateway thread. A member is announced in the log channel
at most once per 24 hours, so toggling the status does not spam the channel.

### Member counter

Publishes one message showing online members, total members and members
currently in voice, then edits it in place.

The three numbers move on different clocks, so they are read on different ones.
Voice comes off the gateway — exact, free, immediate — and is redrawn on a short
debounce after each change. Online and total are Discord's approximate counts,
which Discord itself only recomputes every few minutes, so they are re-fetched
on a slow cadence. A tick where nothing moved makes no API call at all.

---

## Architecture

A modular monolith: one Node process holding the gateway connection, the command
framework, the background workers and a small HTTP endpoint.

```
                 Discord Gateway (WSS)
                          │
                          ▼
          ┌──────── Node process ────────┐
          │                              │
          │  Sapphire client             │
          │    commands/                 │
          │    listeners/                │
          │    interaction-handlers/     │
          │         │                    │
          │         ▼                    │
          │  command-helpers/  ← logic   │
          │         │                    │
          │    ┌────┴────┬──────────┐    │
          │    ▼         ▼          ▼    │
          │ Cache     workers   Counter  │
          │ Manager   (BullMQ)  Service  │
          └────┼─────────┼──────────┼────┘
               │         │          │
               ▼         ▼          ▼
            Redis    BullMQ     HTTP :4000
               │
               ▼  (fallback)
           PostgreSQL
```

Two conventions hold the codebase together.

**Commands stay thin.** A file under `commands/` registers the slash command and
delegates. Validation, execution and response building live in
`command-helpers/`. Both the slash and the prefix entry point funnel into one
shared execution function, which is where permission checks belong.

**Redis is the hot path.** `Ready.ts` warms the cache from PostgreSQL at
startup; after that, configuration reads are Redis hits with PostgreSQL as
fallback. Every write to `GuildConfig` must be followed by
`CacheManager.syncGuild()`, which is the single place that knows how config maps
onto cache keys.

All deferred work runs through BullMQ: vanity role checks, silent-ban expiry,
ticket auto-close, and mute and tempban expiry. Each sanction gets a delayed job
for its own duration rather than being found by a sweep, so expiry is accurate to
the sanction and BullMQ hands each job to exactly one consumer.

---

## Requirements

| | |
|---|---|
| Node.js | 22+ (the Docker image builds on `node:22-slim`) |
| pnpm | 11.9.0 — `corepack enable` picks up the pinned version |
| Docker | with Compose, for PostgreSQL and Redis |
| Discord | an application with a bot token |

The bot needs three privileged gateway intents enabled in the Discord Developer
Portal: **Server Members**, **Presence** and **Message Content**. Presence is
required by the vanity tracker, Message Content by the prefix commands.

---

## Local development

```bash
git clone https://github.com/ariumsh/aegis.git
cd aegis
cp .env.example .env
```

Fill in `.env`. At minimum set `DISCORD_TOKEN`; the database and Redis values
already point at what Compose provisions. Set `DEVELOPMENT_GUILD_IDS` to your
test server so slash commands appear instantly instead of waiting on global
propagation, which can take up to an hour.

Start the infrastructure. Host ports are deliberately non-default so they do not
collide with a local PostgreSQL or Redis:

```bash
docker compose up -d
```

| Container | Service | Host port | Container port |
|---|---|---|---|
| `aegis-postgres` | PostgreSQL 15 | **5433** | 5432 |
| `aegis-redis` | Redis | **6380** | 6379 |

Then run the bot on your machine, so you can restart it freely:

```bash
pnpm install
pnpm exec prisma generate
pnpm exec prisma migrate deploy
pnpm run dev
```

`pnpm run dev` runs through `tsx watch` and restarts on save.

---

## Configuration

All configuration is environment variables. Nothing secret belongs in the
repository — `.env*` is ignored except for the template.

### Required

| Variable | Purpose |
|---|---|
| `DISCORD_TOKEN` | Bot token. The only value the bot cannot start without |
| `DATABASE_URL` | PostgreSQL connection string |
| `REDIS_URL` | Redis connection string |

### Optional

| Variable | Default | Purpose |
|---|---|---|
| `PREFIX` | `a!` | Default prefix for message commands. Per-guild prefixes override it |
| `NODE_ENV` | `development` | Set to `production` on the server |
| `DEVELOPMENT_GUILD_IDS` | *(empty)* | Comma-separated guild IDs to register slash commands to. Empty registers globally |
| `API_PORT` | `4000` | Port for the stats endpoint |
| `STATS_API_TOKEN` | *(empty)* | Bearer token for `/stats`. **Required when `NODE_ENV=production`** |
| | | `/stats/history` returns 24 hourly, 7 daily and 30 daily uptime buckets with ISO timestamps. Heartbeats live in Redis, so the series survives a restart and an outage shows as a gap |
| `COUNTER_INTERVAL_MS` | `5000` | Counter render floor. Minimum 5000 |
| `COUNTER_COUNTS_INTERVAL_MS` | `60000` | How often member counts are re-fetched. Minimum 15000, never faster than the render floor |

`POSTGRES_USER`, `POSTGRES_PASSWORD` and `POSTGRES_DB` are consumed by Compose
to provision the container, not by the bot.

### Per-guild configuration

Everything else is configured in Discord and stored per guild:

```
/module setup    <module>   guided setup wizard
/module enable   <module>   validates prerequisites, then activates
/module disable  <module>   deactivates, keeps configuration
/module reset    <module>   factory reset, removes what the bot created
/module settings <module>   show current values

/language  /prefix  /mention        guild-level settings
/permission  /bot-commander         who may run what
/threshold                          escalation rules
```

---

## Database and migrations

PostgreSQL via Prisma. The schema lives in `prisma/schema.prisma`; migrations in
`prisma/migrations/`.

```bash
pnpm exec prisma migrate dev --name <description>   # author a migration (local only)
pnpm exec prisma migrate deploy                     # apply pending migrations
pnpm exec prisma generate                           # regenerate the client
pnpm exec prisma studio                             # browse the data
```

Never run `migrate dev` against production — it can reset the database. Use
`migrate deploy`.

**There is no seed data.** No fixtures, no factories, no bootstrap rows. A fresh
database is empty and the bot writes a `GuildConfig` row the first time a guild
configures something.

### Models

| Model | Holds |
|---|---|
| `GuildConfig` | All per-guild configuration, plus the case counter |
| `ModLog` | The moderation audit record — one row per sanction |
| `ModThreshold` | Escalation rules |
| `ActiveMute` / `ActiveTempBan` | Sanctions awaiting expiry |
| `SilentBan` | Silent bans, with optional expiry |
| `ModPermission` | Per-role and per-member `ALLOW` / `DENY` overrides |
| `BotCommander` | Members and roles with bot-admin authority |
| `Ticket` | Open, closed and deleted tickets |

**Data retention.** `ModLog`, `Ticket` and the sanction tables store Discord user
IDs and moderator-written reasons indefinitely. There is currently no retention
policy or erasure mechanism; if you operate in a jurisdiction that requires one,
that gap is yours to close before onboarding servers.

---

## Project layout

```
src/
├── index.ts                  Bootstrap: database, Redis, workers, stats server, login
├── structures/               AegisClient — the extended Sapphire client
├── commands/                 Thin entry points: registration and delegation
│   ├── mod/                  Moderation commands
│   ├── config/               language, prefix, mention, module
│   └── admin/                bot-commander
├── command-helpers/          Business logic — the real weight lives here
│   ├── mod/shared/           sanctionFlow, permissionGuard
│   ├── mod/{perms,threshold} Permission and threshold services
│   └── config/module/        Setup wizards and module management
├── interaction-handlers/     Buttons and select menus
├── listeners/                Ready, presence, voice, messages, error handling
├── workers/                  Vanity, SilentBan, Ticket (BullMQ); Mute, TempBan (timers)
├── services/                 CounterService, SilentBanService
├── validators/               Module prerequisites, checked before enabling
├── lib/
│   ├── layouts/              Discord Components V2 factories — ui.ts is the base
│   ├── i18n/                 en-US and es-ES
│   ├── constants/            Prefix, webhook name, emojis, dev guilds
│   ├── structures/           AegisUserError
│   └── utils/                ModUtils, vanity, ticket helpers, queues
├── database/                 Prisma client, Redis connection, CacheManager
└── api/                      Stats endpoint and uptime tracking

prisma/
├── schema.prisma
└── migrations/
```

### Adding a module

Touch these, in order:

1. `command-helpers/config/module/core/constants/index.ts` — `moduleIds`, `moduleChoices`
2. `command-helpers/config/module/core/setup/<module>Setup.ts` — the wizard
3. `command-helpers/config/module/core/index.ts` — export it
4. `commands/config/module/ModuleCommand.ts` — route it in `chatInputSetup`
5. `validators/ModuleValidator.ts` — prerequisites before it can be enabled
6. `management/reset.ts` — its entry in `RESET_MAP` and `getResetDeletions`
7. `lib/layouts/modCommandLayouts.ts` — its block in `getModuleLayout`
8. `database/CacheManager.ts` — its keys in `syncGuild`
9. `lib/i18n/{en-US,es-ES}/modules.json` — `displayNames`, `setup`
10. `lib/i18n/{en-US,es-ES}/layouts.json` — `settings.<module>`

The toggle field on `GuildConfig` is `<moduleId>Module`. Keeping that convention
is what avoids a translation map.

---

## Checks

```bash
pnpm run build      # tsc — catches broken references across the whole tree
pnpm run dev        # run locally against Compose
```

`pnpm run build` is the minimum bar before calling anything done. It is a type
check, not a behavioural one: it will not tell you a permission guard is
missing or a queue prefix no longer matches its worker.

### Conventions

**Components V2 everywhere.** Messages are built from the factories in
`lib/layouts/ui.ts` — `ContainerComponent`, `TextDisplayComponent`, `ActionRow`.
Not classic embeds, not bare `content`.

**All user-facing text goes through i18n.** `resolveKey(source, 'namespace:key')`
or `fetchT`. Add every key to **both** `en-US` and `es-ES`; a key present in one
locale only renders as the raw key string for everyone else.

**Guard the shared path, not the registration.** A command that exposes both
`chatInputRun` and `messageRun` must check permissions inside the function they
both call.

**Sync the cache after every config write.** `CacheManager.syncGuild()` after any
`prisma.guildConfig.update()`, or Redis and PostgreSQL drift apart until the next
restart.

---

## Deployment

Production runs the bot as a container alongside PostgreSQL and Redis:

```bash
docker compose -f docker-compose.prod.yml up -d --build bot
```

The image is baked from the `Dockerfile`, so **`docker restart aegis-bot` does
not pick up new code** — it restarts the old image. Rebuild.

The runtime stage drops build-time dependencies and runs as the unprivileged
`node` user. The Prisma CLI is not in the image as a result, so run
`prisma migrate deploy` from the host or from the builder stage rather than
inside the running container.

Apply migrations before or immediately after deploying:

```bash
pnpm exec prisma migrate deploy
```

The bot registers its slash commands with `BulkOverwrite` on every boot, so a
command deleted from the source stops being offered rather than lingering in the
picker and failing when used.

---

## Security

- **Never commit `.env*`.** Only `.env.example` is tracked. If a token is ever
  exposed, rotate it in the Discord Developer Portal first, then clean up.
- **Set `STATS_API_TOKEN` in production.** Without it the stats endpoint answers
  unauthenticated requests, and `docker-compose.prod.yml` publishes that port.
- **Prefix commands are not protected by Discord.**
  `setDefaultMemberPermissions()` only affects the slash surface. Any command
  with a `messageRun` needs its own check.
- **Transcript content is untrusted.** Message bodies, attachment filenames and
  author tags are all attacker-controlled and are escaped before entering the
  HTML transcript.
- The bot requires privileged intents and, for most modules, `Manage Roles` and
  `Manage Channels`. Keep its role above the roles it is expected to manage —
  Discord will silently refuse otherwise.

Report a vulnerability privately to the maintainers rather than opening an issue.

---

## Troubleshooting

**Slash commands do not appear.** Global registration propagates for up to an
hour. Set `DEVELOPMENT_GUILD_IDS` to your test guild for instant registration.
The bot must already be a member of those guilds.

**"Redis error" on boot.** `REDIS_URL` is required and is validated at import
time, before the logger exists — the failure is loud and early by design. Check
that Compose is up and that you are using host port **6380**, not 6379.

**Config changes do not take effect.** Redis is the read path. If a write path
skipped `CacheManager.syncGuild()`, the cache serves the old value until the next
restart warms it from PostgreSQL.

**A sanction is not lifted on time.** Expiry is a delayed BullMQ job scheduled
for the sanction's own duration, so check that Redis is reachable and that the
queue is being consumed. `Ready.ts` reconciles on every boot: PostgreSQL is
authoritative, so anything still active in the database is re-queued at startup,
and anything that expired while the bot was down is lifted immediately. A
sanction stuck past its expiry usually means the worker is not running, not that
the job was lost.

**The counter stops updating.** After a failed edit the guild backs off to the
slow cadence until it recovers. If the message was deleted, the next tick
republishes it. A channel the bot cannot write to backs off indefinitely.

**Duplicate webhooks in the log channel.** The bot finds its own webhook by name
(`WEBHOOK_NAME` in `lib/constants/bot.ts`). Changing that constant orphans
existing webhooks and creates new ones alongside them. Treat it as a data
migration.

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). The short version:

Branches flow `feature/* → develop → main`. Nothing is pushed directly to either
protected branch — branch protection enforces that for administrators too.

Commit subjects follow `type(scope): summary`, where scope names the file, files
or area touched. Commits are small and atomic, and explain *why* rather than
restating the diff.

Before opening a pull request, all four must pass: `pnpm run typecheck`,
`pnpm run lint` (0 errors, 0 warnings), `pnpm run test`, `pnpm run build`. CI
runs those plus a repository hygiene job and a Docker image build, and all are
required status checks.

Security issues go through [SECURITY.md](SECURITY.md), not a public issue.

---

## Licence

**GNU Affero General Public License v3.0 or later.** Copyright (c) 2026 Arium.
See [LICENSE](LICENSE).

AGPL rather than a permissive licence for one reason: a Discord bot is a network
service. Under MIT or Apache, anyone could take this, rebrand it, and run it as a
competing bot with no obligation to give anything back — and under plain GPL they
still could, because GPL's copyleft triggers on *distribution* and nobody
distributes a bot, they host it. AGPL section 13 closes that gap: modify Aegis
and run it for users over a network, and you owe those users your source.

What this means in practice:

- **Running it unmodified is unrestricted.** Self-host all you like.
- **Modify it and run it for others** — including in a single Discord server —
  and you must offer those users your modified source.
- **Fork it** and you must keep it AGPL, and point `SOURCE_URL` in
  `src/lib/constants/bot.ts` at your fork. The bot appends that link to every
  mention reply, which is how it satisfies section 13; leaving it pointing at
  this repository while running modified code does not.

If the AGPL does not suit your use, ask — a separate licence is a conversation,
not a refusal.
