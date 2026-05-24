import { describe, it, expect } from "vitest";
import { verifyWompiWebhook, type WompiWebhookPayload } from "./webhook-verify";

const SECRET = "test_events_xxxxx";
const RECENT_TS = Math.floor(Date.now() / 1000);

function makePayload(checksum: string, ts: number = RECENT_TS): WompiWebhookPayload {
  return {
    event: "transaction.updated",
    data: { transaction: { id: "tx-1", status: "APPROVED", amount_in_cents: 100000, currency: "COP" } },
    timestamp: ts,
    signature: { properties: ["transaction.id", "transaction.status", "transaction.amount_in_cents"], checksum },
  };
}

describe("verifyWompiWebhook", () => {
  it("payload válido pasa", () => {
    // Computa el checksum esperado con el TS actual
    const { createHash } = require("crypto");
    const expected = createHash("sha256")
      .update(`tx-1APPROVED100000${RECENT_TS}${SECRET}`)
      .digest("hex");
    expect(verifyWompiWebhook(makePayload(expected), SECRET)).toBe(true);
  });

  it("checksum incorrecto falla", () => {
    expect(verifyWompiWebhook(makePayload("0".repeat(64)), SECRET)).toBe(false);
  });

  it("missing signature falla", () => {
    expect(verifyWompiWebhook({} as never, SECRET)).toBe(false);
  });

  it("timestamp >30 días falla (anti-replay)", () => {
    const ancient = 1;
    expect(verifyWompiWebhook(makePayload("0".repeat(64), ancient), SECRET)).toBe(false);
  });

  it("missing property en data falla", () => {
    const payload = makePayload("0".repeat(64));
    payload.signature.properties = ["transaction.nonexistent"];
    expect(verifyWompiWebhook(payload, SECRET)).toBe(false);
  });
});
