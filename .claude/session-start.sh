#!/usr/bin/env bash
# SessionStart hook. In the cloud remote environment this starts PostgreSQL
# and installs dependencies so tests and the dev server can run.
set -euo pipefail

if [ "${CLAUDE_CODE_REMOTE:-}" = "true" ]; then
  echo "[session-start] remote environment detected"
  if command -v service >/dev/null 2>&1; then
    service postgresql start >/dev/null 2>&1 || true
    echo "[session-start] postgresql started"
  fi
  if command -v pnpm >/dev/null 2>&1 && [ -f package.json ]; then
    pnpm install --prefer-offline >/dev/null 2>&1 || pnpm install || true
    echo "[session-start] dependencies installed"
  fi
fi
