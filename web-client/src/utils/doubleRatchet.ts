/**
 * doubleRatchet.ts – Signal Protocol Double Ratchet (WebCrypto)
 * ──────────────────────────────────────────────────────────────
 * Implements the Double Ratchet Algorithm as specified in:
 * https://signal.org/docs/specifications/doubleratchet/
 *
 * Builds on top of X3DH (crypto.ts) for initial key establishment.
 * Provides per-message forward secrecy and break-in recovery.
 *
 * Usage:
 *   // Alice (initiator) – after x3dhInitiate():
 *   const session = await DoubleRatchetSession.initSender(
 *     sharedSecret, recipientSignedPreKey
 *   );
 *   const msg = await session.encrypt("hello");
 *
 *   // Bob (responder) – after x3dhRespond():
 *   const session = await DoubleRatchetSession.initReceiver(sharedSecret, mySignedPreKeyPair);
 *   const plaintext = await session.decrypt(msg);
 *
 * NOTE: Session state must be persisted to IndexedDB (via storage.ts saveKey)
 * between messages. Use serializeState() / DoubleRatchetSession.fromState().
 */

import { generateX25519KeyPair, b64Encode, b64Decode } from "./crypto";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface DoubleRatchetMessage {
  /** base64url ciphertext (AES-256-GCM) */
  ciphertext: string;
  /** base64url 12-byte IV */
  iv: string;
  /** Sender's current DH ratchet public key (base64url) */
  dhPublicKey: string;
  /** Number of messages in previous sending chain (for skipped key recovery) */
  pn: number;
  /** Message counter in current sending chain */
  n: number;
}

interface SerializedState {
  DHs_pub: string;
  DHs_priv: string;
  DHr: string | null;
  RK: string;
  CKs: string | null;
  CKr: string | null;
  Ns: number;
  Nr: number;
  PN: number;
  /** { "<dhPub>:<n>": "<messageKey base64>" } */
  MKSKIPPED: Record<string, string>;
}

// ─── Low-level WebCrypto helpers ──────────────────────────────────────────────

async function hmac(
  key: ArrayBuffer,
  data: Uint8Array<ArrayBuffer>,
): Promise<ArrayBuffer> {
  const k = await crypto.subtle.importKey(
    "raw",
    key,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return crypto.subtle.sign("HMAC", k, data);
}

async function hkdf2(
  ikm: ArrayBuffer,
  salt: ArrayBuffer,
  info: string,
  length: number,
): Promise<ArrayBuffer> {
  const key = await crypto.subtle.importKey("raw", ikm, "HKDF", false, [
    "deriveBits",
  ]);
  return crypto.subtle.deriveBits(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt,
      info: new TextEncoder().encode(info),
    },
    key,
    length * 8,
  );
}

async function dhRatchet(
  privateKey: CryptoKey,
  publicKey: CryptoKey,
): Promise<ArrayBuffer> {
  return crypto.subtle.deriveBits(
    { name: "ECDH", public: publicKey },
    privateKey,
    256,
  );
}

/** KDF_RK: derive new root key + chain key from root key and DH output */
async function kdfRK(
  rk: ArrayBuffer,
  dhOut: ArrayBuffer,
): Promise<{ newRK: ArrayBuffer; ck: ArrayBuffer }> {
  const out = await hkdf2(dhOut, rk, "WhisproDR_RootKDF_v1", 64);
  return {
    newRK: out.slice(0, 32),
    ck: out.slice(32, 64),
  };
}

/** KDF_CK: ratchet a chain key → next chain key + message key */
async function kdfCK(
  ck: ArrayBuffer,
): Promise<{ nextCK: ArrayBuffer; mk: ArrayBuffer }> {
  const one = new Uint8Array([0x01]) as Uint8Array<ArrayBuffer>;
  const two = new Uint8Array([0x02]) as Uint8Array<ArrayBuffer>;
  const [mk, nextCK] = await Promise.all([hmac(ck, one), hmac(ck, two)]);
  return { nextCK, mk };
}

async function aesEncrypt(
  mk: ArrayBuffer,
  plaintext: string,
  associatedData?: string,
): Promise<{ ciphertext: ArrayBuffer; iv: Uint8Array<ArrayBuffer> }> {
  const key = await crypto.subtle.importKey(
    "raw",
    mk,
    { name: "AES-GCM" },
    false,
    ["encrypt"],
  );
  const iv = crypto.getRandomValues(
    new Uint8Array(12),
  ) as Uint8Array<ArrayBuffer>;
  const ad = associatedData
    ? new TextEncoder().encode(associatedData)
    : undefined;
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: ad },
    key,
    new TextEncoder().encode(plaintext),
  );
  return { ciphertext, iv };
}

