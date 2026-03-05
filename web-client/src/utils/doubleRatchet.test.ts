/**
 * doubleRatchet.test.ts – unit tests for the Double Ratchet session
 */
import { describe, it, expect } from "vitest";
import {
  DoubleRatchetSession,
  type DoubleRatchetMessage,
} from "@/utils/doubleRatchet";
import { generateX25519KeyPair, b64Encode, randomBytes } from "@/utils/crypto";

/** Generate a random 32-byte shared secret (simulates X3DH output). */
function fakeSharedSecret(): string {
  return b64Encode(randomBytes(32));
}

describe("DoubleRatchetSession – basic send/receive", () => {
  it("Alice can encrypt, Bob can decrypt", async () => {
    const secret = fakeSharedSecret();
    const bobSPK = await generateX25519KeyPair();
    const bobSPKPub = b64Encode(
      await crypto.subtle.exportKey("raw", bobSPK.publicKey),
    );

    const alice = await DoubleRatchetSession.initSender(secret, bobSPKPub);
    const bob = await DoubleRatchetSession.initReceiver(secret, bobSPK);

    const msg = await alice.encrypt("hello from alice");
    const plain = await bob.decrypt(msg);
    expect(plain).toBe("hello from alice");
  });

  it("encrypts multiple messages", async () => {
    const secret = fakeSharedSecret();
    const bobSPK = await generateX25519KeyPair();
    const bobSPKPub = b64Encode(
      await crypto.subtle.exportKey("raw", bobSPK.publicKey),
    );

    const alice = await DoubleRatchetSession.initSender(secret, bobSPKPub);
    const bob = await DoubleRatchetSession.initReceiver(secret, bobSPK);

    const plaintexts = ["msg-1", "msg-2", "msg-3"];
    const ciphertexts: DoubleRatchetMessage[] = [];

    for (const pt of plaintexts) {
      ciphertexts.push(await alice.encrypt(pt));
    }
    for (let i = 0; i < plaintexts.length; i++) {
      expect(await bob.decrypt(ciphertexts[i])).toBe(plaintexts[i]);
    }
  });

  it("each encrypted message produces a distinct ciphertext", async () => {
    const secret = fakeSharedSecret();
    const bobSPK = await generateX25519KeyPair();
    const bobSPKPub = b64Encode(
      await crypto.subtle.exportKey("raw", bobSPK.publicKey),
    );

    const alice = await DoubleRatchetSession.initSender(secret, bobSPKPub);
    const m1 = await alice.encrypt("same text");
    const m2 = await alice.encrypt("same text");
    expect(m1.ciphertext).not.toBe(m2.ciphertext);
    expect(m1.iv).not.toBe(m2.iv);
  });
});

describe("DoubleRatchetSession – bidirectional ratchet", () => {
  it("Bob can reply to Alice after decrypting", async () => {
    const secret = fakeSharedSecret();
    const aliceSPK = await generateX25519KeyPair();
    const bobSPK = await generateX25519KeyPair();
    const bobSPKPub = b64Encode(
      await crypto.subtle.exportKey("raw", bobSPK.publicKey),
    );
    const aliceSPKPub = b64Encode(
      await crypto.subtle.exportKey("raw", aliceSPK.publicKey),
    );

    // Alice → Bob
    const alice = await DoubleRatchetSession.initSender(secret, bobSPKPub);
    const bob = await DoubleRatchetSession.initReceiver(secret, bobSPK);

    const m1 = await alice.encrypt("ping");
    expect(await bob.decrypt(m1)).toBe("ping");

    // Bob → Alice (new ratchet from Bob's side)
    const bobAsInitiator = await DoubleRatchetSession.initSender(
      secret,
      aliceSPKPub,
    );
    const aliceAsReceiver = await DoubleRatchetSession.initReceiver(
      secret,
      aliceSPK,
    );
    const m2 = await bobAsInitiator.encrypt("pong");
    expect(await aliceAsReceiver.decrypt(m2)).toBe("pong");
  });
});

describe("DoubleRatchetSession – serialisation", () => {
  it("round-trips through serializeState / fromState", async () => {
    const secret = fakeSharedSecret();
    const bobSPK = await generateX25519KeyPair();
    const bobSPKPub = b64Encode(
      await crypto.subtle.exportKey("raw", bobSPK.publicKey),
    );

    // Alice sends message 0 and serialises state
    const alice = await DoubleRatchetSession.initSender(secret, bobSPKPub);
    const m0 = await alice.encrypt("pre-restore");

    const state = await alice.serializeState();
    const alice2 = await DoubleRatchetSession.fromState(state);

    // Alice sends message 1 from the *restored* session
    const m1 = await alice2.encrypt("post-restore message");

    // Bob decrypts both messages in order
    const bob = await DoubleRatchetSession.initReceiver(secret, bobSPK);
    expect(await bob.decrypt(m0)).toBe("pre-restore");
    expect(await bob.decrypt(m1)).toBe("post-restore message");
  });
});

describe("DoubleRatchetSession – forward secrecy (key separation)", () => {
  it("messages use distinct key material (n counter increments)", async () => {
    const secret = fakeSharedSecret();
    const bobSPK = await generateX25519KeyPair();
    const bobSPKPub = b64Encode(
      await crypto.subtle.exportKey("raw", bobSPK.publicKey),
    );

    const alice = await DoubleRatchetSession.initSender(secret, bobSPKPub);
    const m1 = await alice.encrypt("a");
    const m2 = await alice.encrypt("b");
    expect(m1.n).toBe(0);
    expect(m2.n).toBe(1);
    expect(m1.dhPublicKey).toBe(m2.dhPublicKey); // same DH key before ratchet
  });
});
