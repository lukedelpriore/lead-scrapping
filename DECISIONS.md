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
