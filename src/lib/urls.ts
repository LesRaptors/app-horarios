import { KNOWN_ROOT_DOMAINS, isProdRootDomain } from "./tenant-resolver";

// Derivado de KNOWN_ROOT_DOMAINS para evitar drift si se agrega un staging/preview.
const LOCAL_ROOT_DOMAINS = new Set<string>(
  Array.from(KNOWN_ROOT_DOMAINS).filter((d) => !isProdRootDomain(d))
);

function protoFor(rootDomain: string): "http" | "https" {
  return LOCAL_ROOT_DOMAINS.has(rootDomain) ? "http" : "https";
}

function portSuffixFor(
  rootDomain: string,
  port?: number | string | null
): string {
  if (!port || isProdRootDomain(rootDomain)) return "";
  return `:${port}`;
}

function normalizePath(path: string): string {
  return path.startsWith("/") ? path : `/${path}`;
}

export function buildTenantUrl(
  slug: string,
  path: string,
  rootDomain: string,
  port?: number | string | null
): string {
  return `${protoFor(rootDomain)}://${slug}.${rootDomain}${portSuffixFor(rootDomain, port)}${normalizePath(path)}`;
}

export function buildRootUrl(
  path: string,
  rootDomain: string,
  port?: number | string | null
): string {
  return `${protoFor(rootDomain)}://${rootDomain}${portSuffixFor(rootDomain, port)}${normalizePath(path)}`;
}
