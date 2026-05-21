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

  const { data, error } = await supabase
    .from("organizations")
    .select("id, slug")
    .eq("slug", key)
    .maybeSingle();

  if (error) {
    console.error("[tenant-cache] DB error resolving slug:", error);
    return null;
  }

  const value = data ?? null;
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
