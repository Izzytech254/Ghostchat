/**
 * storage.ts – Encrypted local IndexedDB storage
 * ─────────────────────────────────────────────────
 * All persisted data is encrypted with an AES-256-GCM key derived from the
 * user's passphrase (PBKDF2, 600k iterations) before writing to IndexedDB.
 * The server never sees any of this data.
 */

import { openDB, type IDBPDatabase } from "idb";
import type { Message, Chat, Contact, Account } from "@/types";
import { b64Encode, b64Decode } from "./crypto";

const DB_NAME = "whispro";

/**
 * Bump DB_VERSION whenever you add a new migration below.
 *
 * Version history:
 *  v1 – Initial schema: messages, chats, contacts, account, keystore, meta
 *  v2 – (future) Add Double Ratchet session state store
 *  v3 – (future) Add read-receipt tracking index on messages
 */
const DB_VERSION = 1;

// ─── Encryption key management ────────────────────────────────────────────────

let _encryptionKey: CryptoKey | null = null;

/**
 * Derive a storage encryption key from a passphrase using PBKDF2.
 * Call once during app unlock, then keep in memory only.
 */
export async function deriveStorageKey(
  passphrase: string,
  salt?: Uint8Array<ArrayBuffer>,
): Promise<{ key: CryptoKey; salt: Uint8Array<ArrayBuffer> }> {
  const usedSalt: Uint8Array<ArrayBuffer> =
    salt ?? crypto.getRandomValues(new Uint8Array(32));

  const base = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(passphrase),
    "PBKDF2",
    false,
    ["deriveKey"],
  );

  const key = await crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: usedSalt, iterations: 600_000, hash: "SHA-256" },
    base,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );

  _encryptionKey = key;
  return { key, salt: usedSalt };
}

export function setStorageKey(key: CryptoKey): void {
  _encryptionKey = key;
}

export function clearStorageKey(): void {
  _encryptionKey = null;
}

// ─── Encrypt / decrypt helpers ────────────────────────────────────────────────

async function encryptValue(value: unknown): Promise<string> {
  if (!_encryptionKey) throw new Error("Storage not unlocked");

  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = new TextEncoder().encode(JSON.stringify(value));
  const ct = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    _encryptionKey,
    data,
  );

  // Pack: [12-byte IV][ciphertext]
  const packed = new Uint8Array(12 + ct.byteLength);
  packed.set(iv, 0);
  packed.set(new Uint8Array(ct), 12);

  return b64Encode(packed.buffer);
}

async function decryptValue<T>(encoded: string): Promise<T> {
  if (!_encryptionKey) throw new Error("Storage not unlocked");

  const packed = b64Decode(encoded);
  const iv = packed.slice(0, 12);
  const ciphertext = packed.slice(12);

  const plainBuf = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv },
    _encryptionKey,
    ciphertext,
  );
  return JSON.parse(new TextDecoder().decode(plainBuf)) as T;
}

// ─── DB initialisation ─────────────────────────────────────────────────────────

let _db: IDBPDatabase | null = null;

async function getDB(): Promise<IDBPDatabase> {
  if (!_db) {
    _db = await openDB(DB_NAME, DB_VERSION, {
      upgrade(db, oldVersion) {
        // ── v0 → v1 ────────────────────────────────────────────────────────
        if (oldVersion < 1) {
          const msg = db.createObjectStore("messages", { keyPath: "id" });
          msg.createIndex("by_chat", "chatId");
          msg.createIndex("by_expires", "expiresAt");

          db.createObjectStore("chats", { keyPath: "id" });
          db.createObjectStore("contacts", { keyPath: "id" });
          db.createObjectStore("account", { keyPath: "id" });
          db.createObjectStore("keystore", { keyPath: "id" });
          db.createObjectStore("meta", { keyPath: "key" });
        }

        // ── v1 → v2 ────────────────────────────────────────────────────────
        // Add this block when Double Ratchet sessions need persistent state.
        //
        // if (oldVersion < 2) {
        //   db.createObjectStore("ratchet_sessions", { keyPath: "chatId" });
        // }

        // ── v2 → v3 ────────────────────────────────────────────────────────
        // Example: add a read-receipt index to the messages store.
        //
        // if (oldVersion < 3) {
        //   const tx = db.transaction("messages");
        //   const store = tx.objectStore("messages");
        //   if (!store.indexNames.contains("by_read")) {
        //     store.createIndex("by_read", "isRead");
        //   }
        // }
      },
    });
  }
  return _db;
}

// ─── Messages ─────────────────────────────────────────────────────────────────

export async function saveMessage(msg: Message): Promise<void> {
  const db = await getDB();
  const payload = await encryptValue(msg);
  await db.put("messages", {
    id: msg.id,
    chatId: msg.chatId,
    expiresAt: msg.expiresAt,
    payload,
  });
}

