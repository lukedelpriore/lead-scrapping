# RocketReach API notes

Section 5 asks for the real request and response shapes, fetched from `https://docs.rocketreach.co/llms.txt` and the pages it indexes, before implementing the client. In the build environment that host was blocked by the network policy (403 to CONNECT), so this file records the Section 5.3 summary the client was coded against and marks it as pending live validation. A session with network must fetch the live docs and reconcile any difference here and in `DECISIONS.md` before real reveals run.

Status: PENDING live validation. The client uses passthrough Zod schemas so unexpected fields do not break parsing.

Base: `https://api.rocketreach.co/api/v2/`. Header: `Api-Key: <key>`.

## Endpoints used

| Purpose | Call | Credits | Used by |
|---|---|---|---|
| Account, plan, balances, limits | GET `account` | none | Settings test, reveal preflight, status |
| Person search | POST `person/search` with `{ start, page_size (max 100), query, order_by }` | none | Find stage |
| Person lookup | GET `person/lookup` with one of `id`, `linkedin_url`, `email`, or `name` plus `current_employer` | 1 export on success | Reveal stage, only when REVEAL_MODE is not off |
| Lookup status | GET `person/checkStatus` | none | Reveal polling |
| Company search | POST `company/search` | none | Discovery |
| Company lookup | GET `company/lookup` | 1 export | Off by default |

## Search query syntax

- Exact match: wrap the value in escaped double quotes, for example `"current_employer": ["\"Heritage Golf Group\""]`.
- Exclude: prefix with `-`, for example `"-Assistant"`.
- Location radius: append `::~25mi`, for example `"Boca Raton, FL"::~25mi`.
- `order_by: "popularity"` puts executives first.

## Statuses

`person/checkStatus` returns one of: complete, failed, waiting, searching, progress. Poll no faster than every 3 seconds; typical resolution about 5 seconds.

## Credits, from the account on 2026-08-26

- Person export credits: 3,600 per plan year, resetting 2027-06-15.
- Company export credits: a separate 3,600 pool.
- Lookup credits: unlimited on this plan; fair use is no more than 10,000 contacts in any 30 day period.
- Free: person search, company search, account, status polling.
- Failed lookups are not charged. Re exporting the same profile is not charged again.

## Rate limits (published Pro fallback, read live from the account at boot and hourly)

| Action | per minute | per hour | per day | per month |
|---|---|---|---|---|
| Person search (free) | 30 | 250 | 750 | 15,000 |
| Person lookup (credits) | 50 | 300 | 1,500 | 20,000 |
| Company search (free) | 30 | 250 | 750 | 15,000 |
| Bulk jobs | 10 | 25 | 100 | n/a |

Global: 10 requests per second. On HTTP 429 the response carries a Retry-After header in seconds; the client sleeps exactly that long and retries. The client stays under 0.90 of every limit.

## Response shapes assumed (validate against live docs)

- `account`: `{ name, plan: { name }, person_exports_remaining, company_exports_remaining, rate_limits }`.
- `person/search`: `{ profiles: [{ id, name, current_title, current_employer, linkedin_url, location }], pagination: { start, next, total } }`.
- `person/checkStatus`: `{ id, status }` (or an array of these).
- `person/lookup`: `{ id, name, current_title, current_employer, linkedin_url, emails: [{ email, type, grade, smtp_valid }], phones: [{ number, type, is_valid }] }`.
- `company/search`: `{ companies: [{ id, name, domain, location }] }`.
