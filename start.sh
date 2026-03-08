#!/usr/bin/env bash
# Whispro – start all backend services
set -e

ROOT="$(cd "$(dirname "$0")" && pwd)"
LAN_IP=$(hostname -I | awk '{print $1}')

echo ""
echo "  💬 Whispro — starting services"
echo ""

# ── Redis ─────────────────────────────────────────────────────────────────────
if ! redis-cli ping &>/dev/null; then
  echo "▸ Starting Redis…"
  sudo systemctl start redis-server
  sleep 1
fi
echo "✔ Redis           localhost:6379"

# ── Key server ────────────────────────────────────────────────────────────────
if ! lsof -i:8000 -sTCP:LISTEN &>/dev/null; then
  echo "▸ Starting key server…"
  cd "$ROOT/key-server"
  source .venv/bin/activate
  uvicorn app.main:app --host 0.0.0.0 --port 8000 >>/tmp/whispro-keyserver.log 2>&1 &
  sleep 1
fi
echo "✔ Key server      http://${LAN_IP}:8000"

# ── Relay (WebSocket) ─────────────────────────────────────────────
if ! lsof -i:8080 -sTCP:LISTEN &>/dev/null; then
  echo "▸ Starting relay…"
  node "$ROOT/backend/src/server.js" >>/tmp/whispro-relay.log 2>&1 &
  sleep 1
fi
echo "✔ Relay           ws://${LAN_IP}:8080"

# ── Live-update server (serves dist/) ─────────────────────────────
if ! lsof -i:8082 -sTCP:LISTEN &>/dev/null; then
  echo "▸ Starting live-update server…"
  cd "$ROOT/web-client/dist"
  python3 -m http.server 8082 >>/tmp/whispro-live.log 2>&1 &
  sleep 1
fi
echo "✔ Live updates    http://localhost:8082 (via adb reverse)"

# ── ADB reverse (localhost = secure context → crypto.subtle works) ────────────
echo ""
if adb devices 2>/dev/null | grep -q "device$"; then
  adb reverse tcp:8082 tcp:8082 2>/dev/null
  adb reverse tcp:8000 tcp:8000 2>/dev/null
  adb reverse tcp:8080 tcp:8080 2>/dev/null
  echo "✔ ADB tunnels     localhost:{8082,8000,8080} → this machine"
  echo "  Phone sees all services as localhost (secure context)"
else
  echo "⚠  No USB device found – plug in phone and re-run for adb reverse"
  echo "  Without this, crypto.subtle will be unavailable on the phone."
fi

echo ""
echo "  All services running. Logs: /tmp/whispro-*.log"
echo ""
