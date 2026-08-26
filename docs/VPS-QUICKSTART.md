# VPS quickstart

The short version of `docs/DEPLOY.md`, for getting the app live on a Hostinger VPS with as few steps as possible. Ignore the hPanel "import Git repo as a Node app" screen; that is a different product and cannot run this app.

There are two stages. Stage A gets it live so you can see it, no domain and no keys. Stage B puts it on your real domain with HTTPS.

## Before you start

- A Hostinger VPS running Ubuntu, and SSH access to it (hPanel shows the IP, username, and password, or you use an SSH key).
- The code on the VPS. Two ways:
  - Upload the backup archive (dph-lead-engine-repo.tar.gz) through Hostinger's file manager or scp, then `tar xzf dph-lead-engine-repo.tar.gz`.
  - Or, if the repo is reachable from the VPS, `git clone` it.

Log in over SSH and `cd` into the `lead-scrapping` folder before running anything below. Run as root, or put `sudo` in front of the commands.

## Stage A: get it live (no domain, no keys)

```
bash docker/vps-bootstrap.sh
```

This installs Docker if needed and starts the app in offline mode. When it finishes it prints a line like:

```
Open  http://<your VPS IP>:3000
Sign in:  luke@delpriorehospitality.com  /  leadengine
```

Open that address in your browser. You can sign in, create a request, and watch the pipeline run against the built in demo data. Nothing is charged. This is a private preview; do not treat the IP address as your public site.

To stop it: `docker compose -f docker/compose.local.yml down`

## Stage B: your real domain with HTTPS

1. Point a DNS A record at the VPS IP, for example `leads.delpriorehospitality.com`, and wait for it to resolve.
2. Open ports 80 and 443 on the VPS firewall (hPanel firewall, or `ufw allow 80,443/tcp`).
3. Run, with your domain:

```
DOMAIN=leads.delpriorehospitality.com bash docker/vps-bootstrap.sh
```

This writes a starter env file at `/opt/dph-lead-engine/.env` (with a random database password and auth secret, reveal off), builds the full stack, and starts it behind Caddy, which issues the HTTPS certificate automatically. Open `https://your-domain`.

The first-run login password is `change-me-after-first-login` from that env file. Change `SEED_PASSWORD` in the file and re run the seed, or set a new password once user management is added.

## Making it do real work

Stage B runs with reveal off and no provider keys, so it still uses fixtures. To find and reveal real contacts:

1. Edit `/opt/dph-lead-engine/.env` and fill in `ROCKETREACH_API_KEY`, `SERPER_API_KEY`, `GOOGLE_SERVICE_ACCOUNT_B64`, `SHEET_ID`, and `BREVO_API_KEY`.
2. Share the Google Sheet with the service account email as Editor and enable the Sheets API.
3. Restart: `DOMAIN=your-domain bash docker/vps-bootstrap.sh`
4. On the Settings page, run the RocketReach, sheet, and Brevo tests. They should go green.
5. Turn reveals on with the safe sequence in `docs/RUNBOOK.md`: `REVEAL_MODE=ask`, one request with a credit cap of 5, reconcile, then raise the cap.

## Updating later

Pull the new code (or upload a fresh archive) and re run the same bootstrap command. Migrations run automatically.
