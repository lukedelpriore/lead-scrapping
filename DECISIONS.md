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
