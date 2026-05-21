# Subdomain Routing — Sub-proyecto 5

**Fecha:** 2026-05-21
**Estado:** Spec aprobado, pendiente plan
**Sub-proyecto:** 5 de N (Sub-proyectos previos: 1 email infra, 2 landing, 3 multi-tenant migration, 4 onboarding wizard)
**Autor:** Simon Urrego + Claude

## Resumen ejecutivo

Habilitar acceso por subdomain por tenant (`acme.tushorarios.com`) para el SaaS multi-tenant. Hereda `organizations.slug` ya validado en sub-proy 4. Diseñado para escalar a miles de tenants sin cambios arquitectónicos mayores.

**Decisiones validadas con 30+ fuentes confiables 2025-2026.** Patrón canónico: subdomain routing es el estándar B2B SaaS (Slack, Notion, Linear, Hashnode 35K+ dominios). Implementación basada en Vercel Platforms Starter Kit + Supabase RLS + Vercel Fluid Compute.

## Objetivos

1. `acme.tushorarios.com` resuelve automáticamente a la org "acme"
2. Login centralizado en raíz funciona (backwards compat) + post-auth redirect a subdomain del user
3. Cookie scope `.tushorarios.com` para sesión cross-subdomain seamless
4. RLS Postgres sigue siendo la barrera real de tenant isolation (subdomain es defense-in-depth + UX)
5. Wildcard SSL automático para nuevos tenants sin intervención manual
6. Local dev con `*.lvh.me:3000`
7. Escalabilidad demostrada hasta 10K+ orgs sin re-arquitectura

## No-objetivos (out of scope sub-proyecto 5)

- Custom domains de tenants (`acme.com`) → sub-proy 6+
- Tenant impersonation por super_admin → sub-proy 7+
- Rate limiting per tenant → sub-proy futuro
- Per-tenant branding (logo, colores en landing) → sub-proy futuro
- Subdomain release/migración entre orgs → sub-proy futuro

## Arquitectura general

### Capas

1. **DNS + Vercel domains**:
   - Nameservers migrados de Hostinger a `ns1.vercel-dns.com` / `ns2.vercel-dns.com`
   - Wildcard domain `*.tushorarios.com` registrado en proyecto Vercel
   - Vercel emite cert SSL wildcard automático vía DNS-01 challenge
   - DNS records actuales (MX, SPF, DKIM, DMARC, Resend, A/CNAME apex+www) recreados en Vercel DNS antes de migrar nameservers

2. **Middleware Next.js** (`src/middleware.ts` + `src/lib/supabase/middleware.ts` + helpers nuevos):
   - Intercepta cada request, extrae subdomain del `Host` header
   - Resuelve `slug → organization` con cache module-scope (TTL 60s) + DB fallback
   - Aplica reglas de redirect en orden determinista

3. **Auth cookie scope**:
   - En producción: cookie `domain=.tushorarios.com` para persistir sesión cross-subdomain
   - En dev (`lvh.me`, `localhost`): sin override de domain (default host actual)
   - SameSite=Lax (default Chrome 80+) funciona porque subdomains comparten eTLD+1

### Estrategia de cache para escalar a miles de tenants

**Capa 1 — In-memory module-scope** (`Map<slug, {orgId, expiresAt}>` en módulo del middleware):
- Vercel Fluid Compute reusa instancias warm → cache persiste entre invocations de la misma instancia
- TTL 60s → eventual consistency aceptada (slug changes son operación rara, ocurren solo en `approve_demo_request`)
- Hit ratio esperado >95% post-warm-up
- Cold start: 1 DB hit por instancia por slug (~10-20ms con índice UNIQUE)

**Capa 2 (futuro, sub-proy posterior si miss-rate duele)** — Vercel Runtime Cache:
- KV per-region, sobrevive cold starts
- Tag-based invalidation
- Solo migrar cuando midamos miss rate problemático

**Capa 3 (futuro lejano)** — Vercel Edge Config:
- KV replicado globalmente, lookup sub-1ms
- Justificado solo si tenemos clientes en múltiples regiones con SLA agresivo

**¿Por qué no empezar con Edge Config / Edge Function?**
- DB query con índice UNIQUE B-tree es O(log n) — 10K orgs = ~14 comparaciones, <5ms
- Edge Function intermedia (Supabase) agrega hop + 50-100ms — descartada
- Edge Config requiere sync activo (drift, complejidad) sin ganancia real para volumen actual
- KISS: empezamos con lo más simple que escala, migramos cuando duela

