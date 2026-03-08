#!/usr/bin/env bash
# Whispro – build APK and print install QR code
set -e

export JAVA_HOME=/usr/lib/jvm/java-21-openjdk-amd64
export ANDROID_HOME=$HOME/Android/Sdk
export ANDROID_SDK_ROOT=$HOME/Android/Sdk

ROOT="$(cd "$(dirname "$0")" && pwd)"
WEB="$ROOT/web-client"
APK="$WEB/android/app/build/outputs/apk/debug/app-debug.apk"
APK_PORT=8081
LIVE_PORT=8082   # Live-update server – app always loads UI from here
LAN_IP=$(hostname -I | awk '{print $1}')

# ── 1. Build web client ───────────────────────────────────────────────────────
echo ""
echo "▸ Building web client…"
cd "$WEB"
npm run build

# ── 2. Sync to Android ───────────────────────────────────────────────────────
echo ""
echo "▸ Syncing Capacitor…"
npx cap sync android

# ── 3. Build APK ─────────────────────────────────────────────────────────────
echo ""
echo "▸ Building APK…"
cd "$WEB/android"
./gradlew assembleDebug

# ── 5. Start live-update server (serves dist/ so phones get updates) ─────────
fuser -k ${LIVE_PORT}/tcp 2>/dev/null || true
cd "$WEB/dist"
python3 -m http.server $LIVE_PORT &>/tmp/whispro-live.log &
echo "▸ Live-update server running  →  http://${LAN_IP}:${LIVE_PORT}"
echo ""

# ── 6. Serve APK & print QR ──────────────────────────────────────────────────
echo ""
APK_SIZE=$(du -sh "$APK" | cut -f1)
echo "✔ APK built  ($APK_SIZE)  →  $APK"
echo ""

# Detect LAN IP (first non-loopback IPv4)
APK_URL="http://${LAN_IP}:${APK_PORT}/app-debug.apk"

# Kill any previous APK server on that port
fuser -k ${APK_PORT}/tcp 2>/dev/null || true

# Start APK HTTP server in background
cd "$(dirname "$APK")"
python3 -m http.server $APK_PORT &>/tmp/whispro-apk-server.log &
APK_SERVER_PID=$!
echo "▸ APK server running  PID=$APK_SERVER_PID  →  $APK_URL"
echo ""

# Print QR code
python3 - <<PYEOF
import qrcode
url = "$APK_URL"
qr = qrcode.QRCode(box_size=1, border=2)
qr.add_data(url)
qr.make(fit=True)
qr.print_ascii(invert=True)
print()
print("  Scan to install Whispro")
print("  URL:", url)
print()
PYEOF