export async function getMessages(chatId: string): Promise<Message[]> {
  const db = await getDB();
  const records = await db.getAllFromIndex("messages", "by_chat", chatId);
  const results: Message[] = [];

  for (const r of records) {
    try {
      results.push(await decryptValue<Message>(r.payload));
    } catch {
      // Corrupted record – skip
    }
  }

  return results.sort((a, b) => a.createdAt - b.createdAt);
}

export async function deleteMessage(id: string): Promise<void> {
  const db = await getDB();
  await db.delete("messages", id);
}

export async function deleteExpiredMessages(): Promise<string[]> {
  const db = await getDB();
  const now = Date.now();
  const expired = await db.getAllFromIndex(
    "messages",
    "by_expires",
    IDBKeyRange.upperBound(now),
  );
  const ids = expired.map((r: { id: string }) => r.id);

  const tx = db.transaction("messages", "readwrite");
  await Promise.all(ids.map((id: string) => tx.store.delete(id)));
  await tx.done;

  return ids;
}

// ─── Chats ────────────────────────────────────────────────────────────────────

export async function saveChat(chat: Chat): Promise<void> {
  const db = await getDB();
  const payload = await encryptValue(chat);
  await db.put("chats", { id: chat.id, payload });
}

export async function getChat(id: string): Promise<Chat | null> {
  const db = await getDB();
  const record = await db.get("chats", id);
  if (!record) return null;
  try {
    return await decryptValue<Chat>(record.payload);
  } catch {
    return null;
  }
}

export async function getChats(): Promise<Chat[]> {
  const db = await getDB();
  const records = await db.getAll("chats");
  const results: Chat[] = [];

  for (const r of records) {
    try {
      results.push(await decryptValue<Chat>(r.payload));
    } catch {
      // skip corrupted
    }
  }

  return results.sort(
    (a, b) => (b.lastMessageAt ?? 0) - (a.lastMessageAt ?? 0),
  );
}

export async function deleteChat(id: string): Promise<void> {
  const db = await getDB();
  await db.delete("chats", id);
  // Also delete all messages in this chat
  const msgs = await db.getAllFromIndex("messages", "by_chat", id);
  const tx = db.transaction("messages", "readwrite");
  await Promise.all(msgs.map((m: { id: string }) => tx.store.delete(m.id)));
  await tx.done;
}

// ─── Contacts ─────────────────────────────────────────────────────────────────

export async function saveContact(contact: Contact): Promise<void> {
  const db = await getDB();
  const payload = await encryptValue(contact);
  await db.put("contacts", { id: contact.id, payload });
}

export async function getContacts(): Promise<Contact[]> {
  const db = await getDB();
  const records = await db.getAll("contacts");
  const results: Contact[] = [];

  for (const r of records) {
    try {
      results.push(await decryptValue<Contact>(r.payload));
    } catch {
      /* skip */
    }
  }

  return results;
}

export async function deleteContact(id: string): Promise<void> {
  const db = await getDB();
  await db.delete("contacts", id);
}

// ─── Account ──────────────────────────────────────────────────────────────────

export async function saveAccount(account: Account): Promise<void> {
  const db = await getDB();
  const payload = await encryptValue(account);
  await db.put("account", { id: account.id, payload });
}

export async function getAccount(): Promise<Account | null> {
  const db = await getDB();
  const records = await db.getAll("account");
  if (!records.length) return null;
  try {
    return await decryptValue<Account>(records[0].payload);
  } catch {
    return null;
  }
}

// ─── Keystore ─────────────────────────────────────────────────────────────────

export async function saveKey(id: string, exportedKey: string): Promise<void> {
  const db = await getDB();
  const payload = await encryptValue(exportedKey);
  await db.put("keystore", { id, payload });
}

export async function getKey(id: string): Promise<string | null> {
  const db = await getDB();
  const r = await db.get("keystore", id);
  if (!r) return null;
  return decryptValue<string>(r.payload);
}

// ─── Meta ─────────────────────────────────────────────────────────────────────

export async function setMeta(key: string, value: unknown): Promise<void> {
  const db = await getDB();
  await db.put("meta", { key, value: JSON.stringify(value) });
}

export async function getMeta<T>(key: string): Promise<T | null> {
  const db = await getDB();
  const r = await db.get("meta", key);
  return r ? (JSON.parse(r.value) as T) : null;
}

// ─── Nuclear wipe ─────────────────────────────────────────────────────────────

/**
 * Permanently delete all local data (account deletion / self-destruct).
 * After this call the DB is gone and the storage key is cleared.
 */
export async function nukeAllData(): Promise<void> {
  const db = await getDB();
  await Promise.all(
    ["messages", "chats", "contacts", "account", "keystore", "meta"].map(
      (store) => db.clear(store),
    ),
  );

  clearStorageKey();
  _db = null;

  // Clear localStorage items (including the salt)
  localStorage.removeItem("gc_salt");
  sessionStorage.removeItem("gc_device");

  // Delete the IndexedDB entirely
  await new Promise<void>((resolve, reject) => {
    const req = indexedDB.deleteDatabase(DB_NAME);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}
