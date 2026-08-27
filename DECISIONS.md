# Decisions

Judgement calls made during the build, in the order they were made. Section references point at `DPH_Lead_Engine_Build_Spec.md`.

## 2026-08-26, preflight session

**D1. Started PostgreSQL during preflight rather than reporting it down.**
Section 1 says to start the pre installed service and only write BLOCKED.md if that fails. `service postgresql start` succeeded and 16.13 now accepts connections on 5432, so this check passes.

**D2. Did not create the `dph` role or the `dph_lead_engine` database.**
`DATABASE_URL` is absent, so the role, password, and database name the application expects are unknown. The values in Section 1 are an illustrative example, not a directive, and guessing them would bake an unverified assumption into the first migration. The container is also ephemeral, so any role created now would not survive to the next session. Deferred to the session that has a real `DATABASE_URL`.

**D3. Treated the missing environment variables as hard stop 1 rather than inventing values.**
Section 1 says the operator supplies them and to "never invent them, never commit them". Section 2 hard stop 1 makes a failed preflight a stop. Fabricating a `ROCKETREACH_API_KEY` or an `AUTH_SECRET` to get past the gate would have produced a scaffold that cannot be trusted and would have hidden the real problem behind six milestones of code.

**D4. Treated the blocked provider hosts as a second reportable blocker, not something to engineer around.**
Section 1's "if a package download is blocked, retry once, then find a way that does not need it" is scoped to package downloads. `registry.npmjs.org` is reachable, so package installs were never at risk. The blocked hosts are the product's own data sources, and the preflight requires a live RocketReach account call. Retried once as instructed, several minutes apart, and got the identical 403 to CONNECT, which makes it stable policy rather than a transient failure.

**D5. Did not write the RocketReach client against the Section 5.3 summary.**
Section 5 requires fetching `https://docs.rocketreach.co/llms.txt` first, writing the real shapes to `docs/rocketreach-api-notes.md`, and coding against those rather than the summary, with the live docs winning any contradiction. `docs.rocketreach.co` is blocked, so that instruction cannot be honoured. Writing the client from the summary would violate an explicit instruction and would likely need rewriting once the real shapes are known.

**D6. Built nothing, including M0.**
M0 is mostly local scaffolding and could have been produced without any credential. Step 2 of "HOW TO USE THIS FILE" says to write BLOCKED.md and stop on a failed preflight, with no carve out for milestones that happen not to need the network. The operator also asked for the file to be followed literally. Building M0 anyway would have put a half configured monorepo on the branch, and the Prisma schema and the Zod env module both need `DATABASE_URL` and the real variable set to be worth committing.

**D7. Did not open a pull request.**
The instruction was to open one when M6 passes. It did not pass. The branch carries the three report files so the operator can read them in the GitHub UI without starting a session.

**D8. Recorded no secret values anywhere.**
Environment variables were checked for presence and length only, never printed. `BLOCKED.md` names the variables and marks each secret `<supply>`.

**D9. Reported the push failure as blocker 3 instead of retrying it.**
`git push` returned `403` and the GitHub API returned `403 Resource not accessible by integration`. The retry with backoff policy covers network errors, and this is an authorization refusal, so retrying would only repeat the same denial. Read access through the GitHub API works, which localises the problem to write permission on the Claude GitHub App installation rather than a broken connection.

**D10. Sent the three files to the operator directly in the session.**
The commit exists only inside an ephemeral container that will be reclaimed, and blocker 3 makes pushing impossible. Handing the files over in the session is the only way the preflight findings survive. The operator can commit them by hand, or simply act on them and let a later session regenerate them.

## 2026-08-26, build session (operator override)

**D11. Building M0 offline after an explicit operator override.**
The operator instructed "keep working" three times after reading the preflight report. That is a direct, repeated instruction from the product owner and it overrides the spec's step 2 hard stop for this session. Blocker 1 (env vars) and blocker 2 (network) remain real and are worked around locally where possible; blocker 3 (no push) means the work is committed locally and delivered as files rather than pushed. Live integration checks (M1 real RocketReach and Sheets calls, M2 live discovery) still cannot run here and will be marked accordingly.

