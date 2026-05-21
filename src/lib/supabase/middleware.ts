import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "./database.types";
import { extractSubdomain, isReservedSlug } from "@/lib/tenant-resolver";
import { resolveSlugCached } from "@/lib/tenant-cache";

const PUBLIC_PATHS = ["/", "/gracias", "/forgot-password"];
const PUBLIC_PREFIXES = ["/login", "/auth"];

function isPublicPath(path: string): boolean {
  if (PUBLIC_PATHS.includes(path)) return true;
  return PUBLIC_PREFIXES.some((p) => path.startsWith(p));
}

function isProdRootDomain(rootDomain: string | null): boolean {
  return rootDomain === "tushorarios.com";
}

export async function updateSession(request: NextRequest) {
  const host = request.headers.get("host") ?? "";
  const { subdomain, rootDomain } = extractSubdomain(host);
  const path = request.nextUrl.pathname;
  const search = request.nextUrl.search;

  // Cookie domain: prod → .tushorarios.com, dev/preview → undefined (host actual)
  const cookieDomain = isProdRootDomain(rootDomain)
    ? ".tushorarios.com"
    : undefined;

  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(
          cookiesToSet: {
            name: string;
            value: string;
            options?: Record<string, unknown>;
          }[]
        ) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => {
            const withDomain = cookieDomain
              ? { ...options, domain: cookieDomain }
              : options;
            supabaseResponse.cookies.set(name, value, withDomain);
          });
        },
      },
    }
  );

  // Resolver tenant del subdomain (si aplica y no es reserved)
  let tenantOrg: { id: string; slug: string } | null = null;
  if (subdomain && !isReservedSlug(subdomain)) {
    try {
      tenantOrg = await resolveSlugCached(subdomain, supabase);
    } catch (err) {
      console.error("[middleware] tenant resolve failed:", err);
      // Treat-as-root: no bloqueamos navegación
    }
  }

  // Helpers para construir URLs de redirect
  const proto = isProdRootDomain(rootDomain) ? "https" : "http";
  const portStr = request.nextUrl.port;
  const portSuffix =
    !isProdRootDomain(rootDomain) && portStr ? `:${portStr}` : "";

  // =============================================================================
  // R1. www.tushorarios.com → apex (canonicalize, solo prod)
  // =============================================================================
  if (subdomain === "www" && isProdRootDomain(rootDomain)) {
    return NextResponse.redirect(
      `https://${rootDomain}${path}${search}`,
      308
    );
  }

  // =============================================================================
  // R3. Subdomain en URL pero NO existe org (slug fantasma) → redirect a apex
  //     (R2 — reserved — se trata como raíz, sigue al resto del flow)
  // =============================================================================
  if (subdomain && !isReservedSlug(subdomain) && !tenantOrg && rootDomain) {
    return NextResponse.redirect(`${proto}://${rootDomain}${portSuffix}/`, 308);
  }

  // =============================================================================
  // Auth: getUser para resto de reglas
  // =============================================================================
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Fetch profile + org slug (1 query con join) si hay user
  let profile: {
    role: string;
    organization_id: string | null;
    org_slug: string | null;
    onboarding_completed_at: string | null;
    onboarding_step: string | null;
  } | null = null;

  if (user) {
    const { data } = await supabase
      .from("profiles")
      .select(
        "role, organization_id, organizations(slug, onboarding_completed_at, onboarding_step)"
      )
      .eq("id", user.id)
      .maybeSingle();

    if (data) {
      // FK profiles_org_fk is isOneToOne: false → Supabase types join as array
      type OrgJoin = {
        slug: string | null;
        onboarding_completed_at: string | null;
        onboarding_step: string | null;
      };
      const orgRaw = (
        data as unknown as { organizations: OrgJoin | OrgJoin[] | null }
      ).organizations;
      const org: OrgJoin | null = Array.isArray(orgRaw)
        ? (orgRaw[0] ?? null)
        : (orgRaw ?? null);

      profile = {
        role: data.role,
        organization_id: data.organization_id,
        org_slug: org?.slug ?? null,
        onboarding_completed_at: org?.onboarding_completed_at ?? null,
        onboarding_step: org?.onboarding_step ?? null,
      };
    }
  }

  // =============================================================================
  // R5. Super_admin entró a un subdomain → redirect a raíz (landing super_admin)
  // =============================================================================
  if (user && profile?.role === "super_admin" && tenantOrg && rootDomain) {
    return NextResponse.redirect(
      `${proto}://${rootDomain}${portSuffix}/admin/demo-requests`,
      308
    );
  }

  // =============================================================================
  // R6. User logueado en raíz con ruta autenticada → 308 a su subdomain
  // =============================================================================
  if (
    user &&
    profile &&
    profile.role !== "super_admin" &&
    profile.organization_id &&
    profile.org_slug &&
    !subdomain &&
    path !== "/" &&
    !isPublicPath(path) &&
    rootDomain
  ) {
    return NextResponse.redirect(
      `${proto}://${profile.org_slug}.${rootDomain}${portSuffix}${path}${search}`,
      308
    );
  }

  // =============================================================================
  // R7. User logueado en subdomain INCORRECTO → 308 silencioso al correcto
  // =============================================================================
  if (
    user &&
    profile &&
    profile.role !== "super_admin" &&
    tenantOrg &&
    profile.organization_id !== tenantOrg.id &&
    profile.org_slug &&
    rootDomain
  ) {
    return NextResponse.redirect(
      `${proto}://${profile.org_slug}.${rootDomain}${portSuffix}${path}${search}`,
      308
    );
  }

  // =============================================================================
  // R8. Subdomain válido + NO logueado + path / → /login del subdomain
  // =============================================================================
  if (tenantOrg && !user && path === "/" && rootDomain) {
    return NextResponse.redirect(
      `${proto}://${tenantOrg.slug}.${rootDomain}${portSuffix}/login`,
      308
    );
  }

  // =============================================================================
  // R9. Lógica existente — auth/onboarding (sin cambios estructurales)
  // =============================================================================
  if (!user && !isPublicPath(path)) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  if (user && path.startsWith("/login")) {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    return NextResponse.redirect(url);
  }

  // Onboarding redirect existente (super_admin bypass)
  if (
    user &&
    !path.startsWith("/onboarding") &&
    !path.startsWith("/auth") &&
    !isPublicPath(path) &&
    profile &&
    profile.role !== "super_admin" &&
    profile.organization_id &&
    !profile.onboarding_completed_at
  ) {
    const step = profile.onboarding_step ?? "empresa";
    const url = request.nextUrl.clone();
    url.pathname = `/onboarding/${step}`;
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}
