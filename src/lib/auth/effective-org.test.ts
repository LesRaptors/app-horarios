import { describe, it, expect } from "vitest";
import { computeEffectiveOrgId } from "./effective-org";

describe("computeEffectiveOrgId", () => {
  it("usuario normal: usa su organization_id (ignora activeOrgId)", () => {
    expect(computeEffectiveOrgId("org-1", "org-9")).toBe("org-1");
  });
  it("super_admin (org null) con tenant activo: usa activeOrgId", () => {
    expect(computeEffectiveOrgId(null, "org-9")).toBe("org-9");
  });
  it("super_admin sin tenant activo: null", () => {
    expect(computeEffectiveOrgId(null, null)).toBeNull();
  });
});
