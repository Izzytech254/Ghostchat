// ─── Core domain types ────────────────────────────────────────────────────────

export type DeletionType = "timed" | "read_once" | "burn_on_read";

export interface KeyBundle {
  identityKey: string; // base64url Ed25519 public key
  signedPreKey: string; // base64url X25519 public key
  signedPreKeyId: number;
  signature: string; // base64url Ed25519 signature over signedPreKey
  oneTimePreKey?: string; // base64url, optional
}

export interface IdentityKeyPair {
  publicKey: CryptoKey;
  privateKey: CryptoKey;
}

export interface Message {
  id: string;
  chatId: string;
  senderId: string; // anonymous id
  content: string; // encrypted ciphertext (base64)
  plaintextCache?: string; // decrypted plaintext (only in memory, never persisted)
  createdAt: number; // unix ms
  expiresAt: number; // unix ms
  deletionType: DeletionType;
  isRead: boolean;
  isOwn: boolean;
  screenshotAlert?: boolean;
}

export interface Chat {
  id: string;
  type: "private" | "group" | "ephemeral";
  name?: string;
  participantIds: string[];
  defaultTtlMs: number; // message TTL in ms
  createdAt: number;
  lastMessageAt?: number;
  lastMessagePreview?: string;
}

export interface Contact {
  id: string; // anonymous userId
  username: string;
  publicKey: string; // base64url identity key
  addedAt: number;
  lastSeen?: number;
}

export interface Account {
  id: string; // anonymous UUID
  username: string;
  createdAt: number;
  identityKey: string; // base64url public key
}

// ─── WebSocket packet types ───────────────────────────────────────────────────

export interface WsRegisterPacket {
  type: "REGISTER";
  userId: string;
  deviceId: string;
}

export interface WsMessagePacket {
  type: "MESSAGE";
  to: string;
  id: string;
  content: string; // encrypted blob (opaque to server)
  expiresAt: number;
  deletionType: DeletionType;
  senderHint?: string;
}

export interface WsReadReceiptPacket {
  type: "READ_RECEIPT";
  to: string;
  messageId: string;
  event: "read" | "expired" | "deleted";
}

export interface WsScreenshotAckPacket {
  type: "SCREENSHOT_ACK";
  to: string;
  messageId: string;
}

export type WsOutboundPacket =
  | WsRegisterPacket
  | WsMessagePacket
  | WsReadReceiptPacket
  | WsScreenshotAckPacket;

// ─── Inbound (from server) ────────────────────────────────────────────────────

export interface WsInboundMessage {
  type: "MESSAGE";
  id: string;
  from: string;
  content: string;
  expiresAt: number;
  deletionType: DeletionType;
  deliveredAt: number;
}

export interface WsDeliveredAck {
  type: "DELIVERED";
  id: string;
  to: string;
}
export interface WsQueuedAck {
  type: "QUEUED";
  id: string;
  to: string;
}
export interface WsRegisteredAck {
  type: "REGISTERED";
  queued: number;
}
export interface WsReadReceiptInbound {
  type: "READ_RECEIPT";
  messageId: string;
  event: string;
  ts: number;
}
export interface WsScreenshotAlert {
  type: "SCREENSHOT_ALERT";
  messageId: string;
  ts: number;
}
export interface WsError {
  type: "ERROR";
  code: string;
}

export type WsInboundPacket =
  | WsInboundMessage
  | WsDeliveredAck
  | WsQueuedAck
  | WsRegisteredAck
  | WsReadReceiptInbound
  | WsScreenshotAlert
  | WsError;
