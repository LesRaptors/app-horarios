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
  if (!host) return { subdomain: null, rootDomain: null };

  // Strip port
  const hostWithoutPort = host.split(":")[0].toLowerCase();

  // Reject IP literals (no soportadas como root)
  if (/^\d+\.\d+\.\d+\.\d+$/.test(hostWithoutPort)) {
    return { subdomain: null, rootDomain: null };
  }

  // Match against known root domains
  for (const root of KNOWN_ROOT_DOMAINS) {
    if (hostWithoutPort === root) {
      // Apex (sin subdomain)
      return { subdomain: null, rootDomain: root };
    }
    if (hostWithoutPort.endsWith("." + root)) {
      const subdomain = hostWithoutPort.slice(0, -("." + root).length);
      return { subdomain, rootDomain: root };
    }
  }

  return { subdomain: null, rootDomain: null };
}