async function aesDecrypt(
  mk: ArrayBuffer,
  ciphertext: ArrayBuffer,
  iv: Uint8Array<ArrayBuffer>,
  associatedData?: string,
): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    mk,
    { name: "AES-GCM" },
    false,
    ["decrypt"],
  );
  const ad = associatedData
    ? new TextEncoder().encode(associatedData)
    : undefined;
  const plain = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv, additionalData: ad },
    key,
    ciphertext,
  );
  return new TextDecoder().decode(plain);
}

async function importECDHPublicKey(b64: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    b64Decode(b64),
    { name: "ECDH", namedCurve: "P-256" },
    true,
    [],
  );
}

async function exportPublicKey(key: CryptoKey): Promise<string> {
  const raw = await crypto.subtle.exportKey("raw", key);
  return b64Encode(raw);
}

async function exportPrivateKey(key: CryptoKey): Promise<string> {
  const jwk = await crypto.subtle.exportKey("jwk", key);
  return JSON.stringify(jwk);
}

async function importPrivateKey(jwkStr: string): Promise<CryptoKey> {
  const jwk = JSON.parse(jwkStr) as JsonWebKey;
  return crypto.subtle.importKey(
    "jwk",
    jwk,
    { name: "ECDH", namedCurve: "P-256" },
    true,
    ["deriveBits"],
  );
}

// ─── Max skipped keys kept in memory ─────────────────────────────────────────
const MAX_SKIP = 1000;

// ─── Session ──────────────────────────────────────────────────────────────────

export class DoubleRatchetSession {
  private DHs!: CryptoKeyPair;
  private DHr: CryptoKey | null = null;
  private RK!: ArrayBuffer;
  private CKs: ArrayBuffer | null = null;
  private CKr: ArrayBuffer | null = null;
  private Ns = 0;
  private Nr = 0;
  private PN = 0;
  private MKSKIPPED: Map<string, ArrayBuffer> = new Map();

  private constructor() {}

  // ── Factory: sender (Alice) ─────────────────────────────────────────────────

  /**
   * Initialize as the message initiator.
   * @param sharedSecret – 32-byte root key from X3DH (as base64url)
   * @param recipientSignedPreKey – recipient's SPK public key (base64url)
   */
  static async initSender(
    sharedSecret: string,
    recipientSignedPreKey: string,
  ): Promise<DoubleRatchetSession> {
    const s = new DoubleRatchetSession();
    s.DHs = await generateX25519KeyPair();
    s.DHr = await importECDHPublicKey(recipientSignedPreKey);
    s.RK = b64Decode(sharedSecret).buffer as ArrayBuffer;

    // Initial DH ratchet step
    const dh = await dhRatchet(s.DHs.privateKey, s.DHr);
    const { newRK, ck } = await kdfRK(s.RK, dh);
    s.RK = newRK;
    s.CKs = ck;

    return s;
  }

  // ── Factory: receiver (Bob) ─────────────────────────────────────────────────

  /**
   * Initialize as the message responder.
   * @param sharedSecret – 32-byte root key from X3DH (as base64url)
   * @param mySignedPreKeyPair – our SPK key pair (used as initial DH ratchet key)
   */
  static async initReceiver(
    sharedSecret: string,
    mySignedPreKeyPair: CryptoKeyPair,
  ): Promise<DoubleRatchetSession> {
    const s = new DoubleRatchetSession();
    s.DHs = mySignedPreKeyPair;
    s.RK = b64Decode(sharedSecret).buffer as ArrayBuffer;
    // CKr is null until first message is received
    return s;
  }

  // ── Factory: deserialize ────────────────────────────────────────────────────

  static async fromState(
    state: SerializedState,
  ): Promise<DoubleRatchetSession> {
    const s = new DoubleRatchetSession();

    const pub = await importECDHPublicKey(state.DHs_pub);
    const priv = await importPrivateKey(state.DHs_priv);
    s.DHs = { publicKey: pub, privateKey: priv };

    s.DHr = state.DHr ? await importECDHPublicKey(state.DHr) : null;
    s.RK = b64Decode(state.RK).buffer as ArrayBuffer;
    s.CKs = state.CKs ? (b64Decode(state.CKs).buffer as ArrayBuffer) : null;
    s.CKr = state.CKr ? (b64Decode(state.CKr).buffer as ArrayBuffer) : null;
    s.Ns = state.Ns;
    s.Nr = state.Nr;
    s.PN = state.PN;

    s.MKSKIPPED = new Map(
      Object.entries(state.MKSKIPPED).map(([k, v]) => [
        k,
        b64Decode(v).buffer as ArrayBuffer,
      ]),
    );

    return s;
  }

