"use strict";
/**
 * In-memory rate limiter for WebSocket messages.
 *
 * Limits:
 *   REGISTER  – 5 per hour  per IP
 *   MESSAGE   – 60 per minute per userId
 *   default   – 200 per minute per userId
 *
 * Uses a simple sliding-window counter backed by a Map.
 * For multi-server deployments swap this for a Redis-backed limiter.
 */

class RateLimiter {
  /**
   * @param {number} maxRequests  - maximum allowed in window
   * @param {number} windowMs     - window size in milliseconds
   */
  constructor(maxRequests, windowMs) {
    this.maxRequests = maxRequests;
    this.windowMs = windowMs;
    /** @type {Map<string, {count: number, resetAt: number}>} */
    this.store = new Map();

    // Prune stale entries every 5 minutes to avoid memory leak
    setInterval(() => this._prune(), 5 * 60 * 1000).unref();
  }

  /**
   * Check whether `key` is within limit.
   * @param {string} key
   * @returns {{ allowed: boolean, remaining: number, resetAt: number }}
   */
  check(key) {
    const now = Date.now();
    let entry = this.store.get(key);

    if (!entry || now >= entry.resetAt) {
      entry = { count: 1, resetAt: now + this.windowMs };
      this.store.set(key, entry);
      return { allowed: true, remaining: this.maxRequests - 1, resetAt: entry.resetAt };
    }

    entry.count += 1;
    const allowed = entry.count <= this.maxRequests;
    return {
      allowed,
      remaining: Math.max(0, this.maxRequests - entry.count),
      resetAt: entry.resetAt,
    };
  }

  _prune() {
    const now = Date.now();
    for (const [key, entry] of this.store) {
      if (now >= entry.resetAt) this.store.delete(key);
    }
  }
}

// Singleton limiters
const registrationLimiter = new RateLimiter(5,  60 * 60 * 1000); // 5 / hour  per IP
const messageLimiter      = new RateLimiter(60, 60 * 1000);       // 60 / min  per user
const defaultLimiter      = new RateLimiter(200, 60 * 1000);      // 200 / min per user

/**
 * Check rate limits for an incoming WebSocket packet.
 * Returns an error object { code, retryAfter } or null if allowed.
 *
 * @param {object} packet  - validated WebSocket packet
 * @param {string} remoteIp
 * @returns {{ code: string, retryAfter: number } | null}
 */
function checkRateLimit(packet, remoteIp) {
  let result;

  switch (packet.type) {
    case "REGISTER": {
      const key = `reg:${remoteIp}`;
      result = registrationLimiter.check(key);
      break;
    }
    case "MESSAGE": {
      const key = `msg:${packet.userId || remoteIp}`;
      result = messageLimiter.check(key);
      break;
    }
    default: {
      const key = `def:${packet.userId || remoteIp}`;
      result = defaultLimiter.check(key);
      break;
    }
  }

  if (!result.allowed) {
    const retryAfter = Math.ceil((result.resetAt - Date.now()) / 1000);
    return { code: "RATE_LIMITED", retryAfter };
  }
  return null;
}

module.exports = { checkRateLimit };
