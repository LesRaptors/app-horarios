import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "./database.types";
import {
  extractSubdomain,
  isProdRootDomain,
  isReservedSlug,
} from "@/lib/tenant-resolver";
import { resolveSlugCached } from "@/lib/tenant-cache";
import { buildRootUrl, buildTenantUrl } from "@/lib/urls";

const PUBLIC_PATHS = ["/", "/gracias", "/forgot-password"];
const PUBLIC_PREFIXES = ["/login", "/auth"];

function isPublicPath(path: string): boolean {
  if (PUBLIC_PATHS.includes(path)) return true;
  return PUBLIC_PREFIXES.some((p) => path.startsWith(p));
}

export async function updateSession(request: NextRequest) {
  const host = request.headers.get("host") ?? "";
  const { subdomain, rootDomain } = extractSubdomain(host);
  const path = request.nextUrl.pathname;
  const search = request.nextUrl.search;
  const port = request.nextUrl.port || null;

  // Hoists: cada predicate se evalúa UNA vez por request, no por cada uso.
  const isProd = isProdRootDomain(rootDomain);
  const subdomainReserved = subdomain ? isReservedSlug(subdomain) : false;
  const pathIsPublic = isPublicPath(path);

  // Cookie domain: prod → .tushorarios.com, dev/preview → undefined (host actual).
  // Trade-off intencional: .tushorarios.com permite UNA sesión compartida entre raíz
  // y subdomain del mismo user (UX seamless tras login centralizado). La seguridad
  // cross-tenant NO depende del scope de cookie sino de:
  //   (1) R7 (redirect silencioso si user accede a subdomain de otro tenant)
  //   (2) RLS Postgres por organization_id (barrera real, OWASP BOLA mitigation)
  const cookieDomain = isProd ? ".tushorarios.com" : undefined;

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

  // Paralelizar getUser + resolveSlugCached. No tienen dependencia entre sí;
  // hacerlas en serie suma ~50-100ms p95 en cache miss (DB roundtrip x2).
  const tenantOrgP =
    subdomain && !subdomainReserved
      ? resolveSlugCached(subdomain, supabase).catch((err) => {
          console.error("[middleware] tenant resolve failed:", err);
          // Treat-as-root: no bloqueamos navegación
          return null;
        })
      : Promise.resolve(null);
  const userP = supabase.auth.getUser();

  const [tenantOrg, userResult] = await Promise.all([tenantOrgP, userP]);
  const user = userResult.data.user;

  // =============================================================================
  // R1. www.tushorarios.com → apex (canonicalize, solo prod)
  // =============================================================================
  if (subdomain === "www" && isProd && rootDomain) {
    return NextResponse.redirect(
      `https://${rootDomain}${path}${search}`,
      308
    );
  }

  // =============================================================================
  // R3. Subdomain en URL pero NO existe org (slug fantasma) → redirect a apex.
  //     Path se descarta intencionalmente: el slug fantasma puede ser de un
  //     attacker enumerando, o un typo. Si era typo, el usuario ve la landing
  //     y elige su workspace. Preservar path filtraría info ("/dashboard
  //     existe en el sistema") sin beneficio UX claro.
  //     (R2 — reserved — se trata como raíz, sigue al resto del flow)
  // =============================================================================
  if (subdomain && !subdomainReserved && !tenantOrg && rootDomain) {
    return NextResponse.redirect(buildRootUrl("/", rootDomain, port), 308);
  }

  // Fetch profile + org slug (1 query con join) si hay user.
  // No se paraleliza con getUser porque depende de user.id.
  let profile: {
    role: string;
    organization_id: string | null;
    org_slug: string | null;
    org_status: string | null;
    onboarding_completed_at: string | null;
    onboarding_step: string | null;
  } | null = null;

  if (user) {
    // FK explícita evita PGRST201: hay dos relaciones profiles↔organizations
    // (profiles_org_fk + organizations_approved_by_fkey desde migration 042).
    // Sin disambiguar, .maybeSingle silenciosamente cae a null → R5/R6/R7 NO disparan.
    const { data } = await supabase
      .from("profiles")
      .select(
        "role, organization_id, organizations!profiles_org_fk(slug, status, onboarding_completed_at, onboarding_step)"
      )
      .eq("id", user.id)
      .maybeSingle();

    if (data) {
      // FK profiles_org_fk es isOneToOne: false → Supabase types join como array
      type OrgJoin = {
        slug: string | null;
        status: string | null;
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
        org_status: org?.status ?? null,
        onboarding_completed_at: org?.onboarding_completed_at ?? null,
        onboarding_step: org?.onboarding_step ?? null,
      };
    }
  }

  // =============================================================================
  // R5. Super_admin entró a un subdomain → redirect a raíz (panel super_admin)
  // =============================================================================
  if (user && profile?.role === "super_admin" && tenantOrg && rootDomain) {
    return NextResponse.redirect(
      buildRootUrl("/super-admin", rootDomain, port),
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
    !pathIsPublic &&
    rootDomain
  ) {
    return NextResponse.redirect(
      buildTenantUrl(profile.org_slug, `${path}${search}`, rootDomain, port),
      308
    );
  }

  // =============================================================================
  // R7. User logueado en subdomain INCORRECTO → 308 silencioso al correcto.
  //     `!subdomainReserved` redundante (tenantOrg solo se resuelve si
  //     no-reserved arriba) — aserción explícita por defensa anti-drift.
  // =============================================================================
  if (
    user &&
    profile &&
    profile.role !== "super_admin" &&
    tenantOrg &&
    subdomain &&
    !subdomainReserved &&
    profile.organization_id !== tenantOrg.id &&
    profile.org_slug &&
    rootDomain
  ) {
    return NextResponse.redirect(
      buildTenantUrl(profile.org_slug, `${path}${search}`, rootDomain, port),
      308
    );
  }

  // =============================================================================
  // R8. Subdomain válido + NO logueado + path / → /login del subdomain
  // =============================================================================
  if (tenantOrg && !user && path === "/" && rootDomain) {
    return NextResponse.redirect(
      buildTenantUrl(tenantOrg.slug, "/login", rootDomain, port),
      308
    );
  }

  // =============================================================================
  // R9. Lógica existente — auth/onboarding (sin cambios estructurales)
  // =============================================================================
  if (!user && !pathIsPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  if (user && path.startsWith("/login")) {
    const url = request.nextUrl.clone();
    url.pathname =
      profile?.role === "super_admin" ? "/super-admin" : "/dashboard";
    return NextResponse.redirect(url);
  }

  // Onboarding redirect existente (super_admin bypass)
  if (
    user &&
    !path.startsWith("/onboarding") &&
    !path.startsWith("/auth") &&
    !pathIsPublic &&
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

  // =============================================================================
  // R11. super_admin sin tenant activo en ruta operativa → al panel.
  //      En modo panel (sin super_admin_active_org) el super_admin no debe sentarse
  //      sobre rutas operativas multi-tenant. Las rutas de plataforma
  //      (/super-admin, /admin) y públicas/API se excluyen → sin loop: en
  //      /super-admin el guard se salta por el startsWith check.
  // =============================================================================
  if (
    user &&
    profile?.role === "super_admin" &&
    !path.startsWith("/super-admin") &&
    !path.startsWith("/admin") &&
    !path.startsWith("/api/") &&
    !pathIsPublic
  ) {
    const { data: saao } = await supabase
      .from("super_admin_active_org")
      .select("active_org_id")
      .eq("user_id", user.id)
      .maybeSingle();
    if (!saao) {
      const url = request.nextUrl.clone();
      url.pathname = "/super-admin";
      return NextResponse.redirect(url);
    }
  }

  // =============================================================================
  // R10. Org pausada → bloquea TODO excepto /facturacion + /api/* + public paths.
  //      Se lee organizations.status (NO subscriptions.status) porque la RLS de
  //      subscriptions es admin-only (subs_org_admin) → para manager/employee el
  //      SELECT devolvía 0 filas y R10 nunca disparaba (solo bloqueaba al admin).
  //      organizations.status es legible por TODOS los miembros vía organizations_select
  //      y el cron de reminders lo setea en lockstep con la suscripción al pausar.
  //      Además el org row YA viene en el join del profile fetch → cero query extra.
  //      Flag-gated: si BILLING_ENABLED != "true" es un no-op completo. T27 enciende.
  //      Corre DESPUÉS de R9 a propósito: si la org tampoco terminó onboarding,
  //      R9 ya redirigió a /onboarding antes de llegar aquí (onboarding precede).
  //      Invariante billing_exempt: una org exenta (ej. LR) NUNCA llega a
  //      status="paused" — el cron la salta. Por eso basta chequear status==="paused".
  //      super_admin no entra: tiene organization_id null (o lo maneja R5).
  // =============================================================================
  if (
    process.env.BILLING_ENABLED === "true" &&
    user &&
    profile?.organization_id &&
    profile.org_status === "paused" &&
    !path.startsWith("/facturacion") &&
    !path.startsWith("/api/") &&
    !pathIsPublic
  ) {
    // clone() preserva host/subdomain → tenant pausado en acme.tushorarios.com
    // aterriza en acme.tushorarios.com/facturacion, no en el apex.
    const url = request.nextUrl.clone();
    url.pathname = "/facturacion";
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}
