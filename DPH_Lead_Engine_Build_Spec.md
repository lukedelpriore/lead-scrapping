# Del Priore Hospitality Lead Engine
## Autonomous build specification for Claude Code

Version 3.2 | August 26, 2026 | Supersedes all earlier documents
Build surface: Claude Code on the web (claude.ai/code), Anthropic hosted cloud VM, working on a GitHub branch
Product owner: Luke Del Priore. Operator and builder: Hashir Faiz, Head of Web and SEO, Del Priore Hospitality.
Brand: Del Priore Hospitality only. No other company name appears anywhere in the repo, UI, emails, comments, or commits.

---

## HOW TO USE THIS FILE

Read this entire document before writing any code. Then:

1. If `PROGRESS.md` exists, read it and resume from the first unfinished milestone. Otherwise start at step 2.
2. Run the **preflight** in Section 1. If anything fails, write `BLOCKED.md` and stop. Otherwise continue.
3. Build **M0 through M6** in Section 16 **continuously, without stopping for approval between milestones**.
4. Obey the **hard stops** in Section 2. Those are the only reasons to pause.
5. When M6 passes, write `HANDOFF.md` (Section 18), push, open a pull request to `main`, and stop.

You are running in a Claude Code cloud session. There is no operator at a terminal. Nobody will answer questions mid build. Do not ask the operator to confirm design choices, library choices, file layout, or naming. Every one of those decisions is made in this document or is yours to make. If a detail is genuinely absent, choose the option most consistent with the rest of this spec, record it in `DECISIONS.md`, and keep building.

Working rules for the cloud session:
- Commit after every milestone with a message like `M3: qualify, groups, find, gate 2`, and push to the session branch each time. Pushes only work on the session's own branch.
- After each milestone, update `PROGRESS.md` with the milestone name, status, and the exact next step. A fresh session must be able to resume from that file alone.
- Environment variables arrive from the cloud environment configuration, not from a file. Read them from `process.env`. Write a `.env.example` for local use but never write a real `.env` file into the repo.
- PostgreSQL 16 is pre installed on the VM but not running. Start it with `service postgresql start`, then create the role and database that `DATABASE_URL` expects.
- If a package download is blocked by the network policy, retry once, then find a way that does not need it (a different package, a vendored file, or a documented fallback). Record it in `DECISIONS.md`. Never stall on a download.
- Usage limits can pause a session. That is fine. `PROGRESS.md` plus the pushed branch make resumption safe.

---

## 1. Preflight

Before M0, verify every item and print a table of results.

| Check | How | If it fails |
|---|---|---|
| Node 22 or newer | `node -v` | Install via nvm and continue |
| pnpm 9 or newer | `pnpm -v` | `npm i -g pnpm` and continue |
| PostgreSQL reachable at `DATABASE_URL` | `pg_isready`, then a test connection | Start the pre installed service (`service postgresql start`), create the role and database from `DATABASE_URL`, retry. Only if that fails, write BLOCKED.md and stop |
| Required variables present in `process.env` (cloud) or `.env.local` (local) | Zod env check | Write BLOCKED.md listing the missing names, stop |
| `ROCKETREACH_API_KEY` valid | GET the account endpoint (free) | Write BLOCKED.md and stop |
| `ANTHROPIC_API_KEY` valid (only when `AI_MODE=on`) | one token ping to the Messages API | If `AI_MODE=off`, skip this check entirely. If `AI_MODE=on` and the key fails, write BLOCKED.md and stop |
| `GOOGLE_SERVICE_ACCOUNT_B64` decodes to valid JSON (or `GOOGLE_SERVICE_ACCOUNT_JSON` path parses locally) | base64 decode plus JSON parse | Write BLOCKED.md and stop |
| `SHEET_ID` writable by the service account | append then delete one test row | Write BLOCKED.md and stop |
| `SERPER_API_KEY` valid | one test query | Warn only. Discovery falls back to Overpass plus RocketReach company search |
| `BREVO_API_KEY` valid | GET `https://api.brevo.com/v3/account` | Warn only. Email delivery is disabled and every run reports it |

`BLOCKED.md` format: what failed, the exact error, the exact value or command the operator must supply, nothing else.

**Required variables.** In the cloud they are set in the cloud environment dialog at claude.ai/code. Locally they live in `.env.local`. The operator supplies them. Never invent them, never commit them.

```
DATABASE_URL=postgresql://dph:dph@localhost:5432/dph_lead_engine
AUTH_SECRET=                      # openssl rand -base64 32
AUTH_URL=http://localhost:3000
ALLOWED_EMAILS=luke@delpriorehospitality.com,hashir@delpriorehospitality.com
GOOGLE_OAUTH_CLIENT_ID=           # optional in dev, password login is seeded as fallback
GOOGLE_OAUTH_CLIENT_SECRET=
ROCKETREACH_API_KEY=
AI_MODE=off                       # off = rules based classifier and adjudicator, no Anthropic key needed. on = Claude does both
ANTHROPIC_API_KEY=                # only required when AI_MODE=on
SERPER_API_KEY=
GOOGLE_SERVICE_ACCOUNT_B64=       # the service account JSON, base64 encoded on one line (cloud)
GOOGLE_SERVICE_ACCOUNT_JSON=      # or a file path (local only)
SHEET_ID=
BREVO_API_KEY=                    # Brevo transactional email over HTTPS. SMTP is not used because the cloud sandbox only allows HTTP and HTTPS
MAIL_FROM="Del Priore Lead Engine <leads@delpriorehospitality.com>"
REVEAL_MODE=off                   # off | ask | auto. Stays off for the entire build.
PLACES_ENABLED=false
GOOGLE_MAPS_API_KEY=
LOG_LEVEL=info
TZ=America/New_York
```

