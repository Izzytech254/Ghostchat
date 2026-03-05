"use strict";

const { validatePacket } = require("../src/middleware/validate");
const { SessionManager } = require("../src/handlers/session");
const { QueueManager } = require("../src/handlers/queue");
const { RelayHandler } = require("../src/handlers/relay");

// ── Mock logger ───────────────────────────────────────────────────────────────
const log = {
  info: jest.fn(),
  debug: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
};

// ── Mock WebSocket ─────────────────────────────────────────────────────────────
function mockWs() {
  const msgs = [];
  return {
    readyState: 1,
    isAlive: true,
    sent: msgs,
    send(data) {
      msgs.push(JSON.parse(data));
    },
    ping: jest.fn(),
    terminate: jest.fn(),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
describe("validatePacket", () => {
  test("rejects non-object", () =>
    expect(validatePacket(null)).toBe("INVALID_PACKET"));
  test("rejects missing type", () =>
    expect(validatePacket({})).toBe("MISSING_TYPE"));
  test("rejects unknown type", () =>
    expect(validatePacket({ type: "HACK" })).toBe("UNKNOWN_TYPE"));
  test("rejects missing field", () =>
    expect(validatePacket({ type: "MESSAGE", to: "bob" })).toMatch(
      /^MISSING_FIELD_/,
    ));
  test("accepts valid REGISTER", () =>
    expect(
      validatePacket({ type: "REGISTER", userId: "u1", deviceId: "d1" }),
    ).toBeNull());
  test("accepts valid MESSAGE", () =>
    expect(
      validatePacket({
        type: "MESSAGE",
        to: "bob",
        id: "msg1",
        content: "ENCRYPTED_BLOB",
        expiresAt: 9999999,
        deletionType: "timed",
      }),
    ).toBeNull());
});

// ─────────────────────────────────────────────────────────────────────────────
describe("SessionManager", () => {
  let mgr;
  beforeEach(() => {
    mgr = new SessionManager(log);
  });

  test("register and retrieve socket", () => {
    const ws = mockWs();
    mgr.register("alice", "d-alice", ws);
    expect(mgr.getSocket("alice")).toBe(ws);
    expect(mgr.count()).toBe(1);
  });

  test("remove on disconnect", () => {
    const ws = mockWs();
    mgr.register("alice", "d-alice", ws);
    mgr.remove(ws);
    expect(mgr.getSocket("alice")).toBeUndefined();
    expect(mgr.count()).toBe(0);
  });

  test("getUserId reverse lookup", () => {
    const ws = mockWs();
    mgr.register("bob", "d-bob", ws);
    expect(mgr.getUserId(ws)).toBe("bob");
  });

  test("getSocketByDevice", () => {
    const ws = mockWs();
    mgr.register("carol", "d-carol", ws);
    expect(mgr.getSocketByDevice("d-carol")).toBe(ws);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("QueueManager", () => {
  let mgr;
  beforeEach(() => {
    mgr = new QueueManager(log);
  });

  test("push and drain", () => {
    mgr.push("alice", { content: "blob1" });
    mgr.push("alice", { content: "blob2" });
    const drained = mgr.drain("alice");
    expect(drained).toHaveLength(2);
    expect(mgr.drain("alice")).toHaveLength(0);
  });

  test("evicts old messages", () => {
    jest.useFakeTimers();
    mgr.push("bob", { content: "old" });
    jest.advanceTimersByTime(31 * 24 * 60 * 60 * 1000); // 31 days
    mgr.evictExpired(30 * 24 * 60 * 60 * 1000);
    expect(mgr.drain("bob")).toHaveLength(0);
    jest.useRealTimers();
  });

  test("keeps fresh messages", () => {
    mgr.push("charlie", { content: "new" });
    mgr.evictExpired(30 * 24 * 60 * 60 * 1000);
    expect(mgr.drain("charlie")).toHaveLength(1);
  });

  test("queuedUserCount and totalQueuedMessages", () => {
    mgr.push("u1", { content: "a" });
    mgr.push("u1", { content: "b" });
    mgr.push("u2", { content: "c" });
    expect(mgr.queuedUserCount()).toBe(2);
    expect(mgr.totalQueuedMessages()).toBe(3);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("RelayHandler", () => {
  let sessions, queue, relay, aliceWs, bobWs;

  beforeEach(() => {
    sessions = new SessionManager(log);
    queue = new QueueManager(log);
    relay = new RelayHandler(sessions, queue, log);
    aliceWs = mockWs();
    bobWs = mockWs();
  });

  test("REGISTER delivers queued messages", () => {
    queue.push("alice", { type: "MESSAGE", id: "q1", content: "enc-blob" });

    relay.handle(aliceWs, {
      type: "REGISTER",
      userId: "alice",
      deviceId: "d-alice",
    });

    expect(aliceWs.sent.some((m) => m.id === "q1")).toBe(true);
    expect(aliceWs.sent.some((m) => m.type === "REGISTERED")).toBe(true);
  });

  test("MESSAGE delivered to online recipient", () => {
    relay.handle(aliceWs, {
      type: "REGISTER",
      userId: "alice",
      deviceId: "d-alice",
    });
    relay.handle(bobWs, { type: "REGISTER", userId: "bob", deviceId: "d-bob" });

    relay.handle(aliceWs, {
      type: "MESSAGE",
      to: "bob",
      id: "msg1",
      content: "ENCRYPTED",
      expiresAt: 9999999,
      deletionType: "timed",
    });

    expect(
      bobWs.sent.some((m) => m.type === "MESSAGE" && m.id === "msg1"),
    ).toBe(true);
    expect(
      aliceWs.sent.some((m) => m.type === "DELIVERED" && m.id === "msg1"),
    ).toBe(true);
  });

  test("MESSAGE queued when recipient offline", () => {
    relay.handle(aliceWs, {
      type: "REGISTER",
      userId: "alice",
      deviceId: "d-alice",
    });

    relay.handle(aliceWs, {
      type: "MESSAGE",
      to: "offline-bob",
      id: "msg2",
      content: "ENCRYPTED",
      expiresAt: 9999999,
      deletionType: "timed",
    });

    expect(
      aliceWs.sent.some((m) => m.type === "QUEUED" && m.id === "msg2"),
    ).toBe(true);
    expect(queue.totalQueuedMessages()).toBe(1);
  });

  test("READ_RECEIPT forwarded", () => {
    relay.handle(aliceWs, {
      type: "REGISTER",
      userId: "alice",
      deviceId: "d-alice",
    });
    relay.handle(bobWs, { type: "REGISTER", userId: "bob", deviceId: "d-bob" });

    relay.handle(bobWs, {
      type: "READ_RECEIPT",
      to: "alice",
      messageId: "msg1",
      event: "read",
    });

    expect(
      aliceWs.sent.some(
        (m) => m.type === "READ_RECEIPT" && m.messageId === "msg1",
      ),
    ).toBe(true);
  });

  test("SCREENSHOT_ACK forwarded", () => {
    relay.handle(aliceWs, {
      type: "REGISTER",
      userId: "alice",
      deviceId: "d-alice",
    });
    relay.handle(bobWs, { type: "REGISTER", userId: "bob", deviceId: "d-bob" });

    relay.handle(bobWs, {
      type: "SCREENSHOT_ACK",
      to: "alice",
      messageId: "msg1",
    });

    expect(aliceWs.sent.some((m) => m.type === "SCREENSHOT_ALERT")).toBe(true);
  });

  test("Unknown type returns error", () => {
    relay.handle(aliceWs, {
      type: "REGISTER",
      userId: "alice",
      deviceId: "d-alice",
    });
    relay.handle(aliceWs, { type: "UNKNOWN_PACKET" });
    expect(
      aliceWs.sent.some((m) => m.type === "ERROR" && m.code === "UNKNOWN_TYPE"),
    ).toBe(true);
  });
});
