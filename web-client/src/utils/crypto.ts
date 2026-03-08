/**
 * crypto.ts – Whispro E2E encryption helpers using WebCrypto API
 * ──────────────────────────────────────────────────────────────────
 * Implements a simplified X3DH-like key agreement + AES-256-GCM encryption.
 *
 * Key agreement flow (X3DH / ECDH):
 *   1. Alice fetches Bob's key bundle (IK_B, SPK_B, OTK_B, sig) from key server.
 *   2. Alice generates an ephemeral key pair EK_A.
 *   3. Alice computes shared secrets via ECDH:
 *       DH1 = ECDH(IK_A,  SPK_B)
 *       DH2 = ECDH(EK_A,  IK_B)
 *       DH3 = ECDH(EK_A,  SPK_B)
 *       DH4 = ECDH(EK_A,  OTK_B)  [if OTK available]
 *   4. masterSecret = HKDF(DH1 || DH2 || DH3 [|| DH4])
 *   5. Encrypt message with AES-256-GCM using masterSecret + fresh random IV.
 *
 * NOTE: A production implementation should use libsignal (Double Ratchet) for
 * full forward secrecy. This implementation provides session security suitable
 * for MVP and can be replaced by libsignal-protocol-typescript transparently.
 */

// ─── Base64url helpers ────────────────────────────────────────────────────────

export function b64Encode(buf: ArrayBuffer | Uint8Array<ArrayBuffer>): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");
}

export function b64Decode(s: string): Uint8Array<ArrayBuffer> {
  const padded = s.replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(padded + "==".slice(0, (4 - (padded.length % 4)) % 4));
  return Uint8Array.from(raw, (c) =>
    c.charCodeAt(0),
  ) as Uint8Array<ArrayBuffer>;
}

// ─── Random helpers ───────────────────────────────────────────────────────────

export function randomBytes(len: number): Uint8Array<ArrayBuffer> {
  return crypto.getRandomValues(new Uint8Array(len));
}

export function generateUUID(): string {
  return crypto.randomUUID();
}

// ─── Key generation ───────────────────────────────────────────────────────────

/** Generate a P-256 ECDH key pair (used for identity, signed pre-key, OTK).
 * P-256 has universal WebCrypto support across browsers, Node.js and jsdom.
 */
export async function generateX25519KeyPair(): Promise<CryptoKeyPair> {
  return crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" },
    true,
    ["deriveKey", "deriveBits"],
  );
}

/** Generate an Ed25519 signing key pair (used for identity key signature). */
export async function generateEd25519KeyPair(): Promise<CryptoKeyPair> {
  // Use ECDSA P-256 as alternative since Ed25519 not widely supported
  return crypto.subtle.generateKey(
    { name: "ECDSA", namedCurve: "P-256" },
    true,
    ["sign", "verify"],
  );
}

/** Sign data with a private key (ECDSA P-256). */
export async function signData(
  privateKey: CryptoKey,
  data: Uint8Array,
): Promise<string> {
  const signature = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    privateKey,
    new Uint8Array(data).buffer,
  );
  return b64Encode(signature);
}

/** Export public key as base64url string. */
export async function exportPublicKey(key: CryptoKey): Promise<string> {
  const raw = await crypto.subtle.exportKey("raw", key);
  return b64Encode(raw);
}

/** Import a base64url public key for ECDH. */
export async function importECDHPublicKey(b64: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    b64Decode(b64),
    { name: "ECDH", namedCurve: "P-256" },
    true,
    [],
  );
}

// ─── HKDF ─────────────────────────────────────────────────────────────────────