---

## 2. Hard stops (the only reasons to pause)

1. **A preflight check fails.** Write BLOCKED.md, stop.
2. **Any call that would spend a RocketReach credit.** `REVEAL_MODE` stays `off` for the whole build. The reveal stage must be fully implemented and fully tested against fixtures, and must never hit the live lookup, bulk lookup, company lookup, or profile plus company lookup endpoints. Search, account, and status endpoints are free and may be called live.
3. **The same test fails three times after three different fix attempts.** Record the failure, the three attempts, and your best hypothesis in BLOCKED.md, mark that milestone partial, and continue to the next milestone if it does not depend on the failure.
4. **A required credential turns out to be missing mid build.** Same as 1.
5. **Anything that would cost real money outside the Anthropic API key** (paid Places calls while `PLACES_ENABLED=false`, SMS, ads). Never.

Everything else: decide and keep going.

---

## 3. What we are building

A private web portal for two people. Luke creates a lead request (states, groups, clubs, tier, how many contacts, credit cap), clicks Run, and later gets a Google Sheet and an email. Behind it, a worker pipeline finds every US country club and golf club that hosts weddings or corporate events for nonmembers, removes duplicates against everything Luke already has, identifies the right decision maker, spends RocketReach export credits only on deduplicated approved contacts, and writes results to the sheet.

**Goals:** no grunt work for Luke, zero duplicates delivered, zero credits on duplicates or wrong people, every credit reconciled against RocketReach's own numbers.

**Not in v1:** sales rep accounts, assignment, dialers, outcome tracking, GHL or any CRM push, outbound email or SMS. Never scrape RocketReach's website, never automate their web app, never share logins. The API is the only path.

---

## 4. Users and access

| User | Role | Can do |
|---|---|---|
| Luke | owner | Requests, approvals, settings, suppression, leads |
| Hashir | operator | Everything above plus integration status and logs |

Auth.js with two providers: Google OAuth restricted to `ALLOWED_EMAILS`, and a credentials provider seeded with the two users (password from `SEED_PASSWORD` or generated and printed once during seed) so the app is usable before OAuth is configured. httpOnly cookie sessions, 7 day expiry, login rate limited to 10 attempts per 15 minutes per IP.

---

## 5. RocketReach: constraints that shape the design

**Before implementing the client**, fetch `https://docs.rocketreach.co/llms.txt` and the pages it indexes for account, people search, people lookup, lookup status, and company search. Write the exact request and response shapes to `docs/rocketreach-api-notes.md` and code against those, not against the summary below. If the live docs contradict this section, the docs win and you note the difference in `DECISIONS.md`.

### 5.1 Credits

- **Lookup credits: unlimited** on this plan. A lookup reveals contact data inside RocketReach. Fair use: no more than 10,000 contacts in any 30 day period.
- **Person export credits: 3,600 per plan year, resetting June 15, 2027.** The API is an export activity, so every API lookup that returns verified contact data consumes one person export credit. Failed lookups are not charged. Re exporting the same profile is not charged again.
- **Company export credits:** a separate 3,600 pool. One per company lookup. Company search is free. Company lookup stays off unless `company_lookup_enabled` is true.
- **Free:** person search, company search, account, status polling.

UI wording: "Searching is free. Revealing a contact costs 1 credit. Duplicates and failed reveals cost nothing."

### 5.2 Rate limits

Read the real limits from the account endpoint at boot and hourly, and store them in `integration_status`. Published Pro values, used as the fallback:

| Action | per minute | per hour | per day | per month |
|---|---|---|---|---|
| Person search (free) | 30 | 250 | 750 | 15,000 |
| Person lookup (credits) | 50 | 300 | 1,500 | 20,000 |
| Company search (free) | 30 | 250 | 750 | 15,000 |
| Bulk jobs | 10 | 25 | 100 | n/a |

Global: 10 requests per second. HTTP 429 returns a `Retry-After` header in seconds; sleep exactly that long and retry. Stay under `search_quota_headroom` (0.90) of every limit.

Consequence: the daily person search quota, not credits, limits how fast people can be discovered. The worker paces itself and reports "Waiting for tomorrow's search quota" rather than failing.

### 5.3 Endpoints

Base `https://api.rocketreach.co/api/v2/`, header `Api-Key: <key>`.

| Purpose | Call | Credits |
|---|---|---|
| Account, plan, balances, limits | GET `account` | none |
| Person search | POST `person/search` with `{ start, page_size (max 100), query: {...}, order_by: "popularity" }` | none |
| Person lookup | GET `person/lookup` with one of `id`, `linkedin_url`, `email`, or `name` plus `current_employer` | 1 lookup plus 1 person export on success |
| Lookup status | GET `person/checkStatus`. Statuses: complete, failed, waiting, searching, progress. Poll no faster than every 3 seconds; typical resolution about 5 seconds | none |
| Bulk lookup | POST `person/bulkLookup`, 10 to 100 queries, webhook required | exports. Not used in v1 |
| Company search | POST `company/search` | none |
| Company lookup | GET `company/lookup` | 1 company export. Off by default |

Search syntax: wrap a value in escaped double quotes for exact match (`"current_employer": ["\"Heritage Golf Group\""]`), prefix with `-` to exclude (`"-Assistant"`), append `::~25mi` to a location for a radius, and `order_by: "popularity"` puts executives first.

### 5.4 Rules the code must enforce

- The RocketReach key exists only in server env. Never sent to the browser, never logged, never written to the sheet.
- Never export "My Contacts" (1,188 records would cost 1,188 credits). Luke's existing leads enter through the suppression import.
- Every external call writes an `api_calls` row with provider, endpoint, status, duration, and cost units. Never log keys or full contact payloads.

