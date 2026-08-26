# BLOCKED

Preflight (Section 1) failed. Build stopped before M0 per "HOW TO USE THIS FILE" step 2 and hard stop 1.
No application code was written. REVEAL_MODE and AI_MODE were never set, so no RocketReach or Anthropic call was attempted.

Date: 2026-08-26. Session branch: `claude/dph-lead-engine-build-vmwj72`.

---

## Preflight results

| Check | Result |
|---|---|
| Node 22 or newer | PASS, v22.22.2 |
| pnpm 9 or newer | PASS, 10.33.0 |
| PostgreSQL reachable | PASS after `service postgresql start`, 16.13 accepting connections on 5432 |
| Required variables present in `process.env` | **FAIL, blocker 1** |
| `ROCKETREACH_API_KEY` valid | **FAIL, blocker 1 (no key) and blocker 2 (host blocked)** |
| `ANTHROPIC_API_KEY` valid | SKIPPED, correct when `AI_MODE=off` |
| `GOOGLE_SERVICE_ACCOUNT_B64` decodes | **FAIL, blocker 1** |
| `SHEET_ID` writable | **FAIL, blocker 1** |
| `SERPER_API_KEY` valid | **FAIL, blocker 1 and blocker 2** (spec says warn only) |
| `BREVO_API_KEY` valid | **FAIL, blocker 1 and blocker 2** (spec says warn only) |

---

## Blocker 1: every required environment variable is absent

**What failed.** The cloud environment configuration supplied none of the variables in Section 1. `process.env` holds 134 names, all of them container and proxy internals. There is no `.env.local` anywhere on disk.

**Exact error.** Zod env validation cannot run because every input is `undefined`. Verified in this session with `node -e "Object.keys(process.env)"`.

Missing and strictly required:

```
DATABASE_URL
AUTH_SECRET
AUTH_URL
ALLOWED_EMAILS
ROCKETREACH_API_KEY
AI_MODE
GOOGLE_SERVICE_ACCOUNT_B64
SHEET_ID
MAIL_FROM
REVEAL_MODE
PLACES_ENABLED
LOG_LEVEL
TZ
```

Missing and warn only, the run degrades but proceeds:

```
SERPER_API_KEY
BREVO_API_KEY
```

Missing and genuinely optional for this build:

```
GOOGLE_OAUTH_CLIENT_ID       # password login is the seeded fallback
GOOGLE_OAUTH_CLIENT_SECRET
ANTHROPIC_API_KEY            # not needed while AI_MODE=off
GOOGLE_MAPS_API_KEY          # not needed while PLACES_ENABLED=false
```

**What the operator must supply.** Open the environment at claude.ai/code, edit the environment used by this session, and add the variables below. Values marked `<supply>` are secrets that only the operator holds. Do not paste them into chat or into any file in the repo.

```
DATABASE_URL=postgresql://dph:dph@localhost:5432/dph_lead_engine
AUTH_SECRET=<supply>                 # generate with: openssl rand -base64 32
AUTH_URL=http://localhost:3000
ALLOWED_EMAILS=luke@delpriorehospitality.com,hashir@delpriorehospitality.com
ROCKETREACH_API_KEY=<supply>
AI_MODE=off
SERPER_API_KEY=<supply>
GOOGLE_SERVICE_ACCOUNT_B64=<supply>  # service account JSON, base64 on one line
SHEET_ID=<supply>
BREVO_API_KEY=<supply>
MAIL_FROM="Del Priore Lead Engine <leads@delpriorehospitality.com>"
REVEAL_MODE=off
PLACES_ENABLED=false
LOG_LEVEL=info
TZ=America/New_York
```

Two prerequisites that are easy to miss:

1. The spreadsheet at `SHEET_ID` must be shared as **Editor** with the service account email (the `client_email` field inside the service account JSON). Preflight appends one test row and deletes it, which fails on view only access.
2. The Google Cloud project behind the service account needs the Google Sheets API enabled.

---

## Blocker 2: the environment network policy blocks four of the five external providers

This is independent of blocker 1. Supplying the keys alone will not clear preflight, because the key validation calls cannot leave the container.

**What failed.** The egress gateway answers `403` to `CONNECT` for these hosts. Tested twice, several minutes apart, with the same result each time, so this is stable policy and not a transient failure.

