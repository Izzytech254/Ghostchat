#!/usr/bin/env node
/**
 * e2e/integration.js – Full-stack integration test
 * ─────────────────────────────────────────────────
 * Tests the relay server and key-server together against live running services.
 *
 * Prerequisites (run via Docker Compose or manually):
 *   docker compose up -d relay key-server redis
 *   node e2e/integration.js
 *
 * Or use the helper script:
 *   ./scripts/e2e.sh
 *
 * Exit code 0 = all tests passed.
 * Exit code 1 = one or more tests failed.
 */

"use strict";

const WebSocket = require("ws");
const http = require("http");

const RELAY_WS_URL = process.env.RELAY_WS_URL ?? "ws://localhost:8080";
const KEY_SERVER_URL = process.env.KEY_SERVER_URL ?? "http://localhost:8000";

let passed = 0;
let failed = 0;

// ─── Utilities ────────────────────────────────────────────────────────────────

function log(label, msg) {
  const ts = new Date().toISOString().slice(11, 23);
  console.log(`[${ts}] ${label}: ${msg}`);
}

async function test(name, fn) {
  try {
    await fn();
    console.log(`  ✓  ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ✗  ${name}`);
    console.error(`       ${err.message}`);
    failed++;
  }
}

function assert(condition, msg) {
  if (!condition) throw new Error(msg ?? "Assertion failed");
}

/** HTTP GET → parsed JSON */
function get(url) {
  return new Promise((resolve, reject) => {
    http
      .get(url, (res) => {
        let body = "";
        res.on("data", (c) => (body += c));
        res.on("end", () => {
          try {
            resolve({ status: res.statusCode, body: JSON.parse(body) });
          } catch {
            resolve({ status: res.statusCode, body });
          }
        });
      })
      .on("error", reject);
  });
}

/** HTTP POST with JSON body → parsed JSON */
function post(url, payload) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(payload);
    const options = {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(data),
      },
    };

    const req = http.request(url, options, (res) => {
      let body = "";
      res.on("data", (c) => (body += c));
      res.on("end", () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(body) });
        } catch {
          resolve({ status: res.statusCode, body });
        }
      });
    });
    req.on("error", reject);
    req.write(data);
    req.end();
  });
}

/** Connect a WS client with a next() helper */
function wsConnect(url) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    const inbox = [];
    const waiters = [];

    ws.on("message", (raw) => {
      const msg = JSON.parse(raw.toString());
      if (waiters.length) waiters.shift()(msg);
      else inbox.push(msg);
    });

    ws.next = (ms = 3000) =>
      new Promise((res, rej) => {
        if (inbox.length) return res(inbox.shift());
        const t = setTimeout(() => rej(new Error("ws.next() timeout")), ms);
        waiters.push((m) => {
          clearTimeout(t);
          res(m);
        });
      });

    ws.sendJSON = (obj) => ws.send(JSON.stringify(obj));
    ws.on("open", () => resolve(ws));
    ws.on("error", reject);
  });
}

/** Minimal base64url encoder (Node.js) */
function b64url(buf) {
  return Buffer.from(buf).toString("base64url");
}

// ─── Key server tests ─────────────────────────────────────────────────────────

async function keyServerSuite() {
  console.log("\n── Key Server ──────────────────────────────────────────────");

  await test("health endpoint returns ok", async () => {
    const { status, body } = await get(`${KEY_SERVER_URL}/health`);
    assert(status === 200, `Expected 200, got ${status}`);
    assert(
      body.status === "ok",
      `Expected status=ok, got ${JSON.stringify(body)}`,
    );
  });

  const userId = `e2e-user-${Date.now()}`;
  const bundle = {
    identity_key: b64url(crypto.getRandomValues(new Uint8Array(32))),
    signed_pre_key: b64url(crypto.getRandomValues(new Uint8Array(32))),
    spk_signature: b64url(crypto.getRandomValues(new Uint8Array(64))),
    one_time_pre_keys: [
      b64url(crypto.getRandomValues(new Uint8Array(32))),
      b64url(crypto.getRandomValues(new Uint8Array(32))),
    ],
  };

  await test("upload key bundle", async () => {
    const { status } = await post(`${KEY_SERVER_URL}/keys/${userId}`, bundle);
    assert(status === 200, `Expected 200, got ${status}`);
  });

  await test("fetch key bundle returns identity key", async () => {
    const { status, body } = await get(`${KEY_SERVER_URL}/keys/${userId}`);
    assert(status === 200, `Expected 200, got ${status}`);
    assert(body.identity_key === bundle.identity_key, "identity_key mismatch");
  });

  await test("fetching bundle consumes a one-time pre-key", async () => {
    const { body: first } = await get(`${KEY_SERVER_URL}/keys/${userId}`);
    const { body: second } = await get(`${KEY_SERVER_URL}/keys/${userId}`);
    // OTKs are consumed on fetch – second fetch may have a different or no OTK
    const firstOTK = first.one_time_pre_key;
    const secondOTK = second.one_time_pre_key;
    assert(firstOTK !== secondOTK, "OTK should be consumed after first fetch");
  });

  await test("unknown user returns 404", async () => {
    const { status } = await get(`${KEY_SERVER_URL}/keys/nobody-${Date.now()}`);
    assert(status === 404, `Expected 404, got ${status}`);
  });
}

