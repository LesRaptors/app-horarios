// src/lib/urls.ts

const LOCAL_ROOT_DOMAINS = new Set(["lvh.me", "localhost"]);

export function buildTenantUrl(
  slug: string,
  path: string,
  rootDomain: string,
  port?: number
): string {
  const isLocal = LOCAL_ROOT_DOMAINS.has(rootDomain);
  const protocol = isLocal ? "http" : "https";
  const portSuffix = port ? `:${port}` : "";
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${protocol}://${slug}.${rootDomain}${portSuffix}${normalizedPath}`;
}
