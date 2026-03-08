#!/usr/bin/env bash
# Whispro deploy – push a UI update to all installed phones instantly.
# No APK rebuild or reinstall needed. Just run this after any code change.
set -e

ROOT="$(cd "$(dirname "$0")" && pwd)"
WEB="$ROOT/web-client"
LIVE_PORT=8082

# ── 1. Build web client ───────────────────────────────────────────────────────
echo ""
echo "▸ Building web client…"
cd "$WEB"
npm run build
echo "✔ Build complete"

# ── 2. (Re)start live-update server ──────────────────────────────────────────
fuser -k ${LIVE_PORT}/tcp 2>/dev/null || true
cd "$WEB/dist"
python3 -m http.server $LIVE_PORT &>/tmp/whispro-live.log &
echo "✔ Live-update server restarted  →  PID=$!"

LAN_IP=$(hostname -I | awk '{print $1}')
echo ""
echo "  Update live at: http://${LAN_IP}:${LIVE_PORT}"
echo ""
echo "  ► All phones running Whispro will get the update"
echo "    the next time they open or refresh the app."
echo ""
