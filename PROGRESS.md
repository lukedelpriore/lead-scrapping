# Progress

Last updated: 2026-08-26 on branch `claude/dph-lead-engine-build-vmwj72`.

## Status

Building M0 to M6 offline after an explicit operator override of the preflight hard stop (see DECISIONS.md D11). The environment blockers in `BLOCKED.md` still hold: no live network to RocketReach, Overpass, Serper, or Brevo, and the session cannot push. Work is committed locally and delivered to the operator as files. Milestones that need the blocked network are built and unit tested against fixtures, with their live checks marked deferred.

| Milestone | Status |
|---|---|
| Preflight | Failed on environment config, see `BLOCKED.md`. Overridden by operator for offline build. |
| M0 Scaffold | DONE |
| M1 Integrations | DONE (offline; live provider checks deferred per BLOCKED.md) |
| M2 Requests, discover, gate 1 | DONE (offline; live discovery deferred per BLOCKED.md) |
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

## M1, done (offline)

Seven adapters in `packages/pipeline/src/adapters`, each with a token bucket limiter, jittered exponential backoff, exact Retry-After handling on 429, api_calls logging via an injectable sink, and a dryRun or hard guard where money is involved:

- `RocketReachClient`: free account, person search, company search, checkStatus. The credit endpoints (person lookup, company lookup) throw immediately while REVEAL_MODE is off, so no credit can be spent during the build. Verified by tests.
- `OverpassClient`, `SerperClient`, `PlacesClient` (throws when disabled), `SheetsClient` (append then clear test write), `Mailer` (Brevo HTTPS, disabled and dryRun paths), `ClaudeClient` (constructed only when AI_MODE is on, tool forced JSON, Zod validated, one retry).
- Settings page has live test buttons (RocketReach account, sheet write, Brevo account, AI mode check) wired to server actions that record integration_status. With no keys set they return plain "no key" guidance; AI mode shows "Rules mode, no key needed".

Verified: 113 tests pass (9 config, 104 pipeline), pipeline coverage 92 percent lines over the 80 floor, workspace typecheck clean, web production build succeeds, and the four Settings test actions run against the real database returning the correct messages.

Deferred (blocked network, no live credentials): the live RocketReach plan and balances, a real test row in the actual sheet, and a live Brevo account read. These are the parts of M1 "done" that need network and keys, and they run in a session that has both, per BLOCKED.md.

## M2, done (offline)

- Gate 1 venue merge (`gate1.ts`): merge by domain, then place or osm id, then fuzzy name plus state with a city check; suppression marks venues by domain, name plus state, or in_play group. Proven offline against the database: 4 fixture venues merged to 3, 1 suppressed by a domain key, stage counts updated.
- Discovery mapping (`discovery/map.ts`): Overpass, RocketReach companies, Serper (tags The Knot and WeddingWire), and pasted clubs into the common venue shape.
- Suppression import: a correct CSV parser (`suppression/csv.ts`), column auto detection, key generation, and a summary. Upload UI on the Suppression page with a source selector and a report of rows read, keys created, and duplicates skipped. Manual add for an in_play group.
- Request form: the full New request page (name, states, groups or pasted clubs, tiers, target, per venue and per group, credit cap with a live available line, reveal mode, schedule, notes) with Save draft and Run request actions. Run creates a run and enqueues discovery on pg-boss.
- Worker: pg-boss queue and a discovery job that gathers per state from Overpass, RocketReach company search, and Serper, plus pasted clubs, and persists through gate 1. Each source is attempted independently; a blocked source is logged as a run event and the run continues.

Verified: 140 tests pass (9 config, 131 pipeline), workspace typecheck clean, web build clean, and the discovery persist stage verified offline against the database.

Deferred (blocked network): a live Florida discovery that returns real Overpass and Serper venues. The job and the offline persist path both work; only the live fetch is blocked, per BLOCKED.md.

## Exact next step: M3 Qualify, map, find, gate 2

Build the seven adapters (`RocketReachClient`, `OverpassClient`, `SerperClient`, `PlacesClient`, `ClaudeClient`, `SheetsClient`, `Mailer`) in `packages/pipeline`, each with a token bucket limiter, jittered retries, `Retry-After` handling, a `dryRun` mode, and `api_calls` logging. Wire the Settings page tests. The live RocketReach, Sheets, and Brevo checks cannot run in this session (blocked network), so M1 is built and unit tested against `msw` fixtures, and the live checks are deferred to a session with network per `BLOCKED.md`.

## How to resume

1. `service postgresql start`, then confirm role `dph` and database `dph_lead_engine` exist.
2. `pnpm install`
3. `pnpm db:generate && pnpm db:migrate && pnpm db:seed` (uses `.env.local`, which is gitignored and must be recreated from `.env.example` in a fresh container).
4. `pnpm test`, `pnpm -r typecheck`, `pnpm --filter @dph/web build` to confirm the baseline, then continue M1.

The seed prints a login password once when `SEED_PASSWORD` is unset. In `.env.local` it is set to `devpassword` for local use.