**D12. Created a local `.env.local` and a local Postgres role and database for the build.**
The cloud supplied no variables, so to run migrations, seed, and tests I created `.env.local` (gitignored, never committed) using the Section 1 example values, and created role `dph` and database `dph_lead_engine` to match. This is the "locally they live in .env.local" path the spec describes. No real secret is used or committed; RocketReach, Anthropic, Serper, Brevo, and Google keys are left blank because `REVEAL_MODE=off`, `AI_MODE=off`, and `PLACES_ENABLED=false` mean M0 does not call them.

**D13. Package and framework versions.**
Next.js 15 App Router with React 19, Tailwind CSS 4, TypeScript strict, Prisma 6, Auth.js (next-auth v5), Zod, Vitest, pino, pg-boss, all per Section 11. Exact patch versions are whatever the registry resolves at build time and are pinned in the committed lockfile.

**D14. Env schema requires core app vars but treats integration keys as optional at boot.**
Section 12 says Zod refuses to start when a required key is missing, and Section 1 preflight is the gate that requires the integration keys. To let M0 and the UI boot and be tested offline, the boot schema (`packages/config/env.ts`) requires only the core app variables (database, auth, mail from, mode flags, log, tz). Integration keys (RocketReach, Serper, Brevo, Google, Sheet id) are optional at boot and their absence is surfaced on Settings and in `integration_status`. ANTHROPIC_API_KEY is required only when AI_MODE is on, GOOGLE_MAPS_API_KEY only when PLACES_ENABLED is true. The preflight script (built later) is the hard gate for a real run.

**D15. Added reference tables `states` and `counties`, which are not in Section 7.**
The M0 seed and stage 1 discovery (Serper per county) need them. States seed fully from config. Counties seed from a small verified sample (`packages/db/data/counties.sample.json`) covering the priority states, because the full US Census county list cannot be fetched offline and fabricating 3,000 county names would be wrong data. The full list loads via a county loader in M2 when the network allows. The sample file says plainly it is not the full list.

**D16. AI mode label in the Settings UI is vendor neutral.**
Section 9 says show AI mode as "Rules or Claude", but Section 19 (CLAUDE.md) and the organization rules say never name a vendor in the UI, and the organization rules take priority. The console is internal (two users), but to honor the stricter rule the Settings row shows "Rules mode, no key needed" when off and "AI classifier" when on, never the vendor name. AI_MODE is off for the whole build, so the on label never renders anyway. The env var identifier ANTHROPIC_API_KEY stays, because it is the contract with the operator's environment and is server side only.

**D17. Password hashing with bcryptjs.**
Pure JavaScript, so no native build is needed in the sandbox. Used in the seed and in the credentials provider. Cost factor 10.

**D18. Login rate limit is in memory for v1.**
Section 4 asks for 10 attempts per 15 minutes per IP. Implemented as a single process in memory store, correct for one web container. A multi instance production deployment moves this to a shared store (Postgres or Redis). Recorded here rather than over building it in v1.

**D19. next/font/google kept, since the Google font CDN is reachable.**
Section 10.2 says self host with next/font/google. fonts.googleapis.com and fonts.gstatic.com return 200 through the proxy, unlike the product data hosts, so the build fetches Bricolage Grotesque, IBM Plex Sans, and IBM Plex Mono successfully. Verified by a passing production build.

**D20. Next.js standalone output.**
`output: standalone` for the production Docker image (Section 14). A consequence is that `next start` warns and the container runs `node .next/standalone/server.js`. The smoke test used the built server directly and passed; the production compose file will invoke the standalone server.

## 2026-08-26, M1 integrations

**D21. Built the RocketReach client from the Section 5.3 summary, superseding D5.**
Section 5 wants the live docs fetched first, but docs.rocketreach.co is blocked. Under the operator override to keep building, the client is coded from the Section 5.3 endpoint and syntax summary, with best effort Zod schemas marked `passthrough` so unexpected fields do not break parsing. A session with network validates these shapes against the live docs and reconciles any difference before real reveals.

