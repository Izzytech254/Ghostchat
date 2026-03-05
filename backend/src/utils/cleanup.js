"use strict";

/**
 * Periodic task that evicts expired messages from the offline queue.
 */
class CleanupTask {
  /**
   * @param {import('../handlers/queue').QueueManager} queueManager
   * @param {import('pino').Logger} log
   * @param {{ intervalMs: number, maxQueueDays: number }} opts
   */
  constructor(queueManager, log, opts = {}) {
    this.queueManager = queueManager;
    this.log = log;
    this.intervalMs = opts.intervalMs || 3_600_000; // 1 hour
    this.maxQueueDays = opts.maxQueueDays || 30;
    this._timer = null;
  }

  start() {
    this._timer = setInterval(() => this._run(), this.intervalMs);
    // Run once immediately on startup to catch any leftover data in a crash-restart
    setImmediate(() => this._run());
    this.log.info({ intervalMs: this.intervalMs }, "CleanupTask started");
  }

  stop() {
    if (this._timer) {
      clearInterval(this._timer);
      this._timer = null;
    }
  }

  _run() {
    const maxAgeMs = this.maxQueueDays * 24 * 60 * 60 * 1000;
    this.log.debug("Running message queue cleanup");
    this.queueManager.evictExpired(maxAgeMs);
  }
}

module.exports = { CleanupTask };