---

## 6. The pipeline

Eight stages. Both dedupe gates run before any credit is spent.

```
Request
 1 Discover venues         free    Overpass, RocketReach company search, Serper, group portfolio pages, optional Places fill
 2 Gate 1 venue dedupe     free    merge duplicates, drop clients, prospects, in play groups, suppressed venues
 3 Qualify venues          free    fetch site, Claude classifier, tier
 4 Map groups and rank     free
 5 Find decision makers    free    RocketReach person search, fallbacks, Claude adjudication
 6 Gate 2 candidate dedupe free    suppression, delivered leads, same run duplicates
 7 Reveal                  CREDITS caps, reserve check, status polling, ledger
 8 Deliver                 free    post reveal check, Google Sheet, email
```

### 6.1 Discover

1. **Overpass (free, primary).** Per state: `leisure=golf_course` features with a name. Capture name, lat, lng, website, phone, osm id. One request at a time, exponential backoff on 429 and 504, cache per state for 90 days.
2. **RocketReach company search (free).** Keywords "country club", "golf club", "golf and country club" per state, page size 100, paginate fully. Capture company id, name, domain, location. These match RocketReach employer strings, which improves stage 5.
3. **Serper (low cost).** Per county (seed the US Census county list): "country club weddings {county} {state}" and "golf club private events {county} {state}". Plus "site:theknot.com country club {state}" and "site:weddingwire.com country club {state}". Harvest result titles and URLs only. Never fetch or parse directory pages.
4. **Group portfolio pages.** For each seeded group, find and store the "our clubs" page, parse club names and links, attach clubs to the group.
5. **Places fill (off by default).** Only for venues still missing website or phone. If enabled, store the place id permanently and treat other fields as refreshable within 30 days.

`name_normalized`: lowercase, strip punctuation, collapse whitespace, expand "cc" to "country club" and "gc" to "golf club", drop a leading "the".

### 6.2 Gate 1

Merge order: same registrable domain (`tldts`, ignore `www`), then same place id or osm id, then `name_normalized` plus state with token set ratio 92 or higher and a fuzzy city match. Keep one canonical venue; the rest become `venue_sources` rows.

Then set `status = suppressed` for venues matching a suppression key (domain, or name plus state) or belonging to a group marked `in_play`. Suppressed venues stay visible in the portal but never proceed.

### 6.3 Qualify

Fetch the homepage plus up to five internal URLs whose path or anchor text contains wedding, weddings, events, private events, banquet, banquets, catering, corporate, meetings, venue, celebrations. Use `undici` with a 12 second timeout and a normal browser user agent, extract main text with `@mozilla/readability` on `jsdom`, fall back to Playwright when a page yields no text. Playwright is optional: try `pnpm exec playwright install --with-deps chromium`; if the browser download is blocked, use the system Chromium if present, otherwise disable the fallback with a `PLAYWRIGHT_AVAILABLE=false` flag, mark such pages `fetch_status = js_only`, and record it in `DECISIONS.md`. Cap 3,000 characters per page. Concurrency 8 globally, 1 per domain. Respect `robots.txt` for the paths fetched.

Classify with the rules engine when `AI_MODE=off` (the default), or with the Claude classifier (Section 17.1) when `AI_MODE=on`. Both produce the same JSON shape so nothing downstream changes.

**Rules engine (`AI_MODE=off`).** Lowercase all fetched text, keep the page URL for evidence.
- `hosts_weddings = yes` if a fetched URL path contains "wedding", or "wedding" or "weddings" appears 3 or more times across the pages, or the venue was found on The Knot or WeddingWire in stage 1.
- `hosts_corporate = yes` if any of: corporate event, corporate events, business meeting, company outing, golf outing, conference, banquet, meeting space, meeting rooms.
- `nonmember_events = yes` if any of: membership not required, no membership required, you do not need to be a member, you don't need to be a member, non members welcome, nonmembers welcome, non-members welcome, open to the public, available to non members, available to the public, public welcome. `= no` if any of: members only, members and their guests only, must be a member, member sponsored events only, and none of the yes phrases appear. Otherwise `unclear`.
- `ownership_type = group` if the text contains a seeded group name or a pattern like "managed by {Name}", "a {Name} property", "an {Name} club", "part of the {Name} family". `= member_owned` if any of: member owned, owned by its members, equity club, board of governors, board of directors together with "members". `= municipal` if any of: city of, county of, parks and recreation, municipal, or the domain ends in .gov or .us. `= private_owner` if any of: family owned, owned and operated by, proprietor. Otherwise `unclear`.
- `group_name`: the seeded group name that matched, or the capitalized phrase captured after "managed by" or before "property", or null.
- `capacity`: the largest number within 40 characters of "guests", "seated", or "capacity", or null.
- `site_contact`: a line containing one of Director of Catering, Director of Events, Director of Private Events, Director of Sales, Catering Sales Manager, Event Coordinator, General Manager, with a name on the same or previous line and an email or phone within 300 characters.
- `evidence_phrase`: the exact matched phrase, `evidence_url`: the page it came from.
- `confidence`: 0.9 when a yes or no phrase matched, 0.6 when only hosts flags matched, 0.3 otherwise.

Tier:

- **Tier 1**: group with 5 or more venues, or `nonmember_events = yes`.
- **Tier 2**: `hosts_weddings = yes` or `hosts_corporate = yes` with `nonmember_events = unclear`. A venue found on The Knot or WeddingWire counts as `hosts_weddings = yes`.
- **Tier 3**: municipal with event space.
- **Dropped**: `nonmember_events = no`, no event space found, or unreachable after 3 attempts across 2 days.

