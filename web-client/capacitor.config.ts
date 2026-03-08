import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.whispro.app",
  appName: "Whispro",
  webDir: "dist",
  // No server.url = app loads from bundled assets via capacitor://localhost
  // capacitor://localhost IS a secure context → crypto.subtle works without USB
  android: {
    allowMixedContent: true, // allow capacitor://localhost → http:// LAN requests
  },
};

export default config;
