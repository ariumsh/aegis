# Security Policy

## Reporting a vulnerability

**Do not open a public issue.**

Use GitHub's private reporting:
[Report a vulnerability](https://github.com/ariumsh/aegis/security/advisories/new).

If that is unavailable to you, open a public issue containing only the words
"security report" and no detail, and a maintainer will open a private channel.

Please include what you have: the affected version or commit, what an attacker
can do, and the smallest set of steps that demonstrates it. A proof of concept
helps but is not required to file.

You will get an acknowledgement. If a report is valid, you will be told when a
fix lands and credited in the advisory unless you ask otherwise.

## Scope

This is a self-hosted bot. Each operator runs their own instance against their
own Discord application, database and Redis, so there is no shared production
service to compromise — a vulnerability here affects whoever is running it.

**In scope:**

- Authorization bypass — any path that lets a user run a moderation command they
  should not, or read moderation records they should not
- Privilege escalation, including through the threshold and permission tables
- Injection into generated artefacts, particularly ticket transcripts
- Anything that exposes the stats endpoint, tokens or configuration
- Denial of service that a normal server member can trigger
- Cross-guild data leakage

**Out of scope:**

- Vulnerabilities requiring Discord Administrator or Bot Commander, which are
  already trusted with everything the bot can do
- Discord's own rate limits or platform behaviour
- Findings that require an operator to have already leaked their bot token
- Dependency advisories with no demonstrated path to exploitation here — report
  those as ordinary issues

## Known weaknesses

Documented rather than hidden. These are real and unfixed:

- **`checkThresholds` swallows errors into a log line.** An automatic sanction
  that fails is invisible to the moderator who triggered it.
- **Retention is per guild, not per subject.** Removing the bot from a server
  schedules deletion of everything held for it (`GUILD_DATA_RETENTION_DAYS`,
  default 30). There is no mechanism to erase one user's records from a guild the
  bot is still in. If you need that, it is not implemented.
- **The stats endpoint is unauthenticated when `STATS_API_TOKEN` is unset.**
  Startup refuses this when `NODE_ENV=production`, but a non-production instance
  with the port published will serve guild and user counts to anyone.

## For operators

- Set `STATS_API_TOKEN`, or do not publish port 4000.
- Keep the bot's role above the roles it is expected to manage; Discord silently
  refuses otherwise.
- The bot requires three privileged intents. Grant them, but understand that
  Message Content means it sees every message in every channel it can read.
- Rotate `DISCORD_TOKEN` immediately if `.env` is ever committed or shared.
  `.gitignore` covers `.env*` and CI fails if one is tracked, but neither helps
  after the fact.
