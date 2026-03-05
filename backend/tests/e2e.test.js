"use strict";

/**
 * e2e.test.js – End-to-end relay integration tests
 * ──────────────────────────────────────────────────
 * Spins up a real in-process WebSocket server wired to the same handlers used
 * in production, then connects actual ws clients and exercises the full flow:
 *
 *   REGISTER → online delivery → queue-and-drain (offline delivery)
 *   → PING/PONG keepalive → DELETE_MESSAGE fanout
 *
 * No external services required – queue is in-memory and sessions are
 * local to the test process.
 */

const http = require("http");
const express = require("express");
const WebSocket = require("ws");
const pino = require("pino");

const { RelayHandler } = require("../src/handlers/relay");
const { SessionManager } = require("../src/handlers/session");
const { QueueManager } = require("../src/handlers/queue");
const { validatePacket } = require("../src/middleware/validate");

// ── Helpers ───────────────────────────────────────────────────────────────────

const log = pino({ level: "silent" });

function buildServer() {
  const app = express();
  const httpServer = http.createServer(app);
  const wss = new WebSocket.Server({ server: httpServer });
  const sessionManager = new SessionManager(log);
  const queueManager = new QueueManager(log);
  const relayHandler = new RelayHandler(sessionManager, queueManager, log);

  wss.on("connection", (ws) => {
    ws.isAlive = true;
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
      relayHandler.handle(ws, packet);
    });
    ws.on("close", () => sessionManager.remove(ws));
  });

  return { httpServer, wss, sessionManager, queueManager };
}

/** Start server on a random available port. */
function startServer() {
  return new Promise((resolve) => {
    const { httpServer, wss, sessionManager, queueManager } = buildServer();
    httpServer.listen(0, "127.0.0.1", () => {
      const { port } = httpServer.address();
      resolve({ httpServer, wss, sessionManager, queueManager, port });
    });
  });
}

function stopServer({ httpServer, wss }) {
  return new Promise((resolve) => {
    wss.close(() => {
      httpServer.closeAllConnections?.();
      httpServer.close(resolve);
    });
  });
}