async function hkdf(
  ikm: Uint8Array<ArrayBuffer>,
  info: string,
  length = 32,
): Promise<CryptoKey> {
  const key = await crypto.subtle.importKey("raw", ikm, "HKDF", false, [
    "deriveKey",
  ]);

  return crypto.subtle.deriveKey(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: new Uint8Array(32),
      info: new TextEncoder().encode(info),
    },
    key,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

// ─── ECDH ─────────────────────────────────────────────────────────────────────

async function ecdh(
  privateKey: CryptoKey,
  publicKey: CryptoKey,
): Promise<ArrayBuffer> {
  return crypto.subtle.deriveBits(
    { name: "ECDH", public: publicKey },
    privateKey,
    256,
  );
}

// ─── X3DH-like key agreement ──────────────────────────────────────────────────

export interface X3DHBundle {
  identityKey: CryptoKey; // Their IK_B public key
  signedPreKey: CryptoKey; // Their SPK_B public key
  oneTimePreKey?: CryptoKey; // Their OTK_B public key (optional)
}

export interface SessionKeys {
  encryptionKey: CryptoKey;
  /** Ephemeral public key to include in message header so receiver can replicate DH. */
  ephemeralPublicKey: string;
}

/**
 * X3DH initiator (Alice's side) – derive a shared encryption key from the
 * recipient's key bundle without them being online.
 */
export async function x3dhInitiate(
  myIdentityPrivateKey: CryptoKey,
  recipientBundle: X3DHBundle,
): Promise<SessionKeys> {
  const ephemeral = await generateX25519KeyPair();
  const epkPublic = await exportPublicKey(ephemeral.publicKey);

  const dh1 = new Uint8Array(
    await ecdh(myIdentityPrivateKey, recipientBundle.signedPreKey),
  );
  const dh2 = new Uint8Array(
    await ecdh(ephemeral.privateKey, recipientBundle.identityKey),
  );
  const dh3 = new Uint8Array(
    await ecdh(ephemeral.privateKey, recipientBundle.signedPreKey),
  );

  let ikmArray: Uint8Array<ArrayBuffer> = new Uint8Array([
    ...dh1,
    ...dh2,
    ...dh3,
  ]) as Uint8Array<ArrayBuffer>;

  if (recipientBundle.oneTimePreKey) {
    const dh4 = new Uint8Array(
      await ecdh(ephemeral.privateKey, recipientBundle.oneTimePreKey),
    );
    ikmArray = new Uint8Array([...ikmArray, ...dh4]) as Uint8Array<ArrayBuffer>;
  }

  const encryptionKey = await hkdf(ikmArray, "Whispro v1 X3DH");

  return { encryptionKey, ephemeralPublicKey: epkPublic };
}

/**
 * X3DH responder (Bob's side) – reconstruct the same key from the message header.
 */
export async function x3dhRespond(
  myIdentityPrivateKey: CryptoKey,
  mySignedPreKeyPrivate: CryptoKey,
  senderIdentityKey: CryptoKey,
  ephemeralPublicKey: CryptoKey,
  myOneTimePreKeyPrivate?: CryptoKey,
): Promise<CryptoKey> {
  const dh1 = new Uint8Array(
    await ecdh(mySignedPreKeyPrivate, senderIdentityKey),
  );
  const dh2 = new Uint8Array(
    await ecdh(myIdentityPrivateKey, ephemeralPublicKey),
  );
  const dh3 = new Uint8Array(
    await ecdh(mySignedPreKeyPrivate, ephemeralPublicKey),
  );

  let ikmArray: Uint8Array<ArrayBuffer> = new Uint8Array([
    ...dh1,
    ...dh2,
    ...dh3,
  ]) as Uint8Array<ArrayBuffer>;

  if (myOneTimePreKeyPrivate) {
    const dh4 = new Uint8Array(
      await ecdh(myOneTimePreKeyPrivate, ephemeralPublicKey),
    );
    ikmArray = new Uint8Array([...ikmArray, ...dh4]) as Uint8Array<ArrayBuffer>;
  }

  return hkdf(ikmArray, "Whispro v1 X3DH");
}

// ─── AES-256-GCM encrypt / decrypt ────────────────────────────────────────────

export interface EncryptedEnvelope {
  ciphertext: string; // base64url
  iv: string; // base64url (12 bytes)
  epk: string; // ephemeral public key (base64url) – for X3DH
}

/**
 * Encrypt a plaintext string for a recipient.
 * Returns an opaque base64-encoded envelope to be sent over the wire.
 */
export async function encryptMessage(
  plaintext: string,
  myIdentityPrivateKey: CryptoKey,
  recipientBundle: X3DHBundle,
): Promise<EncryptedEnvelope> {
  const { encryptionKey, ephemeralPublicKey } = await x3dhInitiate(
    myIdentityPrivateKey,
    recipientBundle,
  );

  const iv = randomBytes(12);
  const encoded = new TextEncoder().encode(plaintext);
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    encryptionKey,
    encoded,
  );

  return {
    ciphertext: b64Encode(ciphertext),
    iv: b64Encode(iv),
    epk: ephemeralPublicKey,
  };
}

/**
 * Decrypt an envelope received from a sender.
 */
export async function decryptMessage(
  envelope: EncryptedEnvelope,
  myIdentityPrivateKey: CryptoKey,
  mySignedPreKeyPrivate: CryptoKey,
  senderIdentityKey: CryptoKey,
  myOneTimePreKeyPrivate?: CryptoKey,
): Promise<string> {
  const ephemeralPublicKey = await importECDHPublicKey(envelope.epk);

  const encryptionKey = await x3dhRespond(
    myIdentityPrivateKey,
    mySignedPreKeyPrivate,
    senderIdentityKey,
    ephemeralPublicKey,
    myOneTimePreKeyPrivate,
  );

  const iv = b64Decode(envelope.iv);
  const ciphertext = b64Decode(envelope.ciphertext);

  const plainBuf = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv },
    encryptionKey,
    ciphertext,
  );
  return new TextDecoder().decode(plainBuf);
}

// ─── Secure wipe ─────────────────────────────────────────────────────────────

/**
 * Overwrite a Uint8Array with secure random data (best-effort in JS memory).
 * JS VMs may have already copied the buffer, so this is advisory.
 */
export function secureWipe(buf: Uint8Array): void {
  crypto.getRandomValues(buf);
  buf.fill(0);
}

// ─── Timestamp helpers ────────────────────────────────────────────────────────

/** Round timestamp to nearest hour (reduces timing metadata). */
export function roundedTimestamp(ms: number): number {
  return Math.floor(ms / 3_600_000) * 3_600_000;
}

/** Pad a number to a multiple of `blockSize` to hide exact value. */
export function padSize(n: number, blockSize = 256): number {
  return Math.ceil(n / blockSize) * blockSize;
}
