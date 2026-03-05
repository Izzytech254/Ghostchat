import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "path";
import fs from "fs";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { "@": resolve(__dirname, "src") },
  },
  test: {
    environment: "jsdom",
    globals: true,
  },
  server: {
    port: 5173,
    https: fs.existsSync(resolve(__dirname, "certs/key.pem"))
      ? {
          key: fs.readFileSync(resolve(__dirname, "certs/key.pem")),
          cert: fs.readFileSync(resolve(__dirname, "certs/cert.pem")),
        }
      : undefined,
    proxy: {
      "/keys": {
        target: "http://localhost:8000",
        changeOrigin: true,
      },
      "/ws": {
        target: "ws://localhost:8080",
        ws: true,
        changeOrigin: true,
      },
    },
  },
});