### 6.4 Map groups and rank

Attach venues to groups from classifier `group_name`, the seed list, and RocketReach company parent names. Store `venue_count` and `states`. Rank groups by venue count descending then request state order; single venues by tier, then state order, then classifier confidence.

### 6.5 Find decision makers (free)

Title lists per ownership type are in Section 15 and editable in Settings.

Search plan per target, in order, stopping when 2 or more good results appear:
1. Exact employer plus title list plus `order_by: popularity` plus `page_size: 25`. For venues add `location: ["\"{city}, {state}\"::~25mi"]`.
2. Loose employer (unquoted), same titles and location.
3. Venue name as `keyword` plus title list plus location. This catches people who list the venue in free text on their own profile when the venue has no company page.
4. Website staff contact captured in stage 3, plus a Serper query `site:linkedin.com/in "{venue name}" "general manager"` for a LinkedIn URL that can be looked up directly in stage 7.

Pacing: read `rate_limits` hourly and schedule under 90 percent of the per minute, per hour, and per day limits. When the day's quota is spent, set the request to `waiting_quota` with a plain message and resume automatically.

Adjudication with `AI_MODE=off` (default), rules scoring:
1. Drop results whose employer does not match the target: token set ratio below 90 against the venue name, or against the group name for group targets and for venues inside that group.
2. Drop titles containing any word from `exclude_everywhere`.
3. For venue targets drop results whose location state differs from the venue state; prefer the same city.
4. Score = hierarchy tier index (0 for the first list, 1 for the second, and so on) × 100, minus 10 for each seniority word in the title (owner, founder, chief, president, chairman, partner, vice, director, manager, in that order of weight), plus the RocketReach result position. Lowest score wins.
5. `primary` = best score, `alternate` = next best person from a different profile. `confidence` = 0.9 when employer ratio is 95 or higher and the title is in tier 0 or 1, 0.75 when employer ratio is 90 to 94 or the title is in tier 2 or 3, otherwise 0.5. `reason` is one line naming the tier and the employer ratio.

Adjudication with `AI_MODE=on`: up to 25 results per target to the Claude adjudicator (Section 17.2), same output fields and the same rejection rules.

### 6.6 Gate 2, the credit gate

Every candidate is checked before any lookup against:
1. **Suppression (people):** RocketReach profile id, normalized LinkedIn URL (lowercase, strip protocol, `www`, trailing slash, query string), `name_normalized` plus `employer_normalized` (exact name, employer token set ratio 90 or higher), plus any known email or phone.
2. **Delivered leads:** the same keys.
3. **Same run:** the same person can appear under a venue and under its group. Keep the higher ranked occurrence.

Matches become `dedupe_status = duplicate` with `dedupe_key` and `dedupe_source`, appear in the request's "Already have" tab, and never reach reveal.

### 6.7 Reveal (credits)

Before each batch:
1. Call the account endpoint. `available = person_exports_remaining - settings.reserve_credits`.
2. `batch_cap = min(request.credit_cap - request.credits_used, settings.max_credits_per_day - credits_used_today, available)`.
3. If `batch_cap <= 0`, pause the request with a plain reason and notify.

Modes: **auto** reveals every `ready` candidate with `confidence >= auto_reveal_min_confidence` (0.80) in rank order until `batch_cap`, sending lower confidence candidates to the review queue. **ask** sends everything to the review queue for Luke to select.

Caps: `max_contacts_per_venue` 2, `max_contacts_per_group` 4. Primary first; reveal the alternate only when the primary returned no mobile and the target is Tier 1 or 2.

Lookup identifier preference: `id`, then `linkedin_url`, then `name` plus `current_employer`. Poll `checkStatus` every 3 seconds up to 60 seconds, then requeue once. Store every email (address, type, grade) and phone (number, type, validity), plus the returned title and employer.

Ledger: after each completed lookup that returned at least one verified email or phone, write a `credits_ledger` row with `delta = -1`. After each batch, call the account endpoint and write a reconcile row. If the ledger and RocketReach disagree, flag the run with a warning and surface the drift in the portal.

`REVEAL_MODE=off` makes this stage a no op that reports "would spend n credits" and writes fixture contacts so stage 8 can be tested end to end.

### 6.8 Deliver

Post reveal check on E.164 phone and lowercased email against suppression and delivered leads. A hit means the same person under a different profile: deliver once, mark the other duplicate.

Append to the Google Sheet (Section 8), write the ledger, send one email with request name, stage counts, credits used, credits remaining, sheet link, and warnings. If the sheet write fails, the run sits in `done_pending_sheet` and retries every 10 minutes. Leads live in Postgres first, so nothing is lost.

### 6.9 Scheduling

A request runs once or weekly on a chosen day and time in US Eastern. Scheduled runs reuse discovery and qualification data newer than 90 days. Discovery refreshes quarterly per state.

---

## 7. Data model (Postgres, Prisma)

Every table has `id` uuid, `created_at`, `updated_at`.

