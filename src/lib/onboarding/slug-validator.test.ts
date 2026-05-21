import { describe, it, expect } from "vitest";
import { isValidSlug, sanitizeSlug } from "./slug-validator";

describe("isValidSlug", () => {
  it("acepta lowercase + numbers + hyphen", () => expect(isValidSlug("test-empresa-1")).toBe(true));
  it("acepta solo lowercase", () => expect(isValidSlug("acme")).toBe(true));
  it("rechaza uppercase", () => expect(isValidSlug("Acme")).toBe(false));
  it("rechaza espacios", () => expect(isValidSlug("acme corp")).toBe(false));
  it("rechaza < 3 chars", () => expect(isValidSlug("ab")).toBe(false));
  it("rechaza > 50 chars", () => expect(isValidSlug("a".repeat(51))).toBe(false));
  it("rechaza chars especiales", () => expect(isValidSlug("acme!")).toBe(false));
  it("rechaza tildes", () => expect(isValidSlug("clínica")).toBe(false));
});

describe("sanitizeSlug", () => {
  it("convierte uppercase a lowercase", () => expect(sanitizeSlug("Acme Corp")).toBe("acme-corp"));
  it("remueve tildes", () => expect(sanitizeSlug("Clínica Salud")).toBe("clinica-salud"));
  it("colapsa espacios consecutivos", () => expect(sanitizeSlug("Mi   Empresa")).toBe("mi-empresa"));
  it("remueve chars especiales", () => expect(sanitizeSlug("Acme!@#")).toBe("acme"));
  it("trim hyphens al inicio/fin", () => expect(sanitizeSlug("--acme--")).toBe("acme"));
});
