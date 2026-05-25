import { describe, it, expect } from "vitest";
import { decideDunningAction } from "./dunning";

describe("decideDunningAction", () => {
  it("trialing T-3 → email trial-ending", () => {
    const sub = { status: "trialing", current_period_end: "2026-05-27T00:00:00Z" } as any;
    const now = new Date("2026-05-24T00:00:00Z");
    expect(decideDunningAction(sub, now)).toEqual({ kind: "email", template: "trial-ending", daysOffset: -3 });
  });
  it("trialing T-1 → email trial-ending", () => {
    const sub = { status: "trialing", current_period_end: "2026-05-25T00:00:00Z" } as any;
    const now = new Date("2026-05-24T00:00:00Z");
    expect(decideDunningAction(sub, now)).toEqual({ kind: "email", template: "trial-ending", daysOffset: -1 });
  });
  it("trialing T0 → transition past_due", () => {
    const sub = { status: "trialing", current_period_end: "2026-05-24T00:00:00Z" } as any;
    const now = new Date("2026-05-24T00:00:01Z");
    expect(decideDunningAction(sub, now)).toEqual({ kind: "transition", to: "past_due" });
  });
  it("past_due T+1 → email payment-failed", () => {
    const sub = { status: "past_due", current_period_end: "2026-05-23T00:00:00Z" } as any;
    const now = new Date("2026-05-24T00:00:00Z");
    expect(decideDunningAction(sub, now)).toEqual({ kind: "email", template: "payment-failed", daysOffset: 1 });
  });
  it("past_due T+5 → email pause-warning", () => {
    const sub = { status: "past_due", current_period_end: "2026-05-19T00:00:00Z" } as any;
    const now = new Date("2026-05-24T00:00:00Z");
    expect(decideDunningAction(sub, now)).toEqual({ kind: "email", template: "pause-warning", daysOffset: 5 });
  });
  it("past_due T+8 → transition paused", () => {
    const sub = { status: "past_due", current_period_end: "2026-05-16T00:00:00Z" } as any;
    const now = new Date("2026-05-24T00:00:00Z");
    expect(decideDunningAction(sub, now)).toEqual({ kind: "transition", to: "paused" });
  });
  it("active → null (no action)", () => {
    const sub = { status: "active", current_period_end: "2026-06-24T00:00:00Z" } as any;
    expect(decideDunningAction(sub, new Date("2026-05-24"))).toBeNull();
  });
  it("trialing T-2 → null (no reminder ese día)", () => {
    const sub = { status: "trialing", current_period_end: "2026-05-26T00:00:00Z" } as any;
    expect(decideDunningAction(sub, new Date("2026-05-24"))).toBeNull();
  });
});