- **users**: email, name, role (owner | operator), password_hash (nullable), last_login_at
- **settings** (single row): reserve_credits 200, max_credits_per_request 100, max_credits_per_day 300, auto_reveal_min_confidence 0.80, max_contacts_per_venue 2, max_contacts_per_group 4, title_lists json, state_order json, notification_emails json, spreadsheet_id, timezone, places_enabled, company_lookup_enabled, search_quota_headroom 0.90
- **requests**: name, created_by, states json, group_ids json, clubs_pasted text, tiers json, target_count, credit_cap, reveal_mode (auto | ask), schedule json, status (draft | queued | running | waiting_quota | needs_review | paused | done | done_pending_sheet | failed), sheet_tab_name, sheet_url, credits_used, notes
- **runs**: request_id, started_at, finished_at, status, stage_counts json, warnings json
- **run_events**: run_id, stage, level (info | warn | error), message, data json, at
- **venues**: name, name_normalized, city, state, website, domain, main_line, lat, lng, osm_id, place_id, rr_company_id, ownership_type, group_id, tier, hosts_weddings, hosts_corporate, nonmember_events, evidence_url, evidence_phrase, capacity, site_contact json, classifier_confidence, status (open | suppressed | dropped), qualified_at
- **venue_sources**: venue_id, source (osm | rocketreach | serper | group_page | places | pasted | knot | weddingwire), source_ref, raw json
- **groups**: name, name_normalized, domain, rr_company_id, portfolio_url, venue_count, states json, status (open | in_play | delivered), notes
- **candidates**: run_id, request_id, target_type (venue | group), venue_id, group_id, rr_profile_id, name, name_normalized, title, employer, employer_normalized, linkedin_url, linkedin_normalized, location, rank (primary | alternate), confidence, reason, dedupe_status (ready | duplicate | rejected), dedupe_key, dedupe_source, review_status (none | pending | approved | declined)
- **contacts**: candidate_id, rr_profile_id, name, title, employer, emails json, phones json, linkedin_url, has_mobile, has_verified_email, credit_charged bool, looked_up_at
- **leads**: contact_id, request_id, run_id, venue_id, group_id, sheet_row_master, sheet_row_request, delivered_at
- **suppression**: key_type (profile_id | linkedin | email | phone | name_employer | domain | venue_name_state | group), key_value, display_name, display_company, source (luke_import | client | prospect | in_play | do_not_contact | delivered), imported_from, notes. Unique on (key_type, key_value)
- **credits_ledger**: at, kind (charge | reconcile | reserve_change), delta, rr_person_exports_remaining, run_id, contact_id, note
- **api_calls**: at, provider, endpoint, status_code, duration_ms, cost_units, request_id, note
- **integration_status**: provider, last_ok_at, last_error, plan_name, limits json, usage json

Indexes on every dedupe key, plus `venues(state, status, tier)` and `candidates(run_id, dedupe_status)`.

---

## 8. Google Sheet output

One spreadsheet from `SHEET_ID`, shared with the service account as editor.

Tabs: **Leads** (all delivered, append only), one tab per request named like `R-0007 FL Tier 1 (Aug 27)`, **Suppression** (read only mirror, refreshed nightly), **Credits**, **Groups**.

Columns, fixed order, header row frozen:

Request ID, Club name, City, State, Website, Events page URL, Main line, Ownership type, Group name, Venues in group, Tier, Contact name, Title, Cell, Work phone, Work email, Personal email, Email grade, LinkedIn URL, RocketReach profile ID, Match confidence, Source, Date pulled, Notes, Rep, Status, Call notes

The last three columns belong to Luke. The app appends only; it never writes to those columns and never overwrites an existing row. Phones written as readable US text, E.164 stored in the database. Blank stays blank; never invent a value. Use `values.append` in batches up to 500.

---

## 9. Portal pages

Nav: Dashboard, Requests, Leads, Suppression, Groups, Settings. Left rail on desktop, bottom bar on phone.

**Dashboard.** Credit ledger bar (signature, Section 10.4). RocketReach status: plan, connection, searches used today against the daily limit, last checked. Active runs as scorecards with live counts. Last five deliveries with "Open sheet". One primary action: "New request".

**Requests list.** Name, status, states, target, credits used of cap, created, last run, sheet link. Filter by status and state.

**New request** (single page, sections, no wizard): name (auto suggested); states multi select plus saved order; groups multi select or pasted club names or websites or empty for automatic discovery; tiers (1 and 2 checked); target contacts, per venue 1 or 2, per group 1 to 4; credit cap defaulting to `ceil(target × 1.2)` with a live line "Available now: 3,390 (3,600 minus 200 reserved and 10 used today)"; reveal mode auto or ask with one sentence each; schedule once or weekly; notes. Bottom bar: "Save draft" and "Run request". Running shows a confirm sheet: "This request can spend up to 120 credits. Searching and dedupe are free. Continue?"

**Request detail.** Header with name, status pill, states, credits used of cap, "Open sheet", and Pause, Resume, Run again, Duplicate, Cancel. Scorecard across the top. Tabs: Results (delivered leads, cards on phone), Review (pending candidates with checkboxes, "Reveal selected (n credits)", "Decline"), Already have (duplicates with the matching key and source), Venues (with tier and evidence link), Log (newest first, filter by level). Waiting states in plain words: "Waiting for tomorrow's search quota. 212 venues left. Resumes 12:05 AM ET."

**Leads.** Master table with search and filters (state, tier, group, has cell, request, date). Row actions: open LinkedIn, copy cell, "Add to do not contact", open in sheet. Export selected to a new sheet tab.

**Suppression.** CSV or XLSX upload with a column mapper (auto detects name, company, title, LinkedIn, email, phone, website), preview, import, then a report of rows read, keys created, duplicates skipped. Table with source filter. Manual add for a person, a venue, or a group marked in play.

**Groups.** Name, venue count, states, status, portfolio URL. Actions: mark in play (suppresses the whole group), open portfolio, run a request for this group.

**Settings.** RocketReach connection test showing plan, balances by type, limits and usage, reset date, with a red banner on 401 or 403. Google Sheet id and "Test write" plus the service account email to share. Notification recipients and a test send. Pipeline numbers (reserve, caps, confidence, per venue and per group, state order by drag). Title lists per ownership type. Integrations (Places on or off, company lookup on or off, Serper, AI mode shown as Rules or Claude with a month to date spend estimate when Claude is on). Users allowlist. Activity log, searchable.