/** Connect a WebSocket client and return it with a promise-based `next()` helper. */
function connect(port) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}`);
    const inbox = [];
    const waiters = [];

    ws.on("message", (raw) => {
      const msg = JSON.parse(raw.toString());
      if (waiters.length) {
        waiters.shift()(msg);
      } else {
        inbox.push(msg);
      }
    });

    /** Wait for the next inbound message. */
    ws.next = (timeoutMs = 2000) =>
      new Promise((res, rej) => {
        if (inbox.length) return res(inbox.shift());
        const timer = setTimeout(
          () => rej(new Error("next() timed out")),
          timeoutMs,
        );
        waiters.push((msg) => {
          clearTimeout(timer);
          res(msg);
        });
      });

    ws.send = ws.send.bind(ws);
    ws.sendJSON = (obj) => ws.send(JSON.stringify(obj));

    ws.on("open", () => resolve(ws));
    ws.on("error", reject);
  });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

jest.setTimeout(15_000);

let srv;

beforeAll(async () => {
  srv = await startServer();
});

afterAll(() => stopServer(srv));

// ── REGISTER ──────────────────────────────────────────────────────────────────

describe("REGISTER", () => {
  test("server acknowledges registration", async () => {
    const alice = await connect(srv.port);

    alice.sendJSON({ type: "REGISTER", userId: "alice-1", deviceId: "d1" });
    const ack = await alice.next();

    expect(ack.type).toBe("REGISTERED");
    expect(typeof ack.queued).toBe("number");
    alice.close();
  });

  test("duplicate REGISTER on same socket updates session", async () => {
    const ws = await connect(srv.port);
    ws.sendJSON({ type: "REGISTER", userId: "dup-user", deviceId: "d1" });
    await ws.next(); // REGISTERED

    ws.sendJSON({ type: "REGISTER", userId: "dup-user-2", deviceId: "d1" });
    const second = await ws.next();
    expect(second.type).toBe("REGISTERED");
    ws.close();
  });
});

// ── Online delivery ───────────────────────────────────────────────────────────

describe("Online message delivery", () => {
  test("message delivered immediately when recipient online", async () => {
    const alice = await connect(srv.port);
    const bob = await connect(srv.port);

    alice.sendJSON({ type: "REGISTER", userId: "alice-2", deviceId: "d1" });
    await alice.next();
    bob.sendJSON({ type: "REGISTER", userId: "bob-2", deviceId: "d1" });
    await bob.next();

    const id = "msg-001";
    alice.sendJSON({
      type: "MESSAGE",
      to: "bob-2",
      id,
      content: "c2lnbmFsLWVuY3J5cHRlZA", // opaque blob
      expiresAt: Date.now() + 60_000,
      deletionType: "timed",
    });

    const delivered = await bob.next();
    expect(delivered.type).toBe("MESSAGE");
    expect(delivered.id).toBe(id);
    expect(delivered.from).toBe("alice-2");
    expect(delivered.content).toBe("c2lnbmFsLWVuY3J5cHRlZA");

    alice.close();
    bob.close();
  });

  test("sender receives DELIVERED ack", async () => {
    const alice = await connect(srv.port);
    const bob = await connect(srv.port);

    alice.sendJSON({ type: "REGISTER", userId: "alice-3", deviceId: "d1" });
    await alice.next();
    bob.sendJSON({ type: "REGISTER", userId: "bob-3", deviceId: "d1" });
    await bob.next();

    alice.sendJSON({
      type: "MESSAGE",
      to: "bob-3",
      id: "msg-002",
      content: "enc-blob",
      expiresAt: Date.now() + 60_000,
      deletionType: "timed",
    });

    // Bob gets the message; Alice gets the ack
    const [delivered, ack] = await Promise.all([bob.next(), alice.next()]);
    expect(delivered.type).toBe("MESSAGE");
    expect(ack.type).toBe("DELIVERED");
    expect(ack.id).toBe("msg-002");

    alice.close();
    bob.close();
  });
});

// ── Offline queue + drain ─────────────────────────────────────────────────────

describe("Offline queue", () => {
  test("messages queued while recipient offline are drained on REGISTER", async () => {
    const alice = await connect(srv.port);
    alice.sendJSON({ type: "REGISTER", userId: "alice-4", deviceId: "d1" });
    await alice.next();

    // Bob is offline – send him a message
    alice.sendJSON({
      type: "MESSAGE",
      to: "bob-offline",
      id: "queued-001",
      content: "enc-offline",
      expiresAt: Date.now() + 60_000,
      deletionType: "timed",
    });

    // Alice should still get a QUEUED ack
    const ackQ = await alice.next();
    expect(ackQ.type).toBe("QUEUED");
    expect(ackQ.id).toBe("queued-001");
    alice.close();

    // Now Bob comes online
    const bob = await connect(srv.port);
    bob.sendJSON({ type: "REGISTER", userId: "bob-offline", deviceId: "d1" });

    // Queued messages are delivered BEFORE the REGISTERED ack
    const drained = await bob.next();
    expect(drained.type).toBe("MESSAGE");
    expect(drained.id).toBe("queued-001");

    const registerAck = await bob.next();
    expect(registerAck.type).toBe("REGISTERED");
    expect(registerAck.queued).toBe(1);
    bob.close();
  });

  test("expired queued messages are not delivered", async () => {
    const alice = await connect(srv.port);
    alice.sendJSON({ type: "REGISTER", userId: "alice-5", deviceId: "d1" });
    await alice.next();

    alice.sendJSON({
      type: "MESSAGE",
      to: "ghost-user",
      id: "queued-expire",
      content: "enc-expire",
      expiresAt: Date.now() + 60_000,
      deletionType: "timed",
    });
    await alice.next(); // QUEUED ack
    alice.close();

    // Evict everything
    srv.queueManager.evictExpired(0);

    const ghost = await connect(srv.port);
    ghost.sendJSON({ type: "REGISTER", userId: "ghost-user", deviceId: "d1" });

    // No queued messages → only REGISTERED, no MESSAGE follows
    const reg = await ghost.next();
    expect(reg.type).toBe("REGISTERED");
    expect(reg.queued).toBe(0);

    // No stray messages expected
    const stray = await ghost.next(300).catch(() => null);
    expect(stray).toBeNull();
    ghost.close();
  });
});

// ── PING ─────────────────────────────────────────────────────────────────────

describe("PING", () => {
  test("server responds with PONG", async () => {
    const ws = await connect(srv.port);
    ws.sendJSON({ type: "PING" });
    const pong = await ws.next();
    expect(pong.type).toBe("PONG");
    ws.close();
  });
});

// ── DELETE_MESSAGE fanout ─────────────────────────────────────────────────────

describe("DELETE_MESSAGE", () => {
  test("delete request fanned out to recipient", async () => {
    const alice = await connect(srv.port);
    const bob = await connect(srv.port);

    alice.sendJSON({ type: "REGISTER", userId: "alice-6", deviceId: "d1" });
    await alice.next();
    bob.sendJSON({ type: "REGISTER", userId: "bob-6", deviceId: "d1" });
    await bob.next();

    // First send a message so there's something to delete
    alice.sendJSON({
      type: "MESSAGE",
      to: "bob-6",
      id: "del-msg-1",
      content: "enc",
      expiresAt: Date.now() + 60_000,
      deletionType: "timed",
    });
    await bob.next(); // MESSAGE
    await alice.next(); // DELIVERED

    // Now request deletion
    alice.sendJSON({
      type: "DELETE_MESSAGE",
      to: "bob-6",
      messageId: "del-msg-1",
    });

    const deleteFanout = await bob.next();
    expect(deleteFanout.type).toBe("DELETE_MESSAGE");
    expect(deleteFanout.messageId).toBe("del-msg-1");

    alice.close();
    bob.close();
  });
});

// ── Error handling ────────────────────────────────────────────────────────────

describe("Error handling", () => {
  test("invalid JSON returns ERROR packet", async () => {
    const ws = await connect(srv.port);
    ws.send("not-json{{");
    const err = await ws.next();
    expect(err.type).toBe("ERROR");
    expect(err.code).toBe("INVALID_JSON");
    ws.close();
  });

  test("unknown packet type returns ERROR", async () => {
    const ws = await connect(srv.port);
    ws.sendJSON({ type: "HACK_THE_PLANET" });
    const err = await ws.next();
    expect(err.type).toBe("ERROR");
    expect(err.code).toBe("UNKNOWN_TYPE");
    ws.close();
  });

  test("MESSAGE without registering returns UNREGISTERED error", async () => {
    const ws = await connect(srv.port);
    ws.sendJSON({
      type: "MESSAGE",
      to: "someone",
      id: "x",
      content: "y",
      expiresAt: Date.now() + 1000,
      deletionType: "timed",
    });
    const err = await ws.next();
    expect(err.type).toBe("ERROR");
    expect(err.code).toBe("NOT_REGISTERED");
    ws.close();
  });
});
