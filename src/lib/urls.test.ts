import { describe, it, expect } from "vitest";
import { buildTenantUrl } from "./urls";

describe("buildTenantUrl", () => {
  it("prod tushorarios.com — construye URL con subdomain", () => {
    expect(buildTenantUrl("acme", "/dashboard", "tushorarios.com")).toBe(
      "https://acme.tushorarios.com/dashboard"
    );
  });

  it("dev lvh.me — usa http (no https)", () => {
    expect(buildTenantUrl("acme", "/dashboard", "lvh.me", 3000)).toBe(
      "http://acme.lvh.me:3000/dashboard"
    );
  });

  it("path sin slash inicial — agrega slash", () => {
    expect(buildTenantUrl("acme", "dashboard", "tushorarios.com")).toBe(
      "https://acme.tushorarios.com/dashboard"
    );
  });

  it("path con query string — preserva", () => {
    expect(
      buildTenantUrl("acme", "/login?next=/employees", "tushorarios.com")
    ).toBe("https://acme.tushorarios.com/login?next=/employees");
  });
});