// ─── Relay server tests ───────────────────────────────────────────────────────

async function relayServerSuite() {
  console.log("\n── Relay Server ────────────────────────────────────────────");

  await test("online message delivery (both users connected)", async () => {
    const alice = await wsConnect(RELAY_WS_URL);
    const bob = await wsConnect(RELAY_WS_URL);

    alice.sendJSON({ type: "REGISTER", userId: "e2e-alice", deviceId: "d1" });
    assert(
      (await alice.next()).type === "REGISTERED",
      "Alice: expected REGISTERED",
    );

    bob.sendJSON({ type: "REGISTER", userId: "e2e-bob", deviceId: "d1" });
    assert(
      (await bob.next()).type === "REGISTERED",
      "Bob: expected REGISTERED",
    );

    alice.sendJSON({
      type: "MESSAGE",
      to: "e2e-bob",
      id: "e2e-msg-1",
      content: "aGVsbG8",
      expiresAt: Date.now() + 60_000,
      deletionType: "timed",
    });

    const [delivered, ack] = await Promise.all([bob.next(), alice.next()]);
    assert(
      delivered.type === "MESSAGE",
      `Expected MESSAGE, got ${delivered.type}`,
    );
    assert(delivered.content === "aGVsbG8", "Content mismatch");
    assert(ack.type === "DELIVERED", `Expected DELIVERED ack, got ${ack.type}`);

    alice.close();
    bob.close();
  });

  await test("offline queue: message queued and drained on connect", async () => {
    const alice = await wsConnect(RELAY_WS_URL);
    alice.sendJSON({ type: "REGISTER", userId: "e2e-alice-q", deviceId: "d1" });
    await alice.next(); // REGISTERED

    alice.sendJSON({
      type: "MESSAGE",
      to: "e2e-bob-offline",
      id: "e2e-queued-1",
      content: "cXVldWVk",
      expiresAt: Date.now() + 60_000,
      deletionType: "timed",
    });

    const ack = await alice.next();
    assert(ack.type === "QUEUED", `Expected QUEUED, got ${ack.type}`);
    alice.close();

    const bob = await wsConnect(RELAY_WS_URL);
    bob.sendJSON({
      type: "REGISTER",
      userId: "e2e-bob-offline",
      deviceId: "d1",
    });
    await bob.next(); // REGISTERED

    const drained = await bob.next();
    assert(
      drained.type === "MESSAGE",
      `Expected drained MESSAGE, got ${drained.type}`,
    );
    assert(drained.id === "e2e-queued-1", "Message id mismatch");
    bob.close();
  });

  await test("PING → PONG keepalive", async () => {
    const ws = await wsConnect(RELAY_WS_URL);
    ws.sendJSON({ type: "PING" });
    const pong = await ws.next();
    assert(pong.type === "PONG", `Expected PONG, got ${pong.type}`);
    ws.close();
  });
}

// ─── Runner ───────────────────────────────────────────────────────────────────

(async () => {
  console.log("Whispro E2E Integration Tests");
  console.log(`  Relay:      ${RELAY_WS_URL}`);
  console.log(`  Key server: ${KEY_SERVER_URL}`);

  try {
    await keyServerSuite();
    await relayServerSuite();
  } catch (err) {
    console.error("\nFatal error during test run:", err.message);
    process.exit(1);
  }

  console.log(`\n──────────────────────────────────────────────────────────`);
  console.log(`  ${passed} passed, ${failed} failed`);
  console.log(`──────────────────────────────────────────────────────────\n`);

  process.exit(failed > 0 ? 1 : 0);
})();
