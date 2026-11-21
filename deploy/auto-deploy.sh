#!/usr/bin/env bash
# Zero-downtime atomic release deployer for CutSheet Studio (withkeya.com/cutsheet).
# Safely promotes new origin/main commits into /opt/cutsheet-studio/current without
# touching /var/lib/cutsheet-studio (guest SQLite data) or /etc/cutsheet-studio/env.
set -euo pipefail

BASE_DIR="${CUTSHEET_BASE_DIR:-/opt/cutsheet-studio}"
REPO_DIR="${CUTSHEET_REPO_DIR:-$BASE_DIR/repo}"
RELEASES_DIR="${CUTSHEET_RELEASES_DIR:-$BASE_DIR/releases}"
CURRENT_LINK="${CUTSHEET_CURRENT_LINK:-$BASE_DIR/current}"
REPO_URL="${CUTSHEET_REPO_URL:-https://github.com/Stans97/cutsheet-studio.git}"
BRANCH="${CUTSHEET_BRANCH:-main}"
UNIT_NAME="${CUTSHEET_UNIT:-cutsheet-studio.service}"
HEALTH_URL="${CUTSHEET_HEALTH_URL:-http://127.0.0.1:${PORT:-3780}/api/health}"
LOCK_FILE="${CUTSHEET_DEPLOY_LOCK:-/run/lock/cutsheet-studio-deploy.lock}"
KEEP_RELEASES="${CUTSHEET_KEEP_RELEASES:-5}"

mkdir -p "$(dirname "$LOCK_FILE")" "$RELEASES_DIR"
exec 9>"$LOCK_FILE"
if ! flock -n 9; then
  exit 0
fi

if [ ! -d "$REPO_DIR/.git" ]; then
  rm -rf "$REPO_DIR"
  git clone --quiet --branch "$BRANCH" "$REPO_URL" "$REPO_DIR"
else
  git -C "$REPO_DIR" fetch --quiet origin "$BRANCH"
fi

REMOTE_SHA="$(git -C "$REPO_DIR" rev-parse "origin/$BRANCH")"
LIVE_SHA=""
if [ -f "$CURRENT_LINK/.deployed-sha" ]; then
  LIVE_SHA="$(tr -d '[:space:]' < "$CURRENT_LINK/.deployed-sha")"
fi

if [ "$REMOTE_SHA" = "$LIVE_SHA" ] && [ -L "$CURRENT_LINK" ]; then
  exit 0
fi

echo "[cutsheet-deploy] Preparing release $REMOTE_SHA (previous: ${LIVE_SHA:-none})..."

STAGE_DIR="$RELEASES_DIR/$REMOTE_SHA"
rm -rf "$STAGE_DIR.tmp"
mkdir -p "$STAGE_DIR.tmp"
git -C "$REPO_DIR" archive "$REMOTE_SHA" | tar -x -C "$STAGE_DIR.tmp"
printf '%s\n' "$REMOTE_SHA" > "$STAGE_DIR.tmp/.deployed-sha"

echo "[cutsheet-deploy] Running pre-deploy validation checks..."
(
  cd "$STAGE_DIR.tmp"
  node --test tests/*.test.js >/dev/null
  node --check public/js/api.js >/dev/null
  node --check public/js/renderers.js >/dev/null
  node --check public/js/app.js >/dev/null
)

rm -rf "$STAGE_DIR"
mv "$STAGE_DIR.tmp" "$STAGE_DIR"

PREV_TARGET=""
if [ -L "$CURRENT_LINK" ]; then
  PREV_TARGET="$(readlink -f "$CURRENT_LINK" || true)"
elif [ -d "$CURRENT_LINK" ]; then
  BACKUP_DIR="$RELEASES_DIR/legacy-$(date +%Y%m%d-%H%M%S)"
  mv "$CURRENT_LINK" "$BACKUP_DIR"
  PREV_TARGET="$BACKUP_DIR"
fi

switch_current() {
  ln -sfn "$1" "$CURRENT_LINK.next"
  mv -Tf "$CURRENT_LINK.next" "$CURRENT_LINK"
}

check_health() {
  for _ in {1..30}; do
    if node -e "
      fetch(process.argv[1]).then(r => r.json()).then(j => process.exit(j && j.ok ? 0 : 1)).catch(() => process.exit(1));
    " "$HEALTH_URL"; then
      return 0
    fi
    sleep 0.5
  done
  return 1
}

switch_current "$STAGE_DIR"
systemctl restart "$UNIT_NAME"

if ! check_health; then
  echo "[cutsheet-deploy] ERROR: Health check failed for $REMOTE_SHA; rolling back!" >&2
  if [ -n "$PREV_TARGET" ] && [ -d "$PREV_TARGET" ]; then
    switch_current "$PREV_TARGET"
    systemctl restart "$UNIT_NAME" || true
  fi
  exit 1
fi

{ ls -1dt "$RELEASES_DIR"/* 2>/dev/null || true; } | tail -n +"$((KEEP_RELEASES + 1))" | while read -r old_dir; do
  if [ "$old_dir" != "$STAGE_DIR" ] && [ "$old_dir" != "$PREV_TARGET" ]; then
    rm -rf "$old_dir"
  fi
done || true

echo "[cutsheet-deploy] Successfully deployed $REMOTE_SHA"
