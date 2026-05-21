import { describe, it, expect } from "vitest";
import { WIZARD_STEPS, nextStep, prevStep, isValidStep } from "./wizard-state";

describe("WIZARD_STEPS", () => {
  it("tiene 6 steps + done", () => expect(WIZARD_STEPS.length).toBe(7));
  it("primer step es empresa", () => expect(WIZARD_STEPS[0]).toBe("empresa"));
  it("último step antes de done es team", () => expect(WIZARD_STEPS[5]).toBe("team"));
});

describe("nextStep", () => {
  it("empresa → sede", () => expect(nextStep("empresa")).toBe("sede"));
  it("sede → departments", () => expect(nextStep("sede")).toBe("departments"));
  it("team → done", () => expect(nextStep("team")).toBe("done"));
  it("done → done (idempotente)", () => expect(nextStep("done")).toBe("done"));
});

describe("prevStep", () => {
  it("sede → empresa", () => expect(prevStep("sede")).toBe("empresa"));
  it("empresa → empresa (no va atrás del primero)", () => expect(prevStep("empresa")).toBe("empresa"));
});

describe("isValidStep", () => {
  it("acepta empresa", () => expect(isValidStep("empresa")).toBe(true));
  it("acepta done", () => expect(isValidStep("done")).toBe(true));
  it("rechaza invalid", () => expect(isValidStep("foo")).toBe(false));
});