```
api.rocketreach.co:443     403 to CONNECT
docs.rocketreach.co:443    403 to CONNECT
api.brevo.com:443          403 to CONNECT
google.serper.dev:443      403 to CONNECT
overpass-api.de:443        403 to CONNECT
```

**Exact error**, from `curl -v https://api.rocketreach.co/api/v2/account`:

```
* Establish HTTP proxy tunnel to api.rocketreach.co:443
> CONNECT api.rocketreach.co:443 HTTP/1.1
< HTTP/1.1 403 Forbidden
* CONNECT tunnel failed, response 403
curl: (56) CONNECT tunnel failed, response 403
```

The proxy reports the same in its own words at `$HTTPS_PROXY/__agentproxy/status`:

```
"kind": "connect_rejected",
"detail": "gateway answered 403 to CONNECT (policy denial or upstream failure)"
```

Reachable, for contrast, so the policy is an allowlist rather than a full block:

```
sheets.googleapis.com      reachable
oauth2.googleapis.com      reachable
api.anthropic.com          reachable
registry.npmjs.org         reachable (package installs are fine)
```

**Why this stops the build rather than degrading it.**

1. Preflight requires a live `GET account` against RocketReach, and Section 2 hard stop 1 makes a failed preflight a stop.
2. Section 5 requires fetching `https://docs.rocketreach.co/llms.txt` and coding the client against the real request and response shapes before implementing it. That host is blocked too, so the client would have to be written against the spec summary, which Section 5 explicitly forbids.
3. Overpass is the primary free discovery source in stage 1, so M2 cannot be verified against live data.
4. Brevo and Serper are warn only in Section 1, so those two alone would not have stopped anything.

**What the operator must supply.** Change the network policy on this environment to allow outbound HTTPS to the five hosts above, then start a fresh session on the same branch. The network access levels and where to set them are documented at https://code.claude.com/docs/en/claude-code-on-the-web. Either widen the policy to unrestricted, or, preferred, keep it restricted and add exactly these entries:

```
api.rocketreach.co
docs.rocketreach.co
overpass-api.de
google.serper.dev
api.brevo.com
```

If policy cannot be widened for RocketReach specifically, say so in the next session and the build can proceed against recorded fixtures with the live account check deferred, but that is a deliberate downgrade of the Section 1 and Section 5 requirements and needs your decision, not mine.

---

## Blocker 3: this session cannot push to the repository

Discovered after the two blockers above were written and committed locally.

**What failed.** Both write paths are refused. Read access works, so this is a write permission problem specifically, not a broken connection.

`git push -u origin claude/dph-lead-engine-build-vmwj72`:

```
remote: Claude doesn't have GitHub access to lukedelpriore/lead-scrapping for your
remote: organization. An org admin can install the Claude GitHub App at
remote: https://github.com/apps/claude/installations/select_target, or reconnect
remote: GitHub from claude.ai settings to re-link an existing installation
fatal: unable to access 'https://github.com/lukedelpriore/lead-scrapping/':
The requested URL returned error: 403
```

The GitHub API path fails the same way:

```
POST https://api.github.com/repos/lukedelpriore/lead-scrapping/git/refs
403 Resource not accessible by integration
```

**What the operator must supply.** One of these, whichever matches the account setup:

1. An org admin installs or reinstalls the Claude GitHub App against this repository at https://github.com/apps/claude/installations/select_target
2. Reconnect GitHub from claude.ai settings at https://claude.ai/customize/connectors?auth_start=github&auth_start_force=1 to re-link an existing installation

**Consequence.** The commit exists only inside this container, which is ephemeral and will be reclaimed. The three files were sent to the operator directly in the session so the work is not lost. Until write access is granted, no session can commit the build, which makes this blocker the one to clear first.

---

## What to do next

In this order. Blocker 3 comes first, because without it nothing a later session builds can be saved.

1. Grant write access per blocker 3, then confirm with a trivial push.
2. Add the variables from blocker 1 to the environment.
3. Add the five hosts from blocker 2 to the network policy.
4. Share the spreadsheet with the service account as Editor and enable the Sheets API.
5. Start a fresh session on branch `claude/dph-lead-engine-build-vmwj72` and repeat the preflight. It re runs from scratch, deletes this file on success, and continues into M0.

Nothing here is recoverable from inside the session. All three blockers are account and environment configuration that only the operator can change.
