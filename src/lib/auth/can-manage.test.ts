import { describe, it, expect } from "vitest";
import { canManage, canAdmin, isSuperAdmin } from "./can-manage";

describe("canManage", () => {
  it("acepta super_admin", () => expect(canManage("super_admin")).toBe(true));
  it("acepta admin", () => expect(canManage("admin")).toBe(true));
  it("acepta manager", () => expect(canManage("manager")).toBe(true));
  it("rechaza employee", () => expect(canManage("employee")).toBe(false));
  it("rechaza null", () => expect(canManage(null)).toBe(false));
  it("rechaza undefined", () => expect(canManage(undefined)).toBe(false));
});

describe("canAdmin", () => {
  it("acepta super_admin", () => expect(canAdmin("super_admin")).toBe(true));
  it("acepta admin", () => expect(canAdmin("admin")).toBe(true));
  it("rechaza manager", () => expect(canAdmin("manager")).toBe(false));
  it("rechaza employee", () => expect(canAdmin("employee")).toBe(false));
  it("rechaza null", () => expect(canAdmin(null)).toBe(false));
});

describe("isSuperAdmin", () => {
  it("acepta super_admin", () => expect(isSuperAdmin("super_admin")).toBe(true));
  it("rechaza admin", () => expect(isSuperAdmin("admin")).toBe(false));
  it("rechaza manager", () => expect(isSuperAdmin("manager")).toBe(false));
  it("rechaza employee", () => expect(isSuperAdmin("employee")).toBe(false));
  it("rechaza null", () => expect(isSuperAdmin(null)).toBe(false));
});