**Copy rules.** Every list has an empty state with one action. Errors say what happened and what to do ("RocketReach rejected the key (401). Update ROCKETREACH_API_KEY on the server and test again."). Buttons are verbs matching their result. Sentence case. No exclamation marks. **No em dashes or en dashes anywhere.** No hyphenated compound adjectives in prose. Never use: seamless, leverage, elevate, supercharge, game changer, ecosystem, unleash, transform, robust.

---

## 10. Design system

Subject: a private operations console for country club prospecting, used by an owner on his phone between calls and by an operator at a desk. The main screen's single job: create a request, watch it run, open the sheet. The feel is a well run clubhouse office, calm and exact, with brass used only where money is spent. Do not produce the default AI dashboard look (cream background, serif display, terracotta accent).

### 10.1 Palette
- **Clubhouse Navy** `#16283F`: primary actions, active nav, headings on dark surfaces
- **Fairway** `#2F5D46`: progress, success, completed stages
- **Brass** `#B8934A`: credits only, nothing else
- **Stone** `#EEF0EC`: app background
- **Card** `#FFFFFF` with a 1px `#D9DDD6` border
- **Ink** `#1B1F1D`; muted `#5B6470`; error `#B5473A`

### 10.2 Type
Display **Bricolage Grotesque** 500 and 600, only for page titles, request names, and the big numbers in the ledger and scorecard. Body **IBM Plex Sans** 15px, line height 1.5. Data **IBM Plex Mono** 13px for ids, phones, timestamps, and counts in tables. Labels IBM Plex Sans 12px uppercase, letter spacing 0.04em, muted. Scale 40 / 28 / 22 / 17 / 15 / 13 / 12. Self host with `next/font/google`.

### 10.3 Layout
8px grid. Content max width 1,280px. Left rail 232px; bottom bar with five items on phone. Cards radius 10px, 1px border, no drop shadows. Tables: sticky header, no zebra, 44px rows, mono right aligned numbers; on phones they become stacked cards showing three fields with a disclosure for the rest. Motion: stage cells fill in 200ms, nothing animates on page load, `prefers-reduced-motion` disables transitions.

### 10.4 Signature elements
**Scorecard.** Every run draws as a strip of eight cells (Discover, Dedupe, Qualify, Map, Find, Gate, Reveal, Deliver). Each cell shows a mono count and a one word state. Completed cells fill Fairway. The Reveal cell is the only one that uses Brass, with credits spent written beneath. It is both the progress bar and the summary.

**Ledger.** One horizontal bar for the plan year: used (Navy), reserved (Brass hatch), available (Stone), with a thin brass tick at the reserve line and the reset date at the right end. Display type above, plain label below: "Export credits, plan year ending Jun 15, 2027".

Everything else stays quiet. No illustrations, no golf clip art, no gradients, no icon soup.

### 10.5 Quality floor
WCAG AA contrast, visible keyboard focus (2px Navy outline, 2px offset), full keyboard operation, responsive to 360px, skeleton loaders on tables.

### 10.6 Brand
Header product name "Lead Engine". Footer "Del Priore Hospitality". Email sender "Del Priore Lead Engine". No other names anywhere.

---

## 11. Architecture

Monorepo, TypeScript strict, pnpm workspaces.

```
dph-lead-engine/
  apps/web           Next.js 15 App Router, Tailwind 4, shadcn/ui, TanStack Table, Auth.js
  apps/worker        Node 22 process running pg-boss jobs
  packages/pipeline  stage implementations, adapters, normalizers
  packages/db        Prisma schema, migrations, seed
  packages/config    Zod validated env and settings
  docker/            Dockerfiles, compose.dev.yml, compose.prod.yml, Caddyfile
```

Postgres 16. Queue and cron: pg-boss, no Redis. Live updates by polling the request detail every 5 seconds; no websockets in v1.

Adapters, one interface each, every one with a token bucket limiter, jittered retries, `Retry-After` handling, a `dryRun` mode, and `api_calls` logging: `RocketReachClient`, `OverpassClient`, `SerperClient`, `PlacesClient`, `ClaudeClient`, `SheetsClient`, `Mailer`.

Claude via `@anthropic-ai/sdk`, used only when `AI_MODE=on`: classifier on `claude-haiku-4-5-20251001`, adjudicator on `claude-haiku-4-5-20251001` as well (Sonnet is not needed for this task). Force JSON with a tool schema, validate with Zod, retry once on invalid JSON, cap output tokens, and send classification in batches through the Message Batches API when more than 200 venues are queued (half price). With `AI_MODE=off` the `ClaudeClient` is never constructed and the rules engine in Sections 6.3 and 6.5 runs instead. Both modes write the same fields, so switching is a single environment variable.

Libraries: `fuzzball` (token set ratio), `tldts`, `libphonenumber-js`, `jsdom` plus `@mozilla/readability`, `googleapis`, `pino` (JSON to stdout, request ids, never secrets or full contact payloads). Email goes through Brevo's HTTPS API (`POST https://api.brevo.com/v3/smtp/email`, header `api-key`), not SMTP.

---

## 12. Security

Secrets only in server env; Zod validates at boot and refuses to start when a required key is missing. During the cloud build the keys live in the cloud environment configuration, which anyone using that Claude account can read; the operator rotates the RocketReach and Anthropic keys before production if that account is ever shared more widely. Nothing secret reaches the browser or the repo; `.env*` gitignored with a complete `.env.example`. Auth allowlist, 7 day sessions, rate limited login, CSRF via Auth.js, security headers (CSP, HSTS, frame ancestors none). RocketReach: API only, paced below published limits, no web automation, no shared logins. Directory sites: titles and snippets only. Places: off by default; only place ids stored permanently. Nightly `pg_dump` to `/backups`, 14 days retained.

