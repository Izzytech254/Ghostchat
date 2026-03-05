"use strict";

/**
 * SessionManager – manages live WebSocket connections.
 * Maps anonymous userId → { ws, deviceId } (in-memory only, never persisted).
 */
class SessionManager {
  constructor(log) {
    this.log = log;
    /** @type {Map<string, { ws: import('ws'), deviceId: string }>} */
    this._sessions = new Map();
    /** Reverse map: ws → userId */
    this._wsToUser = new WeakMap();
    /** deviceId → userId */
    this._deviceMap = new Map();
  }

  /**
   * Register a WebSocket for a given anonymous userId.
   * A user may connect from multiple devices – last connection wins per userId
   * (multi-device support can be added by keying on userId+deviceId).
   */
  register(userId, deviceId, ws) {
    // Remove previous socket if present
    const prev = this._sessions.get(userId);
    if (prev) {
      this._wsToUser.delete(prev.ws);
    }

    this._sessions.set(userId, { ws, deviceId });
    this._wsToUser.set(ws, userId);
    this._deviceMap.set(deviceId, userId);
  }

  /** Remove a socket (called on disconnect). */
  remove(ws) {
    const userId = this._wsToUser.get(ws);
    if (!userId) return;

    const session = this._sessions.get(userId);
    if (session && session.ws === ws) {
      this._deviceMap.delete(session.deviceId);
      this._sessions.delete(userId);
    }
    this._wsToUser.delete(ws);
  }

  /** Retrieve live socket for a userId (or undefined if offline). */
  getSocket(userId) {
    const session = this._sessions.get(userId);
    return session?.ws;
  }

  /** Retrieve live socket by deviceId. */
  getSocketByDevice(deviceId) {
    const userId = this._deviceMap.get(deviceId);
    return userId ? this.getSocket(userId) : undefined;
  }

  /** Get userId for a given socket. */
  getUserId(ws) {
    return this._wsToUser.get(ws);
  }

  /** Number of active connections. */
  count() {
    return this._sessions.size;
  }
}

module.exports = { SessionManager };
