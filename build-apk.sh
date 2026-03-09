#!/usr/bin/env bash
# Whispro – build APK and install / serve it
set -e

export JAVA_HOME=/usr/lib/jvm/java-21-openjdk-amd64
export ANDROID_HOME=$HOME/Android/Sdk
export ANDROID_SDK_ROOT=$HOME/Android/Sdk
# Add platform-tools AFTER existing PATH so the system adb (apt package) takes
# priority over the empty SDK placeholder at $ANDROID_HOME/platform-tools/adb
export PATH="$PATH:$ANDROID_HOME/platform-tools"

ROOT="$(cd "$(dirname "$0")" && pwd)"
WEB="$ROOT/web-client"
APK="$WEB/android/app/build/outputs/apk/debug/app-debug.apk"
APK_PORT=8081
LIVE_PORT=8082   # Live-update server – app always loads UI from here

# Prefer the wlan0 / WiFi IP so the QR URL is reachable from phones on the same network
LAN_IP=$(ip -4 addr show wlan0 2>/dev/null | awk '/inet /{print $2}' | cut -d/ -f1)
# Fall back to first non-loopback IP if wlan0 not found
if [[ -z "$LAN_IP" ]]; then
  LAN_IP=$(ip -4 addr show | awk '/inet /{print $2}' | grep -v '^127\.' | head -1 | cut -d/ -f1)
fi

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

# ── 4. ADB install (USB) ─────────────────────────────────────────────────────
ADB_DEVICE=$(adb devices 2>/dev/null | awk 'NR>1 && /device$/{print $1; exit}')
if [[ -n "$ADB_DEVICE" ]]; then
  echo ""
  echo "▸ Android device detected via USB ($ADB_DEVICE) – installing directly…"
  adb -s "$ADB_DEVICE" install -r "$APK" && echo "✔ Installed on device via ADB" || echo "⚠ ADB install failed – falling through to QR/HTTP method"
else
  echo ""
  echo "ℹ No USB device found – skipping ADB install (connect phone with USB debugging to use this)"
fi

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

APK_URL="http://${LAN_IP}:${APK_PORT}/app-debug.apk"

# Kill any previous APK server on that port
fuser -k ${APK_PORT}/tcp 2>/dev/null || true

# Start APK HTTP server in background
cd "$(dirname "$APK")"
python3 -m http.server $APK_PORT &>/tmp/whispro-apk-server.log &
APK_SERVER_PID=$!
echo "▸ APK server running  PID=$APK_SERVER_PID  →  $APK_URL"
echo ""
echo "  ⚠  Phone must be on the same WiFi as this machine (${LAN_IP})"
echo "     If the QR scan times out, use USB + ADB instead:"
echo "     adb install -r $APK"
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
