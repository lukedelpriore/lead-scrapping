#!/usr/bin/env bash
# One command VPS deploy for the Lead Engine. Run this from inside the repo
# directory on a fresh Ubuntu VPS, as root (or with sudo).
#
#   Quick look, no domain yet (offline mode, port 3000):
#     bash docker/vps-bootstrap.sh
#
#   Production with a domain and automatic HTTPS (point DNS at this VPS first):
#     DOMAIN=leads.delpriorehospitality.com bash docker/vps-bootstrap.sh
#
# In offline mode nothing is charged and no API keys are needed; the whole free
# pipeline runs against fixtures. Add the real keys later in the env file and
# re run with a DOMAIN for production.
set -euo pipefail

cd "$(dirname "$0")/.."

# 1. Install Docker if it is not already there.
if ! command -v docker >/dev/null 2>&1; then
  echo "[bootstrap] installing Docker..."
  curl -fsSL https://get.docker.com | sh
fi

DOMAIN="${DOMAIN:-}"

if [ -z "$DOMAIN" ]; then
  echo "[bootstrap] no DOMAIN set: starting offline mode on port 3000"
  docker compose -f docker/compose.local.yml up -d --build
  IP="$(hostname -I 2>/dev/null | awk '{print $1}')"
  [ -z "$IP" ] && IP="YOUR_VPS_IP"
  echo ""
  echo "[bootstrap] Done. Open  http://$IP:3000"
  echo "[bootstrap] Sign in:    luke@delpriorehospitality.com  /  leadengine"
  echo "[bootstrap] This is a quick look. For a real domain with HTTPS, re run with DOMAIN set."
  exit 0
fi

# 2. Production with a domain. Write a starter env file if none exists.
ENVFILE=/opt/dph-lead-engine/.env
mkdir -p /opt/dph-lead-engine
if [ ! -f "$ENVFILE" ]; then
  echo "[bootstrap] writing a starter env at $ENVFILE (reveal off, add keys later)"
  DBPW="$(openssl rand -hex 16)"
  SECRET="$(openssl rand -base64 32)"
  cat > "$ENVFILE" <<EOF
DATABASE_URL=postgresql://dph:${DBPW}@db:5432/dph_lead_engine
POSTGRES_USER=dph
POSTGRES_PASSWORD=${DBPW}
POSTGRES_DB=dph_lead_engine
AUTH_SECRET=${SECRET}
AUTH_URL=https://${DOMAIN}
ALLOWED_EMAILS=luke@delpriorehospitality.com,hashir@delpriorehospitality.com
SEED_PASSWORD=change-me-after-first-login
MAIL_FROM="Del Priore Lead Engine <leads@${DOMAIN}>"
AI_MODE=off
REVEAL_MODE=off
PLACES_ENABLED=false
LOG_LEVEL=info
TZ=America/New_York
LEADS_DOMAIN=${DOMAIN}
ROCKETREACH_API_KEY=
SERPER_API_KEY=
GOOGLE_SERVICE_ACCOUNT_B64=
SHEET_ID=
BREVO_API_KEY=
EOF
  chmod 600 "$ENVFILE"
  echo "[bootstrap] edit $ENVFILE to add your real keys when ready. Keep REVEAL_MODE=off for the first run."
fi

# Export the values compose.prod.yml interpolates.
set -a
# shellcheck disable=SC1090
. "$ENVFILE"
set +a
export ENV_FILE="$ENVFILE"

echo "[bootstrap] building and starting the production stack..."
docker compose -f docker/compose.prod.yml up -d --build

# Seed the first users once (the prod migrate service only runs migrations).
echo "[bootstrap] seeding the first users..."
docker compose -f docker/compose.prod.yml run --rm migrate pnpm --filter @dph/db seed || true

echo ""
echo "[bootstrap] Done. Once DNS for $DOMAIN points at this VPS, open  https://$DOMAIN"
echo "[bootstrap] Caddy issues the TLS certificate automatically on first visit."
echo "[bootstrap] Sign in with the SEED_PASSWORD in $ENVFILE, then change it."
