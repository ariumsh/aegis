## Objective

<!-- What this changes and why. One or two sentences. -->

## Changes

<!-- What actually changed. Group by area if there is more than one. -->

## Risks

<!-- What could break, and who notices. Write "none identified" only if you looked. -->

## Verification

<!--
What you actually ran, and what it said. Not what you intend to run.

  pnpm run typecheck
  pnpm run lint
  pnpm run test
  pnpm run build

If something is only confirmed by reading the code rather than executing it,
say so. An unverified claim is worse than an acknowledged gap.
-->

## Checklist

- [ ] Commit subjects follow `type(scope): summary`
- [ ] No AI or agent attribution in commits or this description
- [ ] Any new user-facing string goes through i18n, in **both** locales
- [ ] Any command with a `messageRun` checks permissions on the shared path
- [ ] Any `GuildConfig` write is followed by `CacheManager.syncGuild()`
- [ ] No `.env`, credentials or local tooling files included