**D22. Credit endpoints are guarded in the client, not only in the reveal stage.**
`lookupPerson` and `companyLookup` throw when REVEAL_MODE is off, and `companyLookup` also throws when company lookup is disabled. This is a second lock in addition to the reveal stage logic, so an accidental call anywhere in the code cannot spend a credit during the build. Covered by tests that assert zero fetch calls are made.

**D23. Adapter transport is a shared HttpClient, except Sheets.**
`HttpClient` centralizes the limiter, retries, Retry-After, timeout, and api_calls logging for the fetch based adapters. `SheetsClient` uses googleapis for transport (it handles auth and its own retries) and wraps each call with the same token bucket and api_calls logging, so the "every adapter has a limiter and logging" rule holds.

**D24. Cost units are recorded only on a successful call.**
The api_calls row records costUnits only when a call returns 2xx. Retries and failures record zero, matching "failed lookups are not charged". This keeps the ledger and api_calls honest.

**D25. jitter and clock are injectable for deterministic tests.**
The limiter and HttpClient take a Clock and a jitter function. Tests use a manual clock that advances virtual time on sleep and a fixed jitter, so retry and backoff timing is asserted exactly with no real delay and no Math.random in the test path.

## 2026-08-26, M2 requests, discover, gate 1

**D26. Pipeline stays pure; stage orchestration that touches Postgres lives in the worker.**
`packages/pipeline` holds pure logic and adapters with no database dependency, so its tests need no database. The discovery persistence stage (merge, suppress, write venues, update stage counts) lives in `apps/worker/src/stages` and takes already gathered venues plus a suppression lookup, so it is verifiable offline with fixtures. The worker job gathers from live clients and calls it.

**D27. Each discovery source is attempted independently.**
A source that fails, including a blocked network, is logged as a run event and the run continues with what the other sources returned. This follows the spec rule to never stall on a download and makes an offline run degrade to pasted clubs rather than fail.

**D28. CSV parsing is a small vetted in house parser, not a dependency.**
`suppression/csv.ts` is a correct CSV reader (quoted fields, escaped quotes, embedded commas and newlines, CRLF) with unit tests. This avoids adding a parser dependency for one feature. XLSX upload, when added, is parsed by a spreadsheet library in the web handler and passed to the same row based import helpers.

**D29. Run enqueues discovery on pg-boss; the web app sends, the worker processes.**
The Run request action creates a run and sends a discover job. The worker owns processing. Both connect to the same Postgres, so no extra broker is needed. Live end to end processing needs the worker running and the network open, so it is exercised in a session that has both.

## 2026-08-26, M3 qualify, map, find, gate 2

**D30. Rules engines produce the exact Claude output shape.**
`classifyByRules` and `adjudicateByRules` return the same fields as the Section 17 Claude prompts, so switching AI_MODE changes only which function runs. Both are pure and unit tested, so the default offline path is fully covered.

**D31. Worker stages take already gathered data so they are testable offline.**
`qualifyVenueByRules` takes fetched pages and `createCandidates` takes search results, both plus Prisma. The worker jobs do the live fetch and person search and call these. This let M3 be verified end to end against the database with fixtures while the network is blocked.

**D32. Same run dedupe keeps the higher ranked occurrence.**
Gate 2's SameRunSet records a candidate's keys only when it is kept as ready, so a later occurrence of the same person (under a venue and again under its group) is caught as a same run duplicate. Verified by test.

**D33. next start warns under output standalone; the smoke test used next start.**
`output: standalone` is set for the production image. `next start` prints a warning and the standalone server needs the Prisma query engine copied next to the bundle, which is a Dockerfile step in M6. For the in VM smoke tests, `next start` with the full node_modules is used and works. M6 copies the Prisma engine into the standalone image.

## 2026-08-26, M4 reveal and deliver

**D34. Reveal is guarded three ways so no credit is spent during the build.**
The RocketReach client refuses lookup while REVEAL_MODE is off (D22), the reveal stage's off branch never calls the client and writes fixtures instead, and hard stop 2 keeps REVEAL_MODE off for the whole build. Verified offline: a reveal produced zero credit ledger rows.

