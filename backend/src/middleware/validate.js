"use strict";

const VALID_TYPES = new Set([
  "REGISTER",
  "MESSAGE",
  "READ_RECEIPT",
  "KEY_ACK",
  "WIPE",
  "SCREENSHOT_ACK",
  "DELETE_MESSAGE",
  "PING",
]);

const REQUIRED_FIELDS = {
  REGISTER: ["userId", "deviceId"],
  MESSAGE: ["to", "id", "content", "expiresAt", "deletionType"],
  READ_RECEIPT: ["to", "messageId", "event"],
  KEY_ACK: ["to", "keyId"],
  WIPE: ["targetDevice", "encryptedCommand"],
  SCREENSHOT_ACK: ["to", "messageId"],
  DELETE_MESSAGE: ["to", "messageId"],
  PING: [],
};

/**
 * Validate an incoming WebSocket packet.
 * Returns an error code string on failure, or null on success.
 * @param {object} packet
 * @returns {string|null}
 */
function validatePacket(packet) {
  if (!packet || typeof packet !== "object") return "INVALID_PACKET";
  if (!packet.type || typeof packet.type !== "string") return "MISSING_TYPE";
  if (!VALID_TYPES.has(packet.type)) return "UNKNOWN_TYPE";

  const required = REQUIRED_FIELDS[packet.type] || [];
  for (const field of required) {
    if (packet[field] === undefined || packet[field] === null) {
      return `MISSING_FIELD_${field.toUpperCase()}`;
    }
  }

  // Enforce string type on routing fields to prevent injection
  const routingFields = ["userId", "deviceId", "to", "id", "targetDevice"];
  for (const field of routingFields) {
    if (packet[field] !== undefined && typeof packet[field] !== "string") {
      return `INVALID_FIELD_${field.toUpperCase()}`;
    }
  }

  // Reject oversized user IDs
  const idFields = ["userId", "deviceId", "to", "id"];
  for (const field of idFields) {
    if (packet[field] && packet[field].length > 256) {
      return `OVERSIZED_FIELD_${field.toUpperCase()}`;
    }
  }

  return null;
}

module.exports = { validatePacket };
