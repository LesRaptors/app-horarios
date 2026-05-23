// src/lib/tenant-cache.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import {
  resolveSlugCached,
  __resetCacheForTests,
  __setNowForTests,
} from "./tenant-cache";

function makeFakeSupabase(rows: Array<{ id: string; slug: string }>) {
  let calls = 0;
  const client = {
    rpc: async (_fn: string, args: { p_slug: string }) => {
      calls++;
      const row = rows.find((r) => r.slug === args.p_slug);
      // RPC retorna setof TABLE → array (vacío si no hay match)
      return { data: row ? [row] : [], error: null };
    },
  };
  return {
    client,
    get callCount() {
      return calls;
    },
  };
}

describe("resolveSlugCached", () => {
  beforeEach(() => {
    __resetCacheForTests();
    __setNowForTests(1_000_000);
  });

  it("cache miss inicial — hace DB query", async () => {
    const fake = makeFakeSupabase([{ id: "org-1", slug: "acme" }]);
    const res = await resolveSlugCached("acme", fake.client as never);
    expect(res).toEqual({ id: "org-1", slug: "acme" });
    expect(fake.callCount).toBe(1);
  });

  it("cache hit dentro del TTL — no hace DB query 2da vez", async () => {
    const fake = makeFakeSupabase([{ id: "org-1", slug: "acme" }]);
    await resolveSlugCached("acme", fake.client as never);
    await resolveSlugCached("acme", fake.client as never);
    expect(fake.callCount).toBe(1);
  });

  it("cache miss después del TTL — re-fetch", async () => {
    const fake = makeFakeSupabase([{ id: "org-1", slug: "acme" }]);
    await resolveSlugCached("acme", fake.client as never);
    __setNowForTests(1_000_000 + 61_000);
    await resolveSlugCached("acme", fake.client as never);
    expect(fake.callCount).toBe(2);
  });

  it("cachea miss (null) — evita DB hits repetidos en ataques", async () => {
    const fake = makeFakeSupabase([]);
    await resolveSlugCached("blablabla", fake.client as never);
    await resolveSlugCached("blablabla", fake.client as never);
    expect(fake.callCount).toBe(1);
  });

  it("retorna null cuando slug no existe", async () => {
    const fake = makeFakeSupabase([]);
    const res = await resolveSlugCached("ghost", fake.client as never);
    expect(res).toBeNull();
  });

  it("slugs distintos cachean independientemente", async () => {
    const fake = makeFakeSupabase([
      { id: "org-1", slug: "acme" },
      { id: "org-2", slug: "wayne" },
    ]);
    await resolveSlugCached("acme", fake.client as never);
    await resolveSlugCached("wayne", fake.client as never);
    expect(fake.callCount).toBe(2);
    await resolveSlugCached("acme", fake.client as never);
    await resolveSlugCached("wayne", fake.client as never);
    expect(fake.callCount).toBe(2);
  });

  it("error de RPC NO se cachea — re-intenta siguiente request", async () => {
    let calls = 0;
    const erroringClient = {
      rpc: async () => {
        calls++;
        return { data: null, error: { message: "DB down", code: "PGRST" } };
      },
    };
    const r1 = await resolveSlugCached("acme", erroringClient as never);
    const r2 = await resolveSlugCached("acme", erroringClient as never);
    expect(r1).toBeNull();
    expect(r2).toBeNull();
    // Si cacheara errors, la 2da llamada usaría cache → calls === 1.
    // Como NO los cachea (spec), ambas hacen RPC → calls === 2.
    expect(calls).toBe(2);
  });
});
