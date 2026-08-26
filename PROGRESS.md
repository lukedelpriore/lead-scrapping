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
| M3 Qualify, map, find, gate 2 | DONE (offline; live fetch and person search deferred per BLOCKED.md) |
| M4 Reveal and deliver | DONE (offline; live reveal stays off by design) |
| M5 Polish | DONE |
| M6 Ship ready | DONE |

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

## M3, done (offline)

- Rules classifier (`classify/rules.ts`): hosts_weddings, hosts_corporate, nonmember_events, ownership, group name, capacity, site contact, evidence, and confidence, matching Section 6.3. Same JSON shape as the Claude classifier.
- Tier rules already in `tier.ts`. Group mapping and ranking in `find/rank.ts`.
- Rules adjudicator (`find/adjudicate.ts`): scores results against the target and title hierarchy, rejects wrong employer, excluded titles, and wrong state, and picks primary and alternate with confidence and reason.
- Search plan builder (`find/search-plan.ts`): the four ordered RocketReach person search queries per target.
- Gate 2 (`find/gate2.ts`): checks suppression, delivered leads, and same run duplicates; marks duplicates with key and source so they never reach reveal.
- Site fetcher adapter (`adapters/fetcher.ts`): internal event URL selection and Readability text extraction (pure parts unit tested).
- Worker stages: qualify (fetch, classify, tier, persist) and find (search, adjudicate, gate 2, create candidates). Request detail page with the scorecard and Results, Review, Already have, Venues, and Log tabs.

Verified offline against the database: a venue qualifies to tier 1 with capacity 300 and confidence 0.9; find creates a primary and an alternate; gate 2 marks a delivered contact as a duplicate with source delivered; zero credit ledger rows. The request detail page renders 167 ready candidates and 33 duplicates from the demo data.

Deferred (blocked network): live site fetching and live RocketReach person search. The stages and the offline paths work; only the live fetch and search are blocked, per BLOCKED.md.

## M4, done (offline)

- Reveal selection (`reveal/select.ts`): auto reveals confident primaries in rank order up to the batch cap, respects the per venue cap of two and the per group cap of four, and holds alternates for the no mobile rule. ask sends everything to review.
- Lookup result parser (`reveal/parse.ts`) and fixture generator (`reveal/fixture.ts`) for the REVEAL_MODE off no op.
- Worker reveal stage: with REVEAL_MODE off it reports "would spend n credits", writes clearly fake fixture contacts, and spends nothing. With reveal on it looks up, polls, stores verified data, and writes one ledger charge per success.
- Worker deliver stage: post reveal check on phone and email, sheet row mapping, sheet append (or done_pending_sheet when no sheet is configured), lead rows, ledger reconcile, and one summary email (or a disabled notice).
- Full pipeline orchestration job that chains discover, qualify, find, reveal, and deliver, with live stages degrading gracefully when the network is blocked.

Verified offline against the database with REVEAL_MODE off: reveal reported "would spend 3 credits", wrote 3 fixture contacts (0 charged, clearly fake), deliver created 3 leads with 0 credit ledger charges, and the request moved to done_pending_sheet with email disabled.

Deferred by design and by the blocked network: a live reveal that spends real credits (REVEAL_MODE stays off for the whole build, hard stop 2), and the live sheet append and email (no credentials, no network). The stages and the offline paths work, per BLOCKED.md.

## M5, done

- Playwright smoke test (`apps/web/playwright/smoke.spec.ts`) green: sign in, view the dashboard ledger, open the seeded demo request, check the scorecard cells, open the Review and Already have tabs, and save a new request draft. Runs against the pre installed Chromium with an explicit executablePath so no browser is downloaded.
- Review queue actions: approve and decline per candidate with a "would spend n credits" line, all through server actions.
- Mobile layout (left rail to bottom bar), keyboard focus rings, empty states on every list, and plain error copy were set in M0 and hold across the pages added since.

Verified: 3 Playwright tests pass, web build clean, 193 unit tests pass, workspace typecheck clean.

## M6, done

- `docker/compose.prod.yml` with db, migrate (one shot), web, worker, caddy (auto TLS), and a nightly pg_dump backup container. Validated with `docker compose config`.
- `docker/Dockerfile.web` (Next standalone, copies the Prisma engine and schema so the standalone server finds the engine at runtime) and `docker/Dockerfile.worker`.
- `docker/Caddyfile` with security headers, `docker/backup` (pg_dump, 14 day retention), `.dockerignore`.
- `docs/DEPLOY.md`, `docs/RUNBOOK.md`, `docs/rocketreach-api-notes.md`, and `HANDOFF.md`.

Verified: `docker compose -f docker/compose.prod.yml config` validates, the production web build succeeds, 193 unit tests pass, 91 percent pipeline line coverage, 3 Playwright tests pass, workspace typecheck clean.

## Status: all milestones complete offline

M0 through M6 are built, tested offline, committed, and delivered as git bundles. The three blockers in `BLOCKED.md` (missing env, blocked network, no push) remain the operator's to clear before a live run and before the branch can reach GitHub. `HANDOFF.md` has the full summary, the deferred live checks, and how to turn reveals on safely.

Build the seven adapters (`RocketReachClient`, `OverpassClient`, `SerperClient`, `PlacesClient`, `ClaudeClient`, `SheetsClient`, `Mailer`) in `packages/pipeline`, each with a token bucket limiter, jittered retries, `Retry-After` handling, a `dryRun` mode, and `api_calls` logging. Wire the Settings page tests. The live RocketReach, Sheets, and Brevo checks cannot run in this session (blocked network), so M1 is built and unit tested against `msw` fixtures, and the live checks are deferred to a session with network per `BLOCKED.md`.

## How to resume

1. `service postgresql start`, then confirm role `dph` and database `dph_lead_engine` exist.
2. `pnpm install`
3. `pnpm db:generate && pnpm db:migrate && pnpm db:seed` (uses `.env.local`, which is gitignored and must be recreated from `.env.example` in a fresh container).
4. `pnpm test`, `pnpm -r typecheck`, `pnpm --filter @dph/web build` to confirm the baseline, then continue M1.

The seed prints a login password once when `SEED_PASSWORD` is unset. In `.env.local` it is set to `devpassword` for local use.
