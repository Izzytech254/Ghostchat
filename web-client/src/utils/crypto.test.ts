/**
 * crypto.test.ts – unit tests for crypto utilities
 */
import { describe, it, expect } from "vitest";
import {
  b64Encode,
  b64Decode,
  randomBytes,
  generateUUID,
  roundedTimestamp,
  padSize,
  secureWipe,
} from "@/utils/crypto";

describe("b64Encode / b64Decode round-trip", () => {
  it("encodes and decodes arbitrary bytes", () => {
    const original = new Uint8Array([0, 1, 2, 128, 200, 255]);
    const encoded = b64Encode(original.buffer);
    const decoded = b64Decode(encoded);
    expect(decoded).toEqual(original);
  });

  it("produces URL-safe characters (no +, /, =)", () => {
    for (let i = 0; i < 50; i++) {
      const encoded = b64Encode(randomBytes(32).buffer);
      expect(encoded).not.toMatch(/[+/=]/);
    }
  });
});

describe("randomBytes", () => {
  it("returns the requested length", () => {
    expect(randomBytes(16)).toHaveLength(16);
    expect(randomBytes(32)).toHaveLength(32);
  });

  it("produces different values on each call", () => {
    const a = b64Encode(randomBytes(32).buffer);
    const b = b64Encode(randomBytes(32).buffer);
    expect(a).not.toBe(b);
  });
});

describe("generateUUID", () => {
  it("returns a valid UUID v4", () => {
    const id = generateUUID();
    expect(id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
  });
});

describe("roundedTimestamp", () => {
  it("rounds to nearest hour boundary", () => {
    const ts = Date.now();
    const rounded = roundedTimestamp(ts);
    expect(rounded % 3_600_000).toBe(0);
    expect(rounded).toBeLessThanOrEqual(ts);
  });
});

describe("padSize", () => {
  it("pads to next block boundary", () => {
    expect(padSize(1)).toBe(256);
    expect(padSize(256)).toBe(256);
    expect(padSize(257)).toBe(512);
    expect(padSize(0)).toBe(0);
  });

  it("honours custom block size", () => {
    expect(padSize(100, 64)).toBe(128);
  });
});

describe("secureWipe", () => {
  it("zeroes the buffer after wipe", () => {
    const buf = new Uint8Array([1, 2, 3, 4]);
    secureWipe(buf);
    // After secureWipe, buf should be all zeros (second step)
    expect([...buf]).toEqual([0, 0, 0, 0]);
  });
});
