"use strict";

/**
 * QueueManager – temporarily buffers messages for offline recipients.
 *
 * Rules:
 *  - Maximum retention: MAX_QUEUE_DAYS (default 30).
 *  - Content is never inspected; stored as an opaque encrypted blob.
 *  - All queued data lives in memory only (production should use Redis).
 */
class QueueManager {
  constructor(log) {
    this.log = log;
    /** @type {Map<string, Array<{ envelope: object, ts: number }>>} */
    this._queues = new Map();
  }

  /**
   * Push an encrypted message envelope onto a user's offline queue.
   * @param {string} userId
   * @param {object} envelope – opaque encrypted packet forwarded as-is
   */
  push(userId, envelope) {
    if (!this._queues.has(userId)) {
      this._queues.set(userId, []);
    }
    this._queues.get(userId).push({ envelope, ts: Date.now() });
  }

  /**
   * Drain and return all queued envelopes for a user (they just came online).
   * @param {string} userId
   * @returns {object[]} array of envelope objects
   */
  drain(userId) {
    const entries = this._queues.get(userId) || [];
    this._queues.delete(userId);
    return entries.map((e) => e.envelope);
  }

  /**
   * Remove all queue entries older than `maxAgeMs`.
   * Called by CleanupTask on a scheduled interval.
   * @param {number} maxAgeMs
   */
  evictExpired(maxAgeMs) {
    const cutoff = Date.now() - maxAgeMs;
    let evicted = 0;

    for (const [userId, entries] of this._queues.entries()) {
      const fresh = entries.filter((e) => e.ts >= cutoff);
      evicted += entries.length - fresh.length;

      if (fresh.length === 0) {
        this._queues.delete(userId);
      } else {
        this._queues.set(userId, fresh);
      }
    }

    if (evicted > 0) {
      this.log.info({ evicted }, "Evicted expired queued messages");
    }
  }

  /** Number of users with queued messages. */
  queuedUserCount() {
    return this._queues.size;
  }

  /** Total queued message count across all users. */
  totalQueuedMessages() {
    let n = 0;
    for (const entries of this._queues.values()) n += entries.length;
    return n;
  }
}

module.exports = { QueueManager };
