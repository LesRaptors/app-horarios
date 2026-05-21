// src/lib/tenant-resolver.test.ts
import { describe, it, expect } from "vitest";
import {
  isReservedSlug,
  extractSubdomain,
  RESERVED_SLUGS,
  KNOWN_ROOT_DOMAINS,
} from "./tenant-resolver";

describe("isReservedSlug", () => {
  it.each([
    ["admin", true],
    ["api", true],
    ["www", true],
    ["app", true],
    ["auth", true],
    ["mail", true],
    ["static", true],
  ])("'%s' es reserved → %s", (slug, expected) => {
    expect(isReservedSlug(slug)).toBe(expected);
  });

  it.each([
    ["acme", false],
    ["lr", false],
    ["empresa-test", false],
    ["", false],
  ])("'%s' no es reserved → %s", (slug, expected) => {
    expect(isReservedSlug(slug)).toBe(expected);
  });

  it("case insensitive — 'Admin' es reserved", () => {
    expect(isReservedSlug("Admin")).toBe(true);
  });

  it("case insensitive — 'WWW' es reserved", () => {
    expect(isReservedSlug("WWW")).toBe(true);
  });
});

describe("extractSubdomain", () => {
  it("acme.tushorarios.com → subdomain=acme, rootDomain=tushorarios.com", () => {
    expect(extractSubdomain("acme.tushorarios.com")).toEqual({
      subdomain: "acme",
      rootDomain: "tushorarios.com",
    });
  });

  it("tushorarios.com (apex) → subdomain=null, rootDomain=tushorarios.com", () => {
    expect(extractSubdomain("tushorarios.com")).toEqual({
      subdomain: null,
      rootDomain: "tushorarios.com",
    });
  });

  it("www.tushorarios.com → subdomain=www", () => {
    expect(extractSubdomain("www.tushorarios.com")).toEqual({
      subdomain: "www",
      rootDomain: "tushorarios.com",
    });
  });

  it("acme.lvh.me:3000 → subdomain=acme, rootDomain=lvh.me (strip port)", () => {
    expect(extractSubdomain("acme.lvh.me:3000")).toEqual({
      subdomain: "acme",
      rootDomain: "lvh.me",
    });
  });

  it("lvh.me:3000 (apex local) → subdomain=null", () => {
    expect(extractSubdomain("lvh.me:3000")).toEqual({
      subdomain: null,
      rootDomain: "lvh.me",
    });
  });

  it("localhost:3000 → subdomain=null, rootDomain=localhost", () => {
    expect(extractSubdomain("localhost:3000")).toEqual({
      subdomain: null,
      rootDomain: "localhost",
    });
  });

  it("acme.localhost:3000 → subdomain=acme, rootDomain=localhost", () => {
    expect(extractSubdomain("acme.localhost:3000")).toEqual({
      subdomain: "acme",
      rootDomain: "localhost",
    });
  });

  it("app-horarios-mauve.vercel.app → rootDomain=null (no en KNOWN_ROOT_DOMAINS)", () => {
    expect(extractSubdomain("app-horarios-mauve.vercel.app")).toEqual({
      subdomain: null,
      rootDomain: null,
    });
  });

  it("preview-deploy-xyz.vercel.app → null", () => {
    expect(extractSubdomain("preview-deploy-xyz.vercel.app")).toEqual({
      subdomain: null,
      rootDomain: null,
    });
  });

  it("host vacío → null", () => {
    expect(extractSubdomain("")).toEqual({
      subdomain: null,
      rootDomain: null,
    });
  });

  it("acme.dev.tushorarios.com (multi-level) → toma primer label como subdomain", () => {
    expect(extractSubdomain("acme.dev.tushorarios.com")).toEqual({
      subdomain: "acme.dev",
      rootDomain: "tushorarios.com",
    });
  });

  it("IP literal 192.168.1.1:3000 → null", () => {
    expect(extractSubdomain("192.168.1.1:3000")).toEqual({
      subdomain: null,
      rootDomain: null,
    });
  });

  it("case insensitive — ACME.TUSHORARIOS.COM → subdomain=acme", () => {
    expect(extractSubdomain("ACME.TUSHORARIOS.COM")).toEqual({
      subdomain: "acme",
      rootDomain: "tushorarios.com",
    });
  });
});