  // ── Serialize ───────────────────────────────────────────────────────────────

  async serializeState(): Promise<SerializedState> {
    const skipped: Record<string, string> = {};
    for (const [k, v] of this.MKSKIPPED.entries()) {
      skipped[k] = b64Encode(v);
    }

    return {
      DHs_pub: await exportPublicKey(this.DHs.publicKey),
      DHs_priv: await exportPrivateKey(this.DHs.privateKey),
      DHr: this.DHr ? await exportPublicKey(this.DHr) : null,
      RK: b64Encode(this.RK),
      CKs: this.CKs ? b64Encode(this.CKs) : null,
      CKr: this.CKr ? b64Encode(this.CKr) : null,
      Ns: this.Ns,
      Nr: this.Nr,
      PN: this.PN,
      MKSKIPPED: skipped,
    };
  }

  // ── Encrypt ─────────────────────────────────────────────────────────────────

  async encrypt(plaintext: string): Promise<DoubleRatchetMessage> {
    if (!this.CKs) throw new Error("Sending chain not initialised");

    const { nextCK, mk } = await kdfCK(this.CKs);
    this.CKs = nextCK;

    const dhPub = await exportPublicKey(this.DHs.publicKey);
    const header = `${dhPub}:${this.PN}:${this.Ns}`;
    const { ciphertext, iv } = await aesEncrypt(mk, plaintext, header);

    const msg: DoubleRatchetMessage = {
      ciphertext: b64Encode(ciphertext),
      iv: b64Encode(iv),
      dhPublicKey: dhPub,
      pn: this.PN,
      n: this.Ns,
    };

    this.Ns += 1;
    return msg;
  }

  // ── Decrypt ─────────────────────────────────────────────────────────────────

  async decrypt(msg: DoubleRatchetMessage): Promise<string> {
    // 1. Check skipped message keys
    const skipKey = `${msg.dhPublicKey}:${msg.n}`;
    const skippedMK = this.MKSKIPPED.get(skipKey);
    if (skippedMK) {
      this.MKSKIPPED.delete(skipKey);
      return this._decryptWithMK(skippedMK, msg);
    }

    const currentDHrPub = this.DHr ? await exportPublicKey(this.DHr) : null;

    // 2. DH ratchet step if sender has a new DH key
    if (msg.dhPublicKey !== currentDHrPub) {
      await this._skipMessageKeys(msg.pn);
      await this._dhRatchetStep(msg.dhPublicKey);
    }

    // 3. Skip any missing messages in the current receive chain
    await this._skipMessageKeys(msg.n);

    // 4. Derive this message's key and decrypt
    if (!this.CKr) throw new Error("Receive chain not initialised");
    const { nextCK, mk } = await kdfCK(this.CKr);
    this.CKr = nextCK;
    this.Nr += 1;

    return this._decryptWithMK(mk, msg);
  }

  private async _dhRatchetStep(newDHrPub: string): Promise<void> {
    this.PN = this.Ns;
    this.Ns = 0;
    this.Nr = 0;

    this.DHr = await importECDHPublicKey(newDHrPub);

    // Receive ratchet
    const dh1 = await dhRatchet(this.DHs.privateKey, this.DHr);
    const { newRK: rk1, ck: ckr } = await kdfRK(this.RK, dh1);
    this.RK = rk1;
    this.CKr = ckr;

    // Send ratchet
    this.DHs = await generateX25519KeyPair();
    const dh2 = await dhRatchet(this.DHs.privateKey, this.DHr);
    const { newRK: rk2, ck: cks } = await kdfRK(this.RK, dh2);
    this.RK = rk2;
    this.CKs = cks;
  }

  private async _skipMessageKeys(until: number): Promise<void> {
    if (this.Nr + MAX_SKIP < until) {
      throw new Error("Too many skipped messages");
    }
    if (!this.CKr) return;
    const dhPub = this.DHr ? await exportPublicKey(this.DHr) : "none";

    while (this.Nr < until) {
      const { nextCK, mk } = await kdfCK(this.CKr);
      this.CKr = nextCK;
      this.MKSKIPPED.set(`${dhPub}:${this.Nr}`, mk);
      this.Nr += 1;
    }
  }

  private async _decryptWithMK(
    mk: ArrayBuffer,
    msg: DoubleRatchetMessage,
  ): Promise<string> {
    const header = `${msg.dhPublicKey}:${msg.pn}:${msg.n}`;
    const ciphertext = b64Decode(msg.ciphertext).buffer as ArrayBuffer;
    const iv = b64Decode(msg.iv) as Uint8Array<ArrayBuffer>;
    return aesDecrypt(mk, ciphertext, iv, header);
  }
}
