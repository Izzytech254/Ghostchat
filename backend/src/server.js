"use strict";
require("dotenv").config();

const http = require("http");
const express = require("express");
const WebSocket = require("ws");
const helmet = require("helmet");
const pino = require("pino");

const { RelayHandler } = require("./handlers/relay");
const { SessionManager } = require("./handlers/session");
const { QueueManager } = require("./handlers/queue");
const { CleanupTask } = require("./utils/cleanup");
const { validatePacket } = require("./middleware/validate");
const { checkRateLimit } = require("./middleware/rateLimiter");

// ─── Logger ──────────────────────────────────────────────────────────────────
const log = pino({
  level: process.env.LOG_LEVEL || "info",
  transport:
    process.env.NODE_ENV !== "production"
      ? { target: "pino-pretty", options: { colorize: true } }
      : undefined,
});

// ─── HTTP server (health + metrics) ──────────────────────────────────────────
const app = express();
app.use(helmet());
app.use(express.json());

app.get("/health", (_req, res) => res.json({ status: "ok", ts: Date.now() }));

app.get("/metrics", (_req, res) => {
  res.json({
    connections: sessionManager.count(),
    queued_users: queueManager.queuedUserCount(),
    queued_messages: queueManager.totalQueuedMessages(),
  });
});

const httpServer = http.createServer(app);

// ─── WebSocket server ─────────────────────────────────────────────────────────
const wss = new WebSocket.Server({
  server: httpServer,
  maxPayload: parseInt(process.env.MAX_MESSAGE_SIZE_BYTES || "65536", 10),
});

// ─── Core managers ────────────────────────────────────────────────────────────
const sessionManager = new SessionManager(log);
const queueManager = new QueueManager(log);
const relayHandler = new RelayHandler(sessionManager, queueManager, log);

// ─── Connection lifecycle ─────────────────────────────────────────────────────
wss.on("connection", (ws, req) => {
  const remoteIp = req.headers["x-forwarded-for"] || req.socket.remoteAddress;
  log.info({ remoteIp }, "WS connection opened");

  ws.isAlive = true;
  ws.on("pong", () => {
    ws.isAlive = true;
  });

  ws.on("message", (raw) => {
    let packet;

    try {
      packet = JSON.parse(raw.toString());
    } catch {
      ws.send(JSON.stringify({ type: "ERROR", code: "INVALID_JSON" }));
      return;
    }

    const err = validatePacket(packet);
    if (err) {
      ws.send(JSON.stringify({ type: "ERROR", code: err }));
      return;
    }

    const rateErr = checkRateLimit(packet, remoteIp);
    if (rateErr) {
      ws.send(JSON.stringify({ type: "ERROR", ...rateErr }));
      log.warn({ remoteIp, packetType: packet.type }, "Rate limit exceeded");
      return;
    }

    relayHandler.handle(ws, packet);
  });

  ws.on("close", () => {
    sessionManager.remove(ws);
    log.info({ remoteIp }, "WS connection closed");
  });

  ws.on("error", (e) => log.error({ err: e }, "WS error"));
});

// ─── Ping/keep-alive ──────────────────────────────────────────────────────────
const pingInterval = setInterval(() => {
  wss.clients.forEach((ws) => {
    if (!ws.isAlive) {
      sessionManager.remove(ws);
      return ws.terminate();
    }
    ws.isAlive = false;
    ws.ping();
  });
}, 30_000);

wss.on("close", () => clearInterval(pingInterval));

// ─── Cleanup task (expire queued messages) ────────────────────────────────────
const cleanup = new CleanupTask(queueManager, log, {
  intervalMs: parseInt(process.env.CLEANUP_INTERVAL_MS || "3600000", 10),
  maxQueueDays: parseInt(process.env.MAX_QUEUE_DAYS || "30", 10),
});
cleanup.start();

// ─── Start ────────────────────────────────────────────────────────────────────
const PORT = parseInt(process.env.PORT || "8080", 10);
const HTTP_PORT = parseInt(process.env.HTTP_PORT || "3001", 10);

httpServer.listen(HTTP_PORT, () =>
  log.info({ port: HTTP_PORT }, "HTTP health/metrics server listening"),
);

// WSS shares same http server, but we also open a standalone WS-only port
const wsOnly = new WebSocket.Server({ port: PORT });
wsOnly.on("connection", (ws, req) => wss.emit("connection", ws, req));

log.info({ port: PORT }, "Whispro relay WebSocket server running");
log.info("Server is DUMB – routes encrypted packets only, never reads content");
