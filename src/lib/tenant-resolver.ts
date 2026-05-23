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

// Root domain de producción (configurable via env para staging/preview futuros).
// Default `tushorarios.com` para que el código funcione sin override en prod.
export const PROD_ROOT_DOMAIN =
  process.env.NEXT_PUBLIC_ROOT_DOMAIN || "tushorarios.com";

// Lista en orden de match (prod primero, dev después). Tuple `as const` evita
// allocation por request en hot-path. Mantener en sync con KNOWN_ROOT_DOMAINS.
const KNOWN_ROOT_DOMAINS_LIST = [
  PROD_ROOT_DOMAIN,
  "lvh.me",
  "localhost",
] as const;

// Sufijos pre-computados con el "." para evitar concatenation por iteración.
const KNOWN_ROOT_DOMAINS_SUFFIXED = KNOWN_ROOT_DOMAINS_LIST.map(
  (root) => "." + root
);

// Set para O(1) membership desde otros módulos (urls.ts isLocalRootDomain).
export const KNOWN_ROOT_DOMAINS = new Set<string>(KNOWN_ROOT_DOMAINS_LIST);

export type SubdomainExtraction = {
  subdomain: string | null;
  rootDomain: string | null;
};

export function isReservedSlug(slug: string): boolean {
  return RESERVED_SLUGS.has(slug.toLowerCase());
}

export function isProdRootDomain(rootDomain: string | null): boolean {
  return rootDomain === PROD_ROOT_DOMAIN;
}

export function extractSubdomain(host: string): SubdomainExtraction {
  if (!host) return { subdomain: null, rootDomain: null };

  // Strip port
  const hostWithoutPort = host.split(":")[0].toLowerCase();

  // Reject IP literals (no soportadas como root)
  if (/^\d+\.\d+\.\d+\.\d+$/.test(hostWithoutPort)) {
    return { subdomain: null, rootDomain: null };
  }

  // Match against known root domains (tupla const, sin allocation per call)
  for (let i = 0; i < KNOWN_ROOT_DOMAINS_LIST.length; i++) {
    const root = KNOWN_ROOT_DOMAINS_LIST[i];
    if (hostWithoutPort === root) {
      return { subdomain: null, rootDomain: root };
    }
    const suffix = KNOWN_ROOT_DOMAINS_SUFFIXED[i];
    if (hostWithoutPort.endsWith(suffix)) {
      return {
        subdomain: hostWithoutPort.slice(0, -suffix.length),
        rootDomain: root,
      };
    }
  }

  return { subdomain: null, rootDomain: null };
}
