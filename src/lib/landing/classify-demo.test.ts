import { describe, it, expect } from "vitest";
import { classifyDemoSubmission } from "./classify-demo";

describe("classifyDemoSubmission", () => {
  it("email con cuenta -> existing_account (gana sobre pendiente)", () => {
    expect(classifyDemoSubmission(true, "req-1")).toBe("existing_account");
    expect(classifyDemoSubmission(true, null)).toBe("existing_account");
  });
  it("sin cuenta pero con solicitud pendiente -> duplicate_pending", () => {
    expect(classifyDemoSubmission(false, "req-1")).toBe("duplicate_pending");
  });
  it("sin cuenta ni pendiente -> created", () => {
    expect(classifyDemoSubmission(false, null)).toBe("created");
  });
});
