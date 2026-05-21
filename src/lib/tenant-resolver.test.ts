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
