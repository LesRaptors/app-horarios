// src/lib/tenant-resolver.ts

export const RESERVED_SLUGS = new Set<string>([
  "www",
  "admin",
  "api",
  "app",
  "auth",
  "mail",
  "static",
]);

export const KNOWN_ROOT_DOMAINS = new Set<string>([
  "tushorarios.com",
  "lvh.me",
  "localhost",
]);

export type SubdomainExtraction = {
  subdomain: string | null;
  rootDomain: string | null;
};

export function isReservedSlug(slug: string): boolean {
  return RESERVED_SLUGS.has(slug.toLowerCase());
}

export function extractSubdomain(host: string): SubdomainExtraction {
  // Placeholder — implementation in Task 1.4
  return { subdomain: null, rootDomain: null };
}
