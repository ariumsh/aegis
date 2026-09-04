# Changelog

All notable changes to Aegis.

The project does not carry version tags yet, so releases are listed by the date
they reached `main` and the pull request that took them there. Format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); the project will follow
[Semantic Versioning](https://semver.org/spec/v2.0.0.html) once tagging starts.

---

## [Unreleased]

Nothing yet.

---

## 2026-09-03 — Dependency hygiene ([#36](https://github.com/ariumsh/aegis/pull/36))

### Changed

- Module resolution moved to `node16`, pairing the CommonJS emit with the
  algorithm Node actually uses, including the package `exports` field that
  `node10` ignored ([#31](https://github.com/ariumsh/aegis/pull/31))
- `tsx` updated to 4.23.13 ([#35](https://github.com/ariumsh/aegis/pull/35))

### Removed

- The root `i18next` declaration. `@sapphire/plugin-i18next` declares it as a
  direct dependency rather than a peer, so the plugin resolves its own copy and
  the root declaration only invited version skew
  ([#35](https://github.com/ariumsh/aegis/pull/35))

### Not taken

- **TypeScript 7.** `typescript-eslint` does not support it and `eslint` throws
  at load. Lint is a required status check, so adopting it would mean shipping
  with the linter disabled. Dependabot ignores the major with that reason
  recorded inline and a link to the upstream issue
  ([#31](https://github.com/ariumsh/aegis/pull/31))

---

## 2026-09-03 — Hardening and the last of the known gaps ([#32](https://github.com/ariumsh/aegis/pull/32))

### Added

- **Guild data is deleted after the bot is removed from a server.** Departure
  schedules deletion of everything held for that guild — moderation history,
  tickets, permissions, thresholds, configuration and cached keys — with a
  30-day default grace period (`GUILD_DATA_RETENTION_DAYS`, `0` deletes
  immediately). Rejoining cancels it
  ([#29](https://github.com/ariumsh/aegis/pull/29))

### Changed

- **Sanction expiry runs on a queue instead of two sweep loops.** Each mute and
  tempban gets a delayed job for its own duration, so expiry is accurate to the
  sanction rather than to a 60-second sweep — and running more than one instance
  is now safe rather than merely undocumented
  ([#25](https://github.com/ariumsh/aegis/pull/25))
- The uptime series persists to Redis, so it survives the restart it exists to
  record. Buckets carry ISO 8601 timestamps instead of hardcoded Spanish labels,
  and a window with no data reports `null` rather than claiming 0% uptime
  ([#27](https://github.com/ariumsh/aegis/pull/27))
- The runtime image drops build dependencies and runs as the unprivileged `node`
  user (312 MB → 289 MB). The Prisma CLI is no longer present, so
  `prisma migrate deploy` runs from the host
  ([#28](https://github.com/ariumsh/aegis/pull/28))
- `bullmq` 5→6, `ioredis` 5→6 and Prisma 7.8→7.10, each verified against real
  infrastructure rather than on a green CI run
  ([#30](https://github.com/ariumsh/aegis/pull/30))

### Fixed

- **A role-based mute was never lifted.** The old expiry sweep only cleared
  Discord timeouts, so `/mute` — which grants a role — left the user muted
  indefinitely while the row was deleted and success was logged
  ([#25](https://github.com/ariumsh/aegis/pull/25))
- `/ban` and `/tempban` work on a user who has already left the server, which is
  the case where a ban is usually most wanted
  ([#26](https://github.com/ariumsh/aegis/pull/26))
- `deleteMessageDays` is deprecated and silently ignored by the Discord API, so
  `/ban delete_days:7` was deleting nothing. Replaced with
  `deleteMessageSeconds` ([#26](https://github.com/ariumsh/aegis/pull/26))
- `corepack enable` in the Dockerfile would have blocked any future Node upgrade:
  corepack ships in the Node 22 image but was removed from the distribution in
  later majors ([#24](https://github.com/ariumsh/aegis/pull/24))

### Removed

- Dead code: an error class with no importers, a tokeniser left over from the
  deleted AutoMod module, the `warn_logs` table that was never written or read,
  and three environment variables the bot never reads
  ([#19](https://github.com/ariumsh/aegis/pull/19))

---

## 2026-09-03 — AGPL and public repository ([#12](https://github.com/ariumsh/aegis/pull/12))

### Changed

- **Relicensed to AGPL-3.0-or-later** and made public. A Discord bot is a network
  service: under a permissive licence anyone can rebrand and host it owing
  nothing, and under plain GPL they still can, because GPL copyleft triggers on
  distribution and nobody distributes a bot — they host it. Section 13 closes
  that gap ([#10](https://github.com/ariumsh/aegis/pull/10))

### Added

- Section 13 satisfied at runtime: the bot appends its source URL to every
  mention reply, unconditionally rather than through the configurable default
  response, which a guild can replace
  ([#10](https://github.com/ariumsh/aegis/pull/10))
- `CONTRIBUTING.md`, `SECURITY.md`, Dependabot configuration, and issue and pull
  request templates ([#11](https://github.com/ariumsh/aegis/pull/11))
- Branch protection on `main` and `develop`: pull request required with
  administrators included, three required status checks, force pushes and
  deletion blocked

---

## 2026-09-03 — Initial release ([#9](https://github.com/ariumsh/aegis/pull/9))

### Added

- The Aegis codebase: moderation with numbered cases and configurable escalation,
  support tickets, a status-keyword role tracker and a live member counter, each
  configurable per guild ([#1](https://github.com/ariumsh/aegis/pull/1))
- Continuous integration: type check, lint, tests, build, a repository hygiene
  job and a Docker image build, all as required status checks
  ([#5](https://github.com/ariumsh/aegis/pull/5))
- A test suite covering the authorization model, transcript escaping and the
  duration parsers ([#6](https://github.com/ariumsh/aegis/pull/6))

### Security

- **Six commands were runnable by any server member.**
  `setDefaultMemberPermissions()` constrains only the slash command surface in
  Discord's UI and does nothing for prefix commands. `remove-case` deleted
  moderation audit records, `threshold` rewrote the automatic escalation rules,
  `lockdown` and `slowmode` were channel-level denial of service, and `case`
  exposed the entire moderation record
  ([#2](https://github.com/ariumsh/aegis/pull/2))
- HTML injection in ticket transcripts. Attachment filenames are chosen by
  whoever uploads the file and were interpolated into the document raw; the
  transcript is then opened from disk by staff
  ([#2](https://github.com/ariumsh/aegis/pull/2))
- Silent ban failed **closed**: with both datastores unreachable every user in
  every guild was treated as sanctioned, so a database outage would have become
  a server-wide message deletion ([#2](https://github.com/ariumsh/aegis/pull/2))
- The stats endpoint served unauthenticated requests when its token was unset,
  on a port published in production. Startup now refuses this when
  `NODE_ENV=production`, and the token is compared in constant time
  ([#2](https://github.com/ariumsh/aegis/pull/2))
- `silentban` was the only sanctioning command not checking role hierarchy
  ([#2](https://github.com/ariumsh/aegis/pull/2))

### Fixed

- **Silent ban did nothing.** The command, queue, worker and model all existed
  and nothing connected them; the sanction was recorded and never applied
  ([#3](https://github.com/ariumsh/aegis/pull/3))
- Two users opening a ticket simultaneously collided on the ticket number, and
  the loser's Discord channel was left behind with no ticket attached
  ([#3](https://github.com/ariumsh/aegis/pull/3))
- Claiming a ticket after sending a reminder overwrote the auto-close countdown,
  so the pending close vanished from the channel while remaining scheduled
  ([#3](https://github.com/ariumsh/aegis/pull/3))
- `applyMute` recorded the case before applying the timeout, so a refused
  timeout left a numbered case for a member who was never muted
  ([#3](https://github.com/ariumsh/aegis/pull/3))
- The transcript was generated twice per ticket close, doubling the API calls
  over the channel's entire history
  ([#8](https://github.com/ariumsh/aegis/pull/8))
- `ModuleValidator` returned English prose as data, so a Spanish guild was told
  what was missing in English
  ([#8](https://github.com/ariumsh/aegis/pull/8))

### Removed

- Eight unused dependencies, including a native image library and a helper
  belonging to a different ORM. ESLint and Prettier moved out of runtime
  dependencies and given actual configuration
  ([#4](https://github.com/ariumsh/aegis/pull/4))