**D35. Fixture contacts are clearly fake and deterministic.**
The off path writes example.com emails and 555 phone numbers, credit_charged false, derived deterministically from the candidate id so a re run is stable and no fixture is mistaken for real contact data.

**D36. Deliver degrades honestly when the sheet or email is not configured.**
With no Google service account the run sits in done_pending_sheet and logs that leads are in the database only; with no Brevo key it logs that email is disabled. Leads live in Postgres first, so nothing is lost, matching Section 6.8.

**D37. A single run-request orchestration job chains all stages.**
Run request enqueues one job that runs discover, qualify, find, reveal, and deliver in order. Live stages (site fetch, person search) are wrapped so a blocked network logs a run event and the run continues to deliver rather than failing.

## 2026-08-26, M5 polish

**D38. Playwright uses the pre installed Chromium via executablePath.**
The environment ships Chromium at /opt/pw-browsers/chromium and blocks the browser download. The config sets launchOptions.executablePath to it, so the smoke test runs without `playwright install`. @playwright/test is pinned to a version compatible with that browser build.

**D39. The smoke test drives the seeded demo run rather than a live worker run.**
The spec's smoke test creates a request, runs it in demo mode, and opens Results. The worker is not driven inside the test and live discovery is offline, so the test opens the seeded demo request (a completed demo run with a full scorecard and 200 candidates), which is the faithful offline equivalent, plus it exercises the draft save path on the real form.

**D40. Review approve and decline are server action forms, no client state.**
Each row posts a small form to a server action, so the review queue works without shipping extra client JavaScript. The reveal itself stays gated by REVEAL_MODE off.

## 2026-08-26, M6 ship ready

**D41. Migrations run from a one shot compose service, not on web start.**
Section 14 says migrations run on web start. The Next standalone runtime image is minimal and does not carry the Prisma CLI, so a dedicated `migrate` service (built from the worker image, which has the full toolchain) runs `prisma migrate deploy` before web and worker start, gated by `depends_on: service_completed_successfully`. The effect is the same: the schema is migrated before the app serves, and it is more robust than shelling out from the standalone server.

**D42. The web runtime image copies the Prisma query engine.**
The standalone build does not copy the Prisma engine next to the bundle, which fails at runtime. The web Dockerfile copies `node_modules/.prisma` and the Prisma schema into the runner and installs openssl, so the engine loads. This was the cause of the standalone start error seen during the M3 smoke test, which used `next start` with full node_modules instead.

**D43. docs/rocketreach-api-notes.md is written but marked pending live validation.**
Section 5 requires it. The live docs host was blocked, so the file records the Section 5.3 summary the client was coded against and states plainly that a network enabled session must validate the shapes against the live docs before real reveals.

## 2026-08-27, reshape to a general lead finder

**D44. Generalized the tool from country club venues to any business type, and simplified the UI.**
Operator feedback made clear the venue only, tab heavy build did not fit. The engine (RocketReach person search and lookup, dedupe, credit ledger and caps, export, the pg-boss worker) is reused unchanged. New: a plain language command parser (business type, states, count), an owner and decision maker title hierarchy, general business discovery (Serper and RocketReach company search, Places optional), and a simple UI: one command box, a results table, a capped batch verify with a credits meter, and CSV export. The venue pipeline is left in place but out of the main flow.

**D45. Verified cells stay capped by credits; volume expectations set honestly.**
Discovery and owner names are free and can be large. A verified owner cell costs one RocketReach credit, so it is done in operator approved batches (reveal-batch job). The 3,600 per year plan cannot produce thousands of verified cells per run; the UI shows the remaining credits so the limit is visible.

**D46. Business records reuse the venues table.**
Rather than a large schema rename, a discovered business is stored as a venue (name, city, state, website, domain); the venue specific columns are simply unused for general searches. Requests gained command, businessType, and keywords fields.

