import { describe, it, expect } from "vitest";
import { computeIntegrityHash } from "./integrity-hash";

describe("computeIntegrityHash", () => {
  it("vector conocido Wompi", () => {
    const hash = computeIntegrityHash({
      reference: "sk8-438k4-xmxm392-sn2m24",
      amountInCents: 9000000,
      currency: "COP",
      integritySecret: "prod_integrity_Z5mMke9x0k8gpErbDqwrJXMqsI6SFli6",
    });
    expect(hash).toBe("d55661ed0babe73eceb5402ec918f24026ba5a663203854d283c4b35caa28bef");
  });

  it("inputs distintos producen hashes distintos", () => {
    const h1 = computeIntegrityHash({ reference: "a", amountInCents: 100, currency: "COP", integritySecret: "s" });
    const h2 = computeIntegrityHash({ reference: "a", amountInCents: 200, currency: "COP", integritySecret: "s" });
    expect(h1).not.toBe(h2);
  });

  it("hash es de 64 chars (SHA256 hex)", () => {
    const h = computeIntegrityHash({ reference: "r", amountInCents: 1, currency: "COP", integritySecret: "s" });
    expect(h).toMatch(/^[a-f0-9]{64}$/);
  });
});