### Tenant isolation: subdomain vs RLS

| Capa | Rol | Falla = |
|---|---|---|
| Subdomain | UX, branding, claridad para el user | User equivocado de URL → redirect silencioso (no es vulnerabilidad) |
| Middleware redirect | Defense-in-depth | Si falla, RLS sigue protegiendo |
| **Supabase RLS por `organization_id`** | **Barrera real de aislamiento** | **Vulnerabilidad crítica si no está bien** |

OWASP marca Broken Object Level Authorization como riesgo #1 en APIs multi-tenant. Subdomain enforcement NO es la barrera — RLS lo es. Sub-proy 3 ya estableció RLS en 27 tablas con 84 policies.

## Reglas de redirect del middleware (orden determinista)

```ts
const host = request.headers.get('host') ?? '';
const { subdomain, rootDomain } = extractSubdomain(host);
const path = request.nextUrl.pathname;
const { data: { user } } = await supabase.auth.getUser();

let tenantOrg: { id: string; slug: string } | null = null;
if (subdomain && !isReservedSlug(subdomain)) {
  tenantOrg = await resolveSlugCached(subdomain, supabase);
}

// R1. Subdomain canonicalize: www → apex (solo en prod)
if (subdomain === 'www' && rootDomain === 'tushorarios.com') {
  return redirect(`https://${rootDomain}${path}`, 308);
}

// R2. Subdomain reservado (admin, api, etc.) → treat-as-root (no rewrite, no redirect)
//     Sigue al resto del flow como si fuera raíz.

// R3. Subdomain existe en URL pero NO existe org → redirect a raíz
if (subdomain && !isReservedSlug(subdomain) && !tenantOrg) {
  return redirect(`https://${rootDomain}/`, 308);
}

// R4. Profile fetch (1 query con join a organizations para obtener slug)
let profile = null;
if (user) {
  profile = await supabase
    .from('profiles')
    .select('role, organization_id, organizations!inner(slug, onboarding_completed_at, onboarding_step)')
    .eq('id', user.id)
    .maybeSingle();
}

// R5. Super_admin en subdomain → redirect a raíz (landing super_admin)
if (user && profile?.role === 'super_admin' && tenantOrg) {
  return redirect(`https://${rootDomain}/admin/demo-requests`, 308);
}

// R6. User logueado en raíz con ruta autenticada → redirect a su subdomain
if (user && profile && profile.role !== 'super_admin' && profile.organization_id && !subdomain && path !== '/' && !isPublic(path)) {
  return redirect(`https://${profile.organizations.slug}.${rootDomain}${path}`, 308);
}

// R7. User logueado en subdomain INCORRECTO → redirect silencioso al correcto
if (user && profile && profile.role !== 'super_admin' && tenantOrg && profile.organization_id !== tenantOrg.id) {
  return redirect(`https://${profile.organizations.slug}.${rootDomain}${path}`, 308);
}

// R8. Subdomain válido + NO logueado + path / → redirect a /login (mantiene subdomain)
if (tenantOrg && !user && path === '/') {
  return redirect(`https://${tenantOrg.slug}.${rootDomain}/login`, 308);
}

