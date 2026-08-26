# Deploy

Production runs on a Hostinger VPS (Ubuntu 24.04) with Docker. The cloud build session never deploys; you run this on the VPS. Domain: `leads.delpriorehospitality.com`.

## 1. DNS

Create one A record pointing the host at the VPS public IP:

```
Type: A
Name: leads
Value: <VPS public IP>
TTL: 3600
```

Wait for it to resolve before starting Caddy, so the TLS certificate can be issued.

## 2. Firewall ports

Open 80 and 443 (and 22 for SSH). On Ubuntu with ufw:

```
sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
```

Postgres (5432) stays closed to the internet. It is only reached inside the Docker network.

## 3. Get the code

```
sudo mkdir -p /opt/dph-lead-engine
sudo chown "$USER" /opt/dph-lead-engine
git clone <repo url> /opt/dph-lead-engine
cd /opt/dph-lead-engine
```

## 4. Write the environment file

Copy the example and fill in real values. Keep it at mode 600 so only the owner can read it.

```
cp .env.example /opt/dph-lead-engine/.env
chmod 600 /opt/dph-lead-engine/.env
nano /opt/dph-lead-engine/.env
```

Set at least these. Keep `REVEAL_MODE=off` for the first run.

```
DATABASE_URL=postgresql://dph:<strong password>@db:5432/dph_lead_engine
POSTGRES_USER=dph
POSTGRES_PASSWORD=<strong password, same as in DATABASE_URL>
POSTGRES_DB=dph_lead_engine
AUTH_SECRET=<openssl rand -base64 32>
AUTH_URL=https://leads.delpriorehospitality.com
ALLOWED_EMAILS=luke@delpriorehospitality.com,hashir@delpriorehospitality.com
ROCKETREACH_API_KEY=<key>
AI_MODE=off
SERPER_API_KEY=<key>
GOOGLE_SERVICE_ACCOUNT_B64=<base64 of the service account JSON on one line>
SHEET_ID=<sheet id>
BREVO_API_KEY=<key>
MAIL_FROM="Del Priore Lead Engine <leads@delpriorehospitality.com>"
REVEAL_MODE=off
PLACES_ENABLED=false
LOG_LEVEL=info
TZ=America/New_York
LEADS_DOMAIN=leads.delpriorehospitality.com
ENV_FILE=/opt/dph-lead-engine/.env
```

Note: inside Docker the database host is `db`, not `localhost`.

Two Google prerequisites that are easy to miss:

1. Share the spreadsheet at `SHEET_ID` as Editor with the service account email (the `client_email` inside the service account JSON).
2. Enable the Google Sheets API on the service account's Google Cloud project.

## 5. Bring the stack up

```
cd /opt/dph-lead-engine
docker compose -f docker/compose.prod.yml up -d --build
```

This builds the web and worker images, starts Postgres, runs migrations (the `migrate` service), then starts web, worker, Caddy, and the nightly backup. Caddy requests a TLS certificate on first start.

Check health once it is up:

```
curl -s https://leads.delpriorehospitality.com/api/health
docker compose -f docker/compose.prod.yml ps
docker compose -f docker/compose.prod.yml logs -f web worker
```

## 6. Seed the first users (once)

```
docker compose -f docker/compose.prod.yml run --rm migrate pnpm --filter @dph/db seed
```

The seed prints a one time password when `SEED_PASSWORD` is not set. Sign in at the domain, then configure Google OAuth later if you want it.

## 7. Staging check with reveal off

With `REVEAL_MODE=off`, run one request from the portal. It discovers, qualifies, finds, and dedupes for free, then reports "would spend n credits" and writes fixture contacts so you can see the whole flow and the sheet format without spending a credit. Confirm on the Settings page that RocketReach, the sheet write, and Brevo all test green.

When you are satisfied, follow `docs/RUNBOOK.md` to turn reveals on safely.

## Updating

```
cd /opt/dph-lead-engine
git pull
docker compose -f docker/compose.prod.yml up -d --build
```

Migrations run automatically on the way up.
