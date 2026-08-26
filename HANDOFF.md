# Handoff

Del Priore Hospitality Lead Engine. Built in a Claude Code cloud session on branch `claude/dph-lead-engine-build-vmwj72`, 2026-08-26.

## Read this first

The Section 1 preflight failed at the start: the cloud environment supplied no variables, the network policy blocked the product's data hosts (RocketReach, Overpass, Serper, Brevo), and the session could not push to GitHub. Those three blockers are detailed in `BLOCKED.md` and are environment and account configuration only the operator can change. The operator then chose to keep building offline (logged as decision D11), so M0 through M6 were built and tested against a local Postgres and fixtures, with every step that needs the live network marked deferred rather than skipped. Nothing here spent a RocketReach credit; `REVEAL_MODE` and `AI_MODE` stayed off the whole time.

Because the push was blocked, the work was delivered to the operator as git bundles. To restore the full history: `git clone <bundle> repo`, or in an existing clone `git fetch <bundle> claude/dph-lead-engine-build-vmwj72`.

## What was built, per milestone

- **M0 Scaffold.** pnpm monorepo (apps/web, apps/worker, packages/pipeline, packages/db, packages/config). Prisma schema for every Section 7 table plus reference states and counties, initial migration, and a seed (users, settings, 51 states, sample counties, 17 groups with two seeded in_play, and a 50 venue / 10 group / 200 candidate demo dataset). Auth.js v5 with a seeded credentials provider and optional Google OAuth, both allowlist gated, 7 day JWT sessions, login rate limit. App shell and nav, design tokens and self hosted fonts, empty states, `/api/health`, `docker/compose.dev.yml`, `CLAUDE.md`, `.env.example`, and a SessionStart hook.
- **M1 Integrations.** Seven adapters (RocketReach, Overpass, Serper, Places, Claude, Sheets, Mailer), each with a token bucket limiter, jittered retries, exact Retry-After handling, api_calls logging, and a dryRun or hard guard where money is involved. Settings page with live connection tests.
- **M2 Requests, discover, gate 1.** Request form and creation, discovery mapping for Overpass, RocketReach companies, Serper, and pasted clubs, gate 1 venue merge and suppression, a CSV suppression import with column auto detection, and a worker discovery job on pg-boss.
- **M3 Qualify, map, find, gate 2.** Rules classifier and adjudicator matching the Claude output shape, tiering, ranking, the four step search plan, gate 2 (suppression, delivered, same run), a site fetcher, worker qualify and find stages, and the request detail page with the scorecard and Results, Review, Already have, Venues, and Log tabs.
- **M4 Reveal and deliver.** Reveal selection with the per venue and per group caps and confidence gating, the REVEAL_MODE off no op that reports "would spend n credits" and writes fixture contacts, the deliver stage (post reveal check, sheet mapping and append, ledger reconcile, email), and a run-request job that chains the whole pipeline.
- **M5 Polish.** A green Playwright smoke test against the pre installed Chromium, review approve and decline actions, and the mobile, focus, and empty state work from M0 holding across the app.
- **M6 Ship ready.** `docker/compose.prod.yml` (db, migrate, web, worker, caddy, backup), Caddyfile with auto TLS, a nightly pg_dump backup container, `docs/DEPLOY.md`, `docs/RUNBOOK.md`, and this file. `docker compose -f docker/compose.prod.yml config` validates and the production web build succeeds.

## What was assumed

The full list is in `DECISIONS.md`. The ones that most affect you:

- Integration keys are optional at boot so the app runs offline; the Section 1 preflight is the real gate for a live run (D14).
- Reference `states` and `counties` tables were added; counties seed from a small verified sample and the full US Census list loads in a network enabled session (D15).
- The AI mode label in the UI is vendor neutral, honoring the no other company rule; the `ANTHROPIC_API_KEY` identifier stays because it is the env contract (D16).
- The RocketReach client was coded from the Section 5.3 summary because `docs.rocketreach.co` was blocked; `docs/rocketreach-api-notes.md` marks it pending live validation (D21).
- Reveal is guarded three ways so no credit can be spent during the build (D34).

## Run locally in three commands

Postgres 16 must be running with a `dph` role and a `dph_lead_engine` database, and `.env.local` must exist (copy `.env.example`).

```
pnpm install
pnpm db:migrate && pnpm db:seed
pnpm dev   # web on 3000; run the worker with: pnpm worker
```

The seed prints a one time login password when `SEED_PASSWORD` is unset.

## Deploy

Follow `docs/DEPLOY.md` for a fresh Hostinger VPS: the DNS record, the firewall ports, writing `/opt/dph-lead-engine/.env`, bringing the stack up with `docker compose -f docker/compose.prod.yml up -d --build`, and a first staging run with `REVEAL_MODE=off`.

## Turn on real reveals safely

From `docs/RUNBOOK.md`: set `REVEAL_MODE=ask`, run one request with `credit_cap=5`, approve a few contacts, reveal, and reconcile the ledger against RocketReach. Only when a capped run reconciles cleanly, raise the cap or switch to `auto`. The reserve and the daily cap protect the pool.

## Known gaps and deferred work

These need a session with the network open and the credentials in place, per `BLOCKED.md`:

- Live RocketReach, Sheets, and Brevo connection checks (built and unit tested against fixtures; the live Settings tests were not run here).
- Live discovery (Overpass and Serper) and live person search returning real data.
- Validating the RocketReach request and response shapes against the live docs and reconciling any difference.
- The Message Batches path for the Claude classifier when more than 200 venues are queued (AI_MODE is off, so it was not exercised).
- The full US Census county list loader (a verified sample is seeded).
- XLSX suppression upload (CSV works; XLSX needs a spreadsheet parser wired into the upload handler).
- Weekly scheduling wiring on pg-boss cron (the request form captures the schedule; the recurring trigger is not yet scheduled).

None of these is blocking for a staging run with reveal off, which exercises the whole pipeline against fixtures.

## Test and coverage summary

- 193 unit tests pass (9 in packages/config, 184 in packages/pipeline).
- packages/pipeline line coverage is about 91 percent, over the 80 percent floor in the spec.
- 3 Playwright smoke tests pass against the pre installed Chromium.
- Workspace typecheck is clean and the web production build succeeds.
- The pipeline was verified end to end offline against the database at each milestone: gate 1 merge and suppression, qualify to a tier with evidence and confidence, find with adjudication and gate 2, and reveal off writing fixtures with zero credit ledger rows into deliver.