// R9. Lógica auth/onboarding existente (sub-proy 4) sin cambios
// ...
```

### Edge cases manejados

| Caso | Comportamiento |
|---|---|
| Apex `tushorarios.com` | Landing pública (marketing group) |
| `www.tushorarios.com` | 308 → apex |
| `*.vercel.app` (preview deploys) | `extractSubdomain` retorna null → treat-as-root |
| `acme.lvh.me:3000` (dev) | Funciona igual que prod, sin cookie domain override |
| Host header vacío | Treat-as-root |
| Slug fantasma | 308 → raíz |
| Slug reserved (admin, api, www) | Treat-as-root |
| Custom domain de tenant futuro | Out of scope sub-proy 5 |
| User logueado con `organization_id = NULL` (huérfano) | Si super_admin → continúa; si no → `/login?error=no_org` |
| DB lookup falla (timeout) | Treat-as-root + log error → no bloquea navegación |

## Componentes nuevos / modificados

### Archivos nuevos

| Archivo | Responsabilidad |
|---|---|
| `src/lib/tenant-resolver.ts` | Funciones puras: `extractSubdomain(host)`, `isReservedSlug(slug)`, constantes `RESERVED_SLUGS`, `KNOWN_ROOT_DOMAINS`. Sin side effects. |
| `src/lib/tenant-cache.ts` | Cache module-scope `Map<slug, CachedOrg>` con TTL. Exporta `resolveSlugCached(slug, supabase): Promise<{id, slug} \| null>`. |
| `src/lib/urls.ts` | Helper `buildTenantUrl(slug, path)` para construir links absolutos al subdomain (emails, redirects post-login). |
| `src/lib/tenant-resolver.test.ts` | Vitest ~20 casos para extracción + reserved. |
| `src/lib/tenant-cache.test.ts` | Vitest ~10 casos para hit, miss, TTL, concurrent. |
| `supabase/tests/reserved_slugs.sql` | Test SQL: `suggest_unique_slug('admin')` rechaza reserved + `approve_demo_request` con slug reservado falla. |
| `supabase/migrations/044_reserved_slugs.sql` | (1) Modifica `suggest_unique_slug` para evitar reserved. (2) Modifica `approve_demo_request` para validar reserved. (3) CHECK constraint en `organizations.slug` (defense-in-depth en DB). |
| `docs/superpowers/specs/2026-05-21-subdomain-routing-design.md` | Este documento. |

### Archivos modificados

| Archivo | Cambio |
|---|---|
| `src/middleware.ts` | Sin cambios estructurales (sigue llamando `updateSession`). |
| `src/lib/supabase/middleware.ts` | Refactor: agrega `resolveTenant(request)` antes de auth check. Aplica reglas R1-R9. Configura cookie `domain=.tushorarios.com` en prod. |
| `src/app/api/super-admin/demo-requests/[id]/approve/route.ts` | Validar slug propuesto NO esté en `RESERVED_SLUGS` (defense-in-depth además del DB check). |
| `.env.example` | Documenta `NEXT_PUBLIC_ROOT_DOMAIN` (prod `tushorarios.com`, dev `lvh.me`). |

### Archivos NO modificados

- `next.config.mjs` (middleware hace todo el routing)
- `vercel.json` (sin rewrites estáticos)
- `tailwind.config.ts`, `tsconfig.json`
- Pages existentes (siguen siendo `(authenticated)/dashboard`, etc.)

## Migración DNS (pre-requisito, fase 0)

### Inventario actual Hostinger (a confirmar antes de migrar)

- `A` apex `tushorarios.com` → Vercel IP (76.76.21.21 o similar)
- `CNAME` `www` → `cname.vercel-dns.com`
- `MX` x2 → Hostinger Email servers
- `TXT` SPF: `v=spf1 include:_spf.mail.hostinger.com include:_spf.resend.com ~all`
- `TXT` DKIM Hostinger: selector `default._domainkey` o similar
- `TXT` DKIM Resend: selector `resend._domainkey` o similar
- `TXT` DMARC: `_dmarc` con policy actual
- `TXT` verificación Resend
- Cualquier otro (verificaciones de servicios externos)

### Plan de migración

1. **Pre-migración** (D-7 a D-1):
   - Confirmar lista exacta de records en Hostinger DNS (screenshot + export si posible)
   - Crear los mismos records en Vercel DNS (sin cambiar nameservers todavía)
   - Bajar TTL de nameservers en Hostinger a 5min unos días antes
   - Validar Vercel DNS responde correctamente con `dig @ns1.vercel-dns.com tushorarios.com`

2. **Día D — migración**:
   - En Hostinger panel: cambiar nameservers a `ns1.vercel-dns.com` / `ns2.vercel-dns.com`
   - Monitorear propagación con `whatsmydns.net` (esperar 30min-2h para mayoría)
   - Probar email recepción + envío (Resend test + Hostinger Email test)
   - Si algo falla en primeras 2h: revertir nameservers (TTL bajo permite rollback rápido)

3. **D+1 a D+7 — estabilización**:
   - Agregar wildcard domain `*.tushorarios.com` en Vercel proyecto
   - Esperar emisión cert SSL (~5min)
   - Probar `https://acme.tushorarios.com` (con slug real de prueba)
   - Subir TTL nameservers a default (24h) tras confirmar todo OK

### Riesgos y mitigaciones

