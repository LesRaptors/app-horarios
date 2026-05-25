import { describe, it, expect, beforeAll } from "vitest";
import { encryptCreds, decryptCreds } from "./crypto";
import { randomBytes } from "crypto";

beforeAll(() => {
  process.env.BILLING_CREDS_ENC_KEY = randomBytes(32).toString("base64");
});

describe("encryptCreds / decryptCreds", () => {
  it("round-trip preserva data", () => {
    const original = { api_key: "secret-key-xyz", email_user: "test@x.com" };
    const enc = encryptCreds(original);
    const dec = decryptCreds(enc);
    expect(dec).toEqual(original);
  });
  it("ciphertext difiere entre encriptaciones (IV aleatorio)", () => {
    const data = { foo: "bar" };
    expect(encryptCreds(data)).not.toBe(encryptCreds(data));
  });
  it("rechaza ciphertext alterado (auth tag)", () => {
    const enc = encryptCreds({ a: "b" });
    const tampered = enc.slice(0, -4) + "XXXX";
    expect(() => decryptCreds(tampered)).toThrow();
  });
});