**D47. Post reshape fixes: sign in redirect, product name, and the web test runner.**
The reshape removed /dashboard, /requests, and /groups, but the login server action and the middleware still redirected to /dashboard, so sign in landed on a 404. Both now go to /search. The visible product name is Lead Finder (login heading and browser title), matching the left rail and the approved UI. The web package ran `vitest run` with no config, so vitest tried to collect the Playwright smoke spec and failed; a web vitest.config.ts now excludes playwright/, and the smoke spec was rewritten for the command based UI (find leads page, the seeded demo search, the owner table, the verify panel, the CSV link). Unit tests: config 9, pipeline 195, all green; web build clean.

**D48. The web Docker image copies the Prisma query engine from the pnpm store into a path the standalone server searches.**
The Next standalone build does not trace Prisma's native query engine, and in a pnpm workspace the generated client lives under node_modules/.pnpm/@prisma+client<hash>/node_modules/.prisma/client, not at node_modules/.prisma. The old Dockerfile copied node_modules/.prisma, which does not exist in a pnpm layout, so the engine was never present and every page that queried the database threw PrismaClientInitializationError (could not locate the Query Engine for the runtime). The build stage now stages the generated client to /app/prisma-generated, and the runner copies it to apps/web/.prisma/client, next to the standalone server at apps/web/server.js, which is one of the paths Prisma searches. Verified by running the standalone server against the local database: /api/health returns db ok and pages render. The worker image is unaffected because it keeps the full node_modules and runs from source.

**D49. The site fetcher loads jsdom and Readability lazily so the web app never bundles them.**
The pipeline barrel re-exports the adapters, including the site fetcher, which imported jsdom and @mozilla/readability at module load. Any web page that imports the barrel (for parseCommand or toReadableUsPhone) therefore pulled jsdom into the server bundle, and bundling jsdom for the server breaks it: its CSSOM classes throw "CSSGroupingRule is not a constructor" and its data file loading throws "Unexpected end of JSON input". This crashed every signed in page (the digest seen on the search screen). extractText and collectAnchors now import jsdom and Readability with a dynamic import inside the function, so the static module graph the web imports no longer contains jsdom; it is isolated in a lazy chunk the web never loads, while the worker loads it on first use. Both functions became async and their two callers and tests were updated. serverExternalPackages was not used because transpilePackages forces the workspace package to be bundled, which overrides it.

**D50. Docker build fixes for a clean pnpm workspace build.**
Two build stage fixes, validated by the operator building the image locally, are folded in so a clean build works without a local patch. First, the build stage copies the whole installed workspace from the deps stage (COPY --from=deps /app ./) rather than only the root node_modules, so pnpm can resolve the per package prisma binary when it runs generate. Second, the web build creates apps/web/public because the repo ships no public directory and the runner copies one. The worker build takes the same whole workspace copy. The runner keeps the targeted Prisma client copy from D48 rather than copying the entire node_modules, so the standalone image stays lean.

**D51. The command parser captures qualifier words and folds them into discovery.**
A command like "country clubs that offer weddings and events for non members" carries detail beyond type and place. The parser used to keep only the type keywords and drop the rest, so the search lost the intent. It now extracts the descriptive words that remain after removing the leading verbs, the type words (singular and plural), the state names, the count, and common filler and prepositions. Those qualifiers are returned on the parsed command and folded into the first discovery keyword (for example "country club weddings events non members"), while the plain type keyword is kept for recall. Plain type and place searches produce no qualifiers, so existing behavior is unchanged.

**D52. Live keys for the local stack come from a gitignored docker/live.env.**
Secrets come from the environment only, so the local Docker stack reads an optional docker/live.env through compose env_file (required false, so a missing file stays offline). The file holds SERPER_API_KEY, ROCKETREACH_API_KEY, REVEAL_MODE, and the optional Places, Brevo, and Sheets settings. It is gitignored and dockerignored so it is never committed or baked into an image layer. The compose environment block keeps only non secret defaults and, by taking precedence over env_file, holds AI_MODE off. REVEAL_MODE defaults to off in the example, so verified cells (the one paid action) are only enabled when the operator sets REVEAL_MODE to ask. A committed docker/live.env.example documents each key.
