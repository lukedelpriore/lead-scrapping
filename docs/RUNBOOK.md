# Runbook

Operator guide for running the Lead Engine in production. Read `docs/DEPLOY.md` first.

## Turn on real reveals safely

Reveals spend RocketReach person export credits. There are 3,600 for the plan year, resetting June 15, 2027. Do this in order.

1. Confirm the ledger and balances on the Dashboard and Settings match RocketReach. Run the RocketReach test on Settings; it should show the plan and the remaining exports.
2. Set `REVEAL_MODE=ask` in `/opt/dph-lead-engine/.env`, then `docker compose -f docker/compose.prod.yml up -d web worker`.
3. Create one small request with `credit_cap=5` and reveal mode ask. Run it. Everything goes to the Review tab; nothing is spent yet.
4. In Review, approve a handful of contacts and reveal them. Watch the Reveal cell on the scorecard and the credit ledger bar move.
5. Reconcile: after the batch, the ledger and RocketReach should agree. If the portal flags drift, stop and investigate before running more.
6. Once a capped run reconciles cleanly, raise the cap and, if you want hands off runs, switch `REVEAL_MODE=auto`. Auto reveals only candidates at or above 0.80 confidence, up to the cap, and sends the rest to review.

Keep the daily cap (`max_credits_per_day`, default 300) and the reserve (`reserve_credits`, default 200) in place so a mistake cannot drain the pool.

## Reconcile credits

- Every completed lookup that returns a verified email or phone writes a ledger charge of -1.
- After each batch the app calls the account endpoint and writes a reconcile row.
- If the local ledger and RocketReach disagree, the run is flagged with a warning and the drift shows in the portal. Investigate before spending more. Common causes: a lookup that returned data after a timeout requeue, or a manual export done outside the app.

## What to do on common errors

### RocketReach 401 or 403
The key is wrong or revoked. Settings shows a red banner. Update `ROCKETREACH_API_KEY` in the env file and restart web and worker:

```
nano /opt/dph-lead-engine/.env
docker compose -f docker/compose.prod.yml up -d web worker
```

Then run the RocketReach test on Settings again.

### RocketReach 429 (rate limited)
The app already paces below the published limits and honors the Retry-After header, so this is rare and self healing. If it persists, discovery and search slow down and the run reports "waiting for quota" in plain words. No action needed; it resumes automatically. The daily search quota, not credits, is usually the limit.

### Google Sheet write failure
The run sits in `done_pending_sheet` and retries every 10 minutes. Leads are already in Postgres, so nothing is lost. Check that the sheet is shared with the service account as Editor and that the Sheets API is enabled. The sheet id is on Settings with the service account email to share.

### Email not sending
If `BREVO_API_KEY` is unset or invalid, delivery is disabled and every run reports it. Set the key and restart web and worker. Run the Brevo test on Settings.

## Backups

A nightly `pg_dump` runs at 02:30 to `./backups`, kept 14 days. To restore:

```
gunzip -c backups/dph_lead_engine_<stamp>.sql.gz | docker compose -f docker/compose.prod.yml exec -T db psql "$DATABASE_URL"
```

## Health and logs

```
curl -s https://leads.delpriorehospitality.com/api/health
docker compose -f docker/compose.prod.yml logs -f web worker
```

## Suppression

Import Luke's existing leads on the Suppression page (CSV, columns auto detected) before running real requests, so his current contacts are never re delivered and never cost a credit. Mark a management group in play to suppress its whole portfolio.

## Never

- Never export "My Contacts" from RocketReach; it would cost one credit per record. Existing leads enter only through the suppression import.
- Never automate the RocketReach website or share logins. The API is the only path.
- Never turn on Places or company lookup without a reason; both can cost money and are off by default.
