# Progress

Last updated: 2026-08-26 on branch `claude/dph-lead-engine-build-vmwj72`.

## Status

Building M0 to M6 offline after an explicit operator override of the preflight hard stop (see DECISIONS.md D11). The environment blockers in `BLOCKED.md` still hold: no live network to RocketReach, Overpass, Serper, or Brevo, and the session cannot push. Work is committed locally and delivered to the operator as files. Milestones that need the blocked network are built and unit tested against fixtures, with their live checks marked deferred.

| Milestone | Status |
|---|---|
| Preflight | Failed on environment config, see `BLOCKED.md`. Overridden by operator for offline build. |
| M0 Scaffold | DONE |
| M1 Integrations | not started |
| M2 Requests, discover, gate 1 | not started |
| M3 Qualify, map, find, gate 2 | not started |
| M4 Reveal and deliver | not started |
| M5 Polish | not started |
| M6 Ship ready | not started |

## M0, done

Monorepo with pnpm workspaces: `apps/web`, `apps/worker`, `packages/pipeline`, `packages/db`, `packages/config`.

- Prisma schema covering every Section 7 table, plus reference `states` and `counties`. Initial migration `20260826184405_init` applied.
- Seed: 2 users, settings row, 51 states, 130 sample counties, 17 groups (Concert Golf Partners and Heritage Golf Group seeded in_play with matching suppression), and the demo dataset (10 groups, 50 venues, 1 request, 1 run, 200 candidates).
- Auth.js v5 with credentials (seeded) and optional Google OAuth, both allowlist gated, JWT sessions with 7 day expiry, login rate limit 10 per 15 minutes per IP.
- App shell and nav (left rail on desktop, bottom bar on phone), design tokens and self hosted fonts, empty states on every page.
- `/api/health` returns db, queue, integration status.
- `docker/compose.dev.yml`, `CLAUDE.md`, `.env.example`, `.claude/settings.json` SessionStart hook.

Verified in this session:
- `pnpm test`: 72 tests pass (9 config, 63 pipeline). Pipeline coverage 98 percent lines, over the 80 percent floor.
- `pnpm -r typecheck`: clean.
- `pnpm build`: production build of all 12 routes plus middleware succeeds.
- Runtime smoke test on the built server: `/api/health` 200, unauthenticated `/` and `/dashboard` redirect to `/login`, a full credentials sign in returns the correct owner session with a 7 day expiry, and every page renders (leads shows its empty state, groups and requests show data).

## Exact next step: M1 Integrations

Build the seven adapters (`RocketReachClient`, `OverpassClient`, `SerperClient`, `PlacesClient`, `ClaudeClient`, `SheetsClient`, `Mailer`) in `packages/pipeline`, each with a token bucket limiter, jittered retries, `Retry-After` handling, a `dryRun` mode, and `api_calls` logging. Wire the Settings page tests. The live RocketReach, Sheets, and Brevo checks cannot run in this session (blocked network), so M1 is built and unit tested against `msw` fixtures, and the live checks are deferred to a session with network per `BLOCKED.md`.

## How to resume

1. `service postgresql start`, then confirm role `dph` and database `dph_lead_engine` exist.
2. `pnpm install`
3. `pnpm db:generate && pnpm db:migrate && pnpm db:seed` (uses `.env.local`, which is gitignored and must be recreated from `.env.example` in a fresh container).
4. `pnpm test`, `pnpm -r typecheck`, `pnpm --filter @dph/web build` to confirm the baseline, then continue M1.

The seed prints a login password once when `SEED_PASSWORD` is unset. In `.env.local` it is set to `devpassword` for local use.
