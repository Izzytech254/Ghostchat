/**
 * wsClient.ts – WebSocket relay client
 * ──────────────────────────────────────
 * Manages connection to the Whispro relay server.
 * Implements exponential back-off reconnection.
 */

import type { WsOutboundPacket, WsInboundPacket } from "@/types";

type InboundHandler = (packet: WsInboundPacket) => void;

// Use Vite proxy: wss://same-origin/ws for HTTPS, ws://same-origin/ws for HTTP
function getRelayUrl(): string {
  const envUrl = import.meta.env.VITE_RELAY_URL;
  if (envUrl) return envUrl;
  // Auto-detect protocol based on page protocol
  const proto = location.protocol === "https:" ? "wss:" : "ws:";
  return `${proto}//${location.host}/ws`;
}

class WsClient {
  private ws: WebSocket | null = null;
  private userId: string | null = null;
  private deviceId: string | null = null;
  private handlers: Set<InboundHandler> = new Set();
  private retryDelay = 1_000;
  private maxDelay = 30_000;
  private _shouldConnect = false;
  private _pendingQueue: string[] = [];

  connect(userId: string, deviceId: string): void {
    this.userId = userId;
    this.deviceId = deviceId;
    this._shouldConnect = true;
    this._open();
  }

  disconnect(): void {
    this._shouldConnect = false;
    this.ws?.close();
    this.ws = null;
  }

  send(packet: WsOutboundPacket): void {
    const serialized = JSON.stringify(packet);

    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(serialized);
    } else {
      // Buffer while reconnecting
      this._pendingQueue.push(serialized);
    }
  }

  onMessage(handler: InboundHandler): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  get isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  // ── Private ──────────────────────────────────────────────────────────────

  private _open(): void {
    if (!this._shouldConnect) return;

    const url = getRelayUrl();
    console.log("[WsClient] Connecting to:", url);
    this.ws = new WebSocket(url);

    this.ws.onopen = () => {
      this.retryDelay = 1_000;
      console.log("[WsClient] Connected!");

      // Register
      if (this.userId && this.deviceId) {
        console.log("[WsClient] Registering as userId:", this.userId);
        this.ws!.send(
          JSON.stringify({
            type: "REGISTER",
            userId: this.userId,
            deviceId: this.deviceId,
          }),
        );
      }

      // Flush buffered outbound messages
      while (this._pendingQueue.length) {
        this.ws!.send(this._pendingQueue.shift()!);
      }
    };

    this.ws.onmessage = ({ data }) => {
      try {
        const packet = JSON.parse(data as string) as WsInboundPacket;
        console.log("[WsClient] Received:", packet.type, packet);
        this.handlers.forEach((h) => h(packet));
      } catch {
        console.warn("[WsClient] Unparseable message received");
      }
    };

    this.ws.onclose = () => {
      console.log("[WsClient] Disconnected, reconnecting...");
      if (!this._shouldConnect) return;

      setTimeout(() => {
        this.retryDelay = Math.min(this.retryDelay * 2, this.maxDelay);
        this._open();
      }, this.retryDelay);
    };

    this.ws.onerror = (e) => {
      console.error("[WsClient] Error", e);
    };
  }
}

export const wsClient = new WsClient();