The sheet includes one note row under the header: "Cells are for manual dialing. No autodialer, ringless voicemail, or SMS without consent."

---

## 13. Testing

Vitest for normalizers, dedupe keys, fuzzy thresholds, tier rules, credit cap math, ledger reconciliation, and sheet row mapping. Adapter tests with `msw` fixtures covering RocketReach search and lookup shapes, 429 with `Retry-After`, and status polling through waiting, searching, complete, and failed. One live integration test against the free account endpoint only. A seeded demo dataset (50 fake venues, 10 fake groups, 200 fake candidates) so the whole UI and pipeline run with no external calls. Playwright smoke test: sign in, create a request, run it in demo mode, watch the scorecard complete, open Results.

Coverage target: 80 percent on `packages/pipeline`.

---

## 14. Deployment

**Cloud session (where this is built).** `service postgresql start`; create role and database; `pnpm install`; `pnpm db:migrate && pnpm db:seed`; `pnpm dev` and `pnpm worker` inside the VM for tests and the Playwright smoke test. Nobody outside the VM can open that server; that is expected.

**Local (operator's machine, optional).** `pnpm install`; `docker compose -f docker/compose.dev.yml up -d db`; `pnpm db:migrate && pnpm db:seed`; `pnpm dev` (web on 3000) and `pnpm worker`.

**Production (Hostinger VPS, Ubuntu 24.04, Docker).** `docker/compose.prod.yml` with services `caddy` (auto TLS), `web` (Next.js standalone), `worker`, `db` (named volume), `backup` (cron `pg_dump`). Domain `leads.delpriorehospitality.com`. Deploy with `git pull && docker compose -f docker/compose.prod.yml up -d --build`; migrations run on web start. Env at `/opt/dph-lead-engine/.env`, mode 600. `/api/health` returns db, queue, and integration status. Schedules in America/New_York.

Produce `docs/DEPLOY.md` with the exact copy paste command sequence for a fresh VPS, including the DNS record to create, the firewall ports to open, how to write `/opt/dph-lead-engine/.env` from `.env.example`, and how to run the first request with `REVEAL_MODE=off` as a staging check before enabling reveals. Do not attempt to deploy from the cloud session; the operator runs it on the VPS.

---

## 15. Defaults and title lists

```
reserve_credits 200
max_credits_per_request 100
max_credits_per_day 300
auto_reveal_min_confidence 0.80
max_contacts_per_venue 2
max_contacts_per_group 4
search_quota_headroom 0.90
fuzzy_venue_name_threshold 92
fuzzy_employer_threshold 90
venue_location_radius_miles 25
adjudication_max_distance_miles 50
discovery_refresh_days 90
state_order [FL, TX, CA, NJ, NY, IL, OH, MI, PA, GA, NC, SC, AZ, then the rest alphabetical]
timezone America/New_York
```

```
group:
  [Owner, Founder, Co Founder, Managing Partner, Chairman]
  [CEO, Chief Executive Officer, President]
  [COO, Chief Operating Officer, VP Operations, EVP, Regional Vice President]
  [CMO, VP Marketing, Director of Marketing, VP Sales and Marketing, Director of Sales and Marketing]
  [Director of Private Events, Director of Catering, Director of Events]
private_owner:
  [Owner, Managing Partner, Proprietor]
  [General Manager, GM, GM/COO]
  [Director of Catering, Director of Private Events, Director of Sales, Catering Sales Manager]
  [Membership Director]
member_owned:
  [General Manager, COO, GM/COO, Chief Operating Officer]
  [Director of Catering, Director of Private Events, Director of Events]
  [Director of Marketing, Membership Director, Director of Membership and Marketing]
  [Board President, President]
municipal:
  [Director of Golf, Golf Operations Manager, Head Golf Professional]
exclude_everywhere:
  [Assistant, Intern, Server, Bartender, Cook, Groundskeeper, Caddie, Former, Retired]
```

Seed groups (verify portfolios on each group's own site before use): Invited (formerly ClubCorp), Troon, Arcis Golf, KemperSports, Heritage Golf Group, Concert Golf Partners, Landscapes Golf Management, Bobby Jones Links, McConnell Golf, Century Golf Partners, Escalante Golf, Hampton Golf, Touchstone Golf, GreatLIFE Golf, Brown Golf Management, Toll Golf, Dominion Golf Group. Seed Concert Golf Partners and Heritage Golf Group as `status = in_play`. Also seed the 50 states in the default order and the US Census county list.

---

## 16. Build order

Build M0 to M6 continuously. Commit at the end of each with a message like `M3: qualify, groups, find, gate 2`. Print a one paragraph progress note between milestones, then keep going.

**M0 Scaffold.** Monorepo, Prisma schema and migrations, seed (users, settings, states, counties, groups, demo dataset), Auth.js with both providers, app shell and nav, design tokens and fonts, empty states on every page, `/api/health`, `docker/compose.dev.yml`, `CLAUDE.md`, `.env.example`, `PROGRESS.md`, `DECISIONS.md`, and `.claude/settings.json` with a SessionStart hook that runs `pnpm install` and starts PostgreSQL when `CLAUDE_CODE_REMOTE=true`. Done when sign in works, every page renders its empty state, and `pnpm test` passes.

**M1 Integrations.** All seven adapters with limiters, retries, dryRun, and `api_calls` logging. Settings page live with a working RocketReach test (real, free), Sheets test write, Brevo account check, and an Anthropic ping that runs only when `AI_MODE=on` and otherwise shows "Rules mode, no key needed". Done when Settings shows the real plan, credit balances, and rate limits, and a test row appears in the sheet then is removed.

**M2 Requests, discover, gate 1.** Request form and list, run creation, worker jobs for Overpass, RocketReach company search, Serper, and group pages, merge and normalize, suppression import with column mapper, gate 1. Done when a Florida request discovers venues, the scorecard shows counts, and a suppression import marks matches.

**M3 Qualify, map, find, gate 2.** Fetcher, classifier, tiering, group mapping and ranking, person search with quota pacing, adjudication, gate 2, review queue UI. Done when a Florida Tier 1 request produces ready candidates with confidence plus an "Already have" list, with zero credits spent.

**M4 Reveal and deliver.** Reveal with caps, reserve check, status polling, ledger, and reconciliation; post reveal check; sheet append; email. Done when a demo run with `REVEAL_MODE=off` reports "would spend n credits", writes fixture contacts, appends to the sheet, and sends the email.

**M5 Polish.** Mobile layouts, keyboard focus, error and empty states everywhere, activity log, schedules, Playwright smoke test green, accessibility pass.

**M6 Ship ready.** `docker/compose.prod.yml`, Caddyfile, backup container, `docs/DEPLOY.md`, `docs/RUNBOOK.md` (how to switch REVEAL_MODE on, how to run the first capped request, how to reconcile credits, what to do on 401, 429, or a sheet failure), `HANDOFF.md`. Done when `docker compose -f docker/compose.prod.yml config` validates and a production build succeeds locally.

---

## 17. Claude prompts (used only when `AI_MODE=on`)

### 17.1 Venue classifier (Haiku, temperature 0, JSON only)

System: You classify golf and country club websites for event business. Input: club name, city, state, and extracted text from up to six pages with their URLs. Return only JSON matching the schema. `nonmember_events` is "yes" only if the site states that nonmembers or the public may host events (for example "membership not required", "open to the public for events"); "no" only if the site states members only; otherwise "unclear". `hosts_weddings` and `hosts_corporate` are "yes" only when the site describes hosting them. Never guess a group name; use only names printed on the site. `evidence_phrase` must be copied from the page, under 15 words. Capacity only if a number is printed. `site_contact` only if a named person with an events or catering title is printed.

```
{
  hosts_weddings: "yes" | "no" | "unclear",
  hosts_corporate: "yes" | "no" | "unclear",
  nonmember_events: "yes" | "no" | "unclear",
  evidence_url: string | null,
  evidence_phrase: string | null,
  ownership_type: "group" | "private_owner" | "member_owned" | "municipal" | "unclear",
  group_name: string | null,
  capacity: number | null,
  site_contact: { name, title, email, phone } | null,
  confidence: number
}
```

### 17.2 Decision maker adjudicator (Sonnet, temperature 0, JSON only)

System: You choose the best sales contact for a marketing agency selling wedding and event marketing to country clubs. Input: target name, type (venue or group), city, state, ownership type, the ordered title hierarchy for that ownership type (earlier is better), and up to 25 search results with name, current title, current employer, location, LinkedIn URL, and profile id. Return only `{ primary: profile_id | null, alternate: profile_id | null, confidence: number, reason: string }`. Reject any result whose employer does not clearly match the target; a group employer counts for a venue in that group. For venue level roles reject locations more than 50 miles away. Prefer earlier hierarchy tiers, then seniority within a tier. Never choose a title in the exclude list. If nothing qualifies, return nulls with confidence 0. Reason under 30 words.

---

## 18. HANDOFF.md (write this last)

Include: what was built per milestone, what was assumed (mirroring `DECISIONS.md`), how to run locally in three commands, how to deploy (point to `docs/DEPLOY.md`), how to turn on real reveals safely (set `REVEAL_MODE=ask`, run one request with `credit_cap=5`, reconcile the ledger against RocketReach, then raise the cap), known gaps, and the test and coverage summary.

---

## 19. CLAUDE.md (create at the repo root during M0)

```
# Project rules
- This is Del Priore Hospitality's Lead Engine. Never mention any other company in code, comments, UI, emails, or commits.
- Spec of record: DPH_Lead_Engine_Build_Spec.md. Build M0 to M6 continuously. Only pause for the hard stops in Section 2.
- REVEAL_MODE stays "off" for the entire build. Never call RocketReach person lookup, bulk lookup, company lookup, or profile-company lookup. Account, person search, company search, and status polling are free and allowed.
- No em dashes or en dashes anywhere, including UI copy, comments, and docs. No hyphenated compound adjectives in prose.
- Secrets come from env only. Never print, log, or commit them.
- TypeScript strict. Zod at every boundary. Tests for every normalizer and dedupe key.
- Record every judgement call in DECISIONS.md and keep building. Do not ask for approval on naming, libraries, file layout, or design details.
```

---

## 20. Sources

RocketReach knowledge base (lookup vs export credits, unlimited lookup plans, credit types, annual vs monthly billing, getting started with the API, bulk lookups) and API docs (rate limits, people search, people lookup, lookup status, MCP tools). Anthropic docs for Claude Code authentication, Team plan seats, Claude Code on the web, and cloud environments (code.claude.com/docs/en/cloud-environments: pre installed PostgreSQL 16 and Docker, network access levels, environment variables visible to anyone using the environment, no secrets store). RocketReach pricing figures come from third party roundups dated June and August 2026 and must be confirmed on rocketreach.co/pricing before quoting them to anyone. Account data: `usage_report.csv` and the Usage and API Usage screens dated August 26, 2026 (1,137 web lookups since January 1, zero API calls, zero exports used, 3,600 person and 3,600 company exports remaining, reset June 15, 2027).
