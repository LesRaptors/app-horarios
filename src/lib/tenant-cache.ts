// src/lib/tenant-cache.ts
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./supabase/database.types";

type CachedOrg = {
  value: { id: string; slug: string } | null;
  expiresAt: number;
};

const TTL_MS = 60_000;

const cache = new Map<string, CachedOrg>();

let nowFn: () => number = () => Date.now();

export async function resolveSlugCached(
  slug: string,
  supabase: SupabaseClient<Database>
): Promise<{ id: string; slug: string } | null> {
  const key = slug.toLowerCase();
  const now = nowFn();
  const cached = cache.get(key);

  if (cached && cached.expiresAt > now) {
    return cached.value;
  }

  // RPC SECURITY DEFINER bypassa RLS de organizations (necesario porque el
  // middleware corre sin sesión cuando un visitor entra a un subdomain).
  // get_org_by_slug retorna SOLO {id, slug} — sin PII ni datos sensibles.
  const { data, error } = await supabase.rpc("get_org_by_slug", {
    p_slug: key,
  });

  if (error) {
    console.error("[tenant-cache] DB error resolving slug:", error);
    return null;
  }

  // RPC retorna setof TABLE → array, tomamos el primer row (UNIQUE constraint
  // garantiza max 1).
  const row = Array.isArray(data) ? data[0] : null;
  const value = row ? { id: row.id, slug: row.slug } : null;
  cache.set(key, { value, expiresAt: now + TTL_MS });
  return value;
}

// Test-only helpers
export function __resetCacheForTests(): void {
  cache.clear();
}

export function __setNowForTests(ms: number): void {
  nowFn = () => ms;
}
