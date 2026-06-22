import { describe, it, expect, vi } from "vitest";
import { resolveEffectiveOrgId } from "./resolve-effective-org";

/**
 * Fake del admin client: solo implementa la cadena
 * .from("super_admin_active_org").select(...).eq(...).maybeSingle()
 * que usa el resolver. `row` es lo que devuelve maybeSingle.
 */
function fakeAdmin(row: { active_org_id: string } | null) {
  const maybeSingle = vi.fn().mockResolvedValue({ data: row, error: null });
  const eq = vi.fn().mockReturnValue({ maybeSingle });
  const select = vi.fn().mockReturnValue({ eq });
  const from = vi.fn().mockReturnValue({ select });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { client: { from } as any, from, select, eq, maybeSingle };
}

describe("resolveEffectiveOrgId", () => {
  it("usuario normal: devuelve su propia organization_id sin tocar la DB", async () => {
    const fake = fakeAdmin(null);
    const org = await resolveEffectiveOrgId(fake.client, {
      id: "u1",
      role: "admin",
      organization_id: "org-1",
    });
    expect(org).toBe("org-1");
    expect(fake.from).not.toHaveBeenCalled();
  });

  it("super_admin con tenant activo: devuelve la org activa de super_admin_active_org", async () => {
    const fake = fakeAdmin({ active_org_id: "org-9" });
    const org = await resolveEffectiveOrgId(fake.client, {
      id: "sa1",
      role: "super_admin",
      organization_id: null,
    });
    expect(org).toBe("org-9");
    expect(fake.from).toHaveBeenCalledWith("super_admin_active_org");
    expect(fake.eq).toHaveBeenCalledWith("user_id", "sa1");
  });

  it("super_admin sin tenant activo (modo panel): devuelve null", async () => {
    const fake = fakeAdmin(null);
    const org = await resolveEffectiveOrgId(fake.client, {
      id: "sa1",
      role: "super_admin",
      organization_id: null,
    });
    expect(org).toBeNull();
  });
});
