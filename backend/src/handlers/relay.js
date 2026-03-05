"use strict";

/**
 * RelayHandler – forwards encrypted packets between peers.
 *
 * The server is intentionally DUMB:
 *  - It never decrypts any payload.
 *  - It only inspects the packet envelope (type + routing fields).
 *  - Encrypted content is treated as an opaque blob.
 */
class RelayHandler {
  /**
   * @param {import('./session').SessionManager} sessions
   * @param {import('./queue').QueueManager}     queue
   * @param {import('pino').Logger}              log
   */
  constructor(sessions, queue, log) {
    this.sessions = sessions;
    this.queue = queue;
    this.log = log;
  }

  /**
   * Dispatch an incoming packet from `ws`.
   * @param {import('ws')} ws
   * @param {object} packet
   */
  handle(ws, packet) {
    switch (packet.type) {
      case "REGISTER":
        return this._onRegister(ws, packet);
      case "MESSAGE":
        return this._onMessage(ws, packet);
      case "READ_RECEIPT":
        return this._onReceipt(ws, packet);
      case "KEY_ACK":
        return this._onKeyAck(ws, packet);
      case "WIPE":
        return this._onWipe(ws, packet);
      case "SCREENSHOT_ACK":
        return this._onScreenshotAck(ws, packet);
      case "DELETE_MESSAGE":
        return this._onDeleteMessage(ws, packet);
      case "PING":
        return ws.send(JSON.stringify({ type: "PONG", ts: Date.now() }));
      default:
        ws.send(JSON.stringify({ type: "ERROR", code: "UNKNOWN_TYPE" }));
    }
  }

  // ── Handlers ──────────────────────────────────────────────────────────────

  _onRegister(ws, { userId, deviceId }) {
    this.sessions.register(userId, deviceId, ws);
    this.log.info({ userId, deviceId }, "User registered");

    // Deliver any queued (offline) messages
    const queued = this.queue.drain(userId);
    if (queued.length > 0) {
      this.log.info(
        { userId, count: queued.length },
        "Delivering queued messages",
      );
      queued.forEach((msg) => this._deliver(ws, msg));
    }

    ws.send(JSON.stringify({ type: "REGISTERED", queued: queued.length }));
  }

  _onMessage(ws, packet) {
    // Sender must have registered first
    const senderId = this._resolveAnonymousId(ws);
    this.log.info({ senderId, to: packet.to }, "MESSAGE received");

    if (senderId === "unknown") {
      ws.send(JSON.stringify({ type: "ERROR", code: "NOT_REGISTERED" }));
      return;
    }

    const { to, id, content, expiresAt, deletionType, senderHint } = packet;

    // Build opaque forwarded envelope – server never reads `content`
    const envelope = {
      type: "MESSAGE",
      id,
      from: senderId,
      content, // Encrypted blob – opaque to server
      expiresAt,
      deletionType,
      senderHint, // Optional ephemeral identifier hint
      deliveredAt: Date.now(),
    };

    const recipientWs = this.sessions.getSocket(to);
    this.log.info(
      { to, hasRecipient: !!recipientWs, activeUsers: this.sessions.count() },
      "Looking up recipient",
    );

    if (recipientWs) {
      this._deliver(recipientWs, envelope);
      this.log.info({ id, to }, "Message delivered (online)");

      // ACK back to sender
      ws.send(JSON.stringify({ type: "DELIVERED", id, to }));
    } else {
      // Recipient offline – queue temporarily
      this.queue.push(to, envelope);
      this.log.info({ id, to }, "Message queued (recipient offline)");

      ws.send(JSON.stringify({ type: "QUEUED", id, to }));
    }
  }

  _onReceipt(ws, packet) {
    const { to, messageId, event } = packet; // event: 'read' | 'expired' | 'deleted'
    const recipientWs = this.sessions.getSocket(to);

    if (recipientWs) {
      recipientWs.send(
        JSON.stringify({
          type: "READ_RECEIPT",
          messageId,
          event,
          ts: Date.now(),
        }),
      );
    }
  }

  _onKeyAck(ws, packet) {
    // Forward key acknowledgement to the peer
    const { to, keyId } = packet;
    const recipientWs = this.sessions.getSocket(to);
    if (recipientWs) {
      recipientWs.send(JSON.stringify({ type: "KEY_ACK", keyId }));
    }
  }

  _onWipe(ws, packet) {
    // Forward a remote-wipe command to the target device
    const { targetDevice, encryptedCommand } = packet;
    const targetWs = this.sessions.getSocketByDevice(targetDevice);

    if (targetWs) {
      targetWs.send(
        JSON.stringify({
          type: "WIPE",
          encryptedCommand, // Signed & encrypted by owner – server can't forge it
        }),
      );
      this.log.warn({ targetDevice }, "Remote wipe command forwarded");
    }
  }

  _onScreenshotAck(ws, packet) {
    const { to, messageId } = packet;
    const recipientWs = this.sessions.getSocket(to);
    if (recipientWs) {
      recipientWs.send(
        JSON.stringify({
          type: "SCREENSHOT_ALERT",
          messageId,
          ts: Date.now(),
        }),
      );
    }
  }

  _onDeleteMessage(ws, packet) {
    const { to, messageId } = packet;
    const recipientWs = this.sessions.getSocket(to);
    if (recipientWs) {
      recipientWs.send(
        JSON.stringify({
          type: "DELETE_MESSAGE",
          messageId,
          from: this._resolveAnonymousId(ws),
          ts: Date.now(),
        }),
      );
    }
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  _deliver(ws, envelope) {
    if (ws.readyState === 1 /* OPEN */) {
      ws.send(JSON.stringify(envelope));
    }
  }

  /** Return the anonymous user id registered to this socket (never a real identity). */
  _resolveAnonymousId(ws) {
    return this.sessions.getUserId(ws) || "unknown";
  }
}

module.exports = { RelayHandler };