| Riesgo | Mitigación |
|---|---|
| Email se cae durante propagación | Records MX/SPF/DKIM/DMARC en Vercel DNS ANTES de migrar |
| Cert SSL no emite | Vercel hace retry automático; si persiste, abrir ticket Vercel support |
| Rollback | TTL 5min permite revertir nameservers con propagación rápida |
| Visitantes ven sitio caído durante propagación | Anycast Vercel ya activo via IP; propagación es solo para nuevos requests |

## Constantes

```ts
// src/lib/tenant-resolver.ts
export const RESERVED_SLUGS = new Set([
  'www', 'admin', 'api', 'app', 'auth', 'mail', 'static',
]);

export const KNOWN_ROOT_DOMAINS = new Set([
  'tushorarios.com',
  'lvh.me',           // local dev
  'localhost',        // edge case
]);
```

CHECK constraint en migration 044:
```sql
ALTER TABLE organizations
  ADD CONSTRAINT slug_not_reserved
  CHECK (slug NOT IN ('www', 'admin', 'api', 'app', 'auth', 'mail', 'static'));
```

## Testing

### Vitest (helpers puros)

**`tenant-resolver.test.ts`** (~20 casos):
- `extractSubdomain('acme.tushorarios.com')` → `{subdomain: 'acme', rootDomain: 'tushorarios.com'}`
- `extractSubdomain('tushorarios.com')` → `{subdomain: null, rootDomain: 'tushorarios.com'}`
- `extractSubdomain('www.tushorarios.com')` → `{subdomain: 'www', rootDomain: 'tushorarios.com'}`
- `extractSubdomain('acme.lvh.me:3000')` → `{subdomain: 'acme', rootDomain: 'lvh.me'}`
- `extractSubdomain('localhost:3000')` → `{subdomain: null, rootDomain: 'localhost'}`
- `extractSubdomain('app-horarios-mauve.vercel.app')` → `{subdomain: null, rootDomain: null}` (no en KNOWN_ROOT_DOMAINS)
- `extractSubdomain('')` → `{subdomain: null, rootDomain: null}`
- `extractSubdomain('acme.dev.tushorarios.com')` → multi-level subdomain (edge case, deferir o tomar primero)
- `isReservedSlug('admin')` → true
- `isReservedSlug('acme')` → false
- `isReservedSlug('Admin')` → true (case insensitive)

**`tenant-cache.test.ts`** (~10 casos):
- Cache hit dentro del TTL
- Cache miss después del TTL (re-fetch)
- Cache miss inicial (sin entry)
- Concurrent gets del mismo slug — no implementamos request coalescing: el segundo request paga ~5ms extra durante warm-up de instancia, después ambos hit cache. Over-engineering para volumen actual.
- Cache de `null` (slug fantasma) — sí cachear para evitar DB hits repetidos en ataques
- `invalidate(slug)` manual

### SQL tests (`supabase/tests/`)

**`reserved_slugs.sql`**:
```sql
BEGIN;
-- 1. suggest_unique_slug rechaza reserved
SELECT plan(3);
SELECT isnt(suggest_unique_slug('admin'), 'admin', 'no devuelve "admin" tal cual');
SELECT isnt(suggest_unique_slug('www'), 'www', 'no devuelve "www" tal cual');

-- 2. approve_demo_request falla con slug reserved
SELECT throws_ok(
  $$SELECT approve_demo_request(..., p_org_slug => 'admin', ...)$$,
  '%reserved%',
  'rechaza slug reservado'
);

ROLLBACK;
```

### Manual E2E smoke (post-deploy)

1. `tushorarios.com` (apex) — landing renderiza
2. `www.tushorarios.com` — 308 a apex
3. `tushorarios.com/login` con user de "lr" — 308 a `lr.tushorarios.com/dashboard` post-auth
4. `lr.tushorarios.com/` no logueado — 308 a `lr.tushorarios.com/login`
5. User de lr entra a `wayne.tushorarios.com/employees` — 308 a `lr.tushorarios.com/employees`
6. `blablabla.tushorarios.com/dashboard` — 308 a `tushorarios.com/`
7. Super_admin entra a `lr.tushorarios.com/dashboard` — 308 a `tushorarios.com/admin/demo-requests`
8. `admin.tushorarios.com/login` (reserved) — treat-as-root, sirve login normal
9. Email recepción funciona (Resend + Hostinger Email post-DNS migration)
10. Logout en `lr.tushorarios.com` — cookie `.tushorarios.com` se borra, redirect a `/login`
11. `acme.lvh.me:3000` (local) — resuelve org acme correctamente

## Justificación con fuentes (resumen)

| Decisión | Validación principal |
|---|---|
| Subdomain routing (no path) | Patrón estándar 2026 B2B SaaS — [Vercel for Platforms](https://vercel.com/docs/multi-tenant), [WorkOS multi-tenant patterns](https://workos.com/blog/multi-tenant-permissions-slack-notion-linear), Slack/Notion/Linear/Hashnode lo usan |
| Middleware Next.js | Patrón canónico — [Next.js multi-tenant docs](https://nextjs.org/docs/app/guides/multi-tenant), [Vercel Platforms Starter Kit](https://vercel.com/templates/next.js/platforms-starter-kit) |
| Cookie `.tushorarios.com` + SameSite=Lax | [Supabase SSR discussion #5742](https://github.com/orgs/supabase/discussions/5742), [web.dev SameSite](https://web.dev/articles/samesite-cookies-explained) — Lax funciona porque subdomains comparten eTLD+1 |
| 308 redirect | [Google John Mueller (via StoryChief)](https://storychief.io/blog/301-302-307-308-redirect) — equivalente a 301 para SEO, preserva method |
| DB lookup + cache module-scope | [Vercel Fluid Compute](https://vercel.com/blog/scale-to-one-how-fluid-solves-cold-starts) elimina cold starts 99.37%, instance reuse persiste cache; [AWS Architecture Caching](https://aws.amazon.com/blogs/architecture/data-caching-across-microservices-in-a-serverless-architecture/) valida pattern |
| Postgres índice UNIQUE escala | [Volodymyr Potiichuk](https://volodymyrpotiichuk.com/blog/articles/unique-indexes-on-large-data-in-postgres-sql) — B-tree O(log n) escala a 100K+ rows |
| `lvh.me` para dev | [Nick Janetakis trilogy](https://nickjanetakis.com/blog/ngrok-lvhme-nipio-a-trilogy-for-local-development-and-testing) — patrón estable desde 2014 |
| Nameservers Vercel para wildcard SSL | [Vercel multi-tenant docs](https://vercel.com/docs/multi-tenant/domain-management), [GitHub Vercel #7739](https://github.com/vercel/vercel/discussions/7739) — único camino práctico para wildcard SSL automático; Hashnode hace esto a 35K+ dominios |
| Reserved slugs | [GitHub subdomain-blacklist](https://github.com/sandeepshetty/subdomain-blacklist/blob/master/subdomain-blacklist.txt), [HN Ask List](https://news.ycombinator.com/item?id=39588667) — práctica estándar |
| RLS como barrera real | [OWASP Multi-Tenant Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Multi_Tenant_Security_Cheat_Sheet.html), [Supabase RLS docs](https://supabase.com/docs/guides/database/postgres/row-level-security) — Broken Object Level Authorization es OWASP #1; RLS lo cierra |

## Métricas de éxito

- ✅ `acme.tushorarios.com/dashboard` carga correctamente para user de acme
- ✅ Cross-subdomain redirect silencioso funciona
- ✅ Cookie persiste entre raíz y subdomain (login en raíz → dashboard en subdomain sin re-auth)
- ✅ Slug fantasma redirige a landing
- ✅ Super_admin queda en raíz (no entra a subdomains de tenants)
- ✅ Email recepción + envío funcionan post-migración DNS
- ✅ Cert SSL wildcard emitido por Vercel sin intervención manual
- ✅ Latencia middleware p95 < 50ms (incluye cache miss inicial)
- ✅ Tests: 30+ Vitest pass + SQL tests reserved_slugs pass
- ✅ Build production: PASS

## Próximos sub-proyectos (referencias)

- **Sub-proy 6 — Billing**: convierte `trial` → `active` con Wompi/Bold/Stripe. Subdomain ya disponible para customer portal por tenant
- **Sub-proy 7 — Super-admin dashboard completo**: reemplaza `/admin/demo-requests` mínimo con vista completa de orgs, métricas, impersonation
- **Sub-proy 8 (potencial) — Custom domains**: clientes pueden traer su propio dominio (`acme.com → acme.tushorarios.com`)
- **Sub-proy futuro — Per-tenant branding**: logo/colores en landing del subdomain
