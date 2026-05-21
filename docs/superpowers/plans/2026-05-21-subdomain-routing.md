# Subdomain Routing — Implementation Plan (Sub-proyecto 5)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Habilitar subdomain routing por tenant (`acme.tushorarios.com`) para el SaaS multi-tenant, con login centralizado en raíz, cookie cross-subdomain, RLS como barrera real, y wildcard SSL automático.

**Architecture:** Middleware Next.js extrae subdomain del Host, resuelve `slug→organization` via DB lookup + cache module-scope (TTL 60s), aplica 9 reglas de redirect deterministas. Cookie scope `.tushorarios.com` en prod. Nameservers migrados a Vercel para DNS-01 wildcard SSL.

**Tech Stack:** Next.js 14 App Router, Supabase SSR (`@supabase/ssr`), Postgres con índice UNIQUE en `organizations.slug`, Vitest 2.1, Vercel Fluid Compute.

**Spec:** `docs/superpowers/specs/2026-05-21-subdomain-routing-design.md`

---

## Fase 0 — Migración DNS (pre-requisito, NO requiere código)

**⚠️ Esta fase debe completarse ANTES de empezar implementación de código porque el wildcard SSL es pre-requisito del E2E final.**

### Task 0.1: Inventariar DNS actual en Hostinger

**Files:** (ninguno — ops)

- [ ] **Step 1: Exportar registros DNS de Hostinger**

Acción manual del usuario (no Claude): entrar a Hostinger panel → Domains → tushorarios.com → DNS Zone Editor. Tomar screenshot o copiar tabla completa.

Registros esperados a inventariar:
- `A` apex (`@`) → IP Vercel (ej. 76.76.21.21)
- `CNAME` `www` → `cname.vercel-dns.com`
- `MX` x2 → Hostinger Email servers
- `TXT` `@` SPF → `v=spf1 include:_spf.mail.hostinger.com include:_spf.resend.com ~all` (o similar)
- `TXT` `resend._domainkey` → DKIM Resend (string largo)
- `TXT` `hostingermail-a._domainkey` (o similar) → DKIM Hostinger
- `TXT` `_dmarc` → DMARC policy
- `TXT` verificación Resend (si aplica)

- [ ] **Step 2: Documentar en archivo local privado**

Crear `/tmp/dns-inventory-2026-05-21.txt` (NO commitear, contiene DKIM keys) con tabla:

```
TIPO | NOMBRE | VALOR | TTL
A    | @      | 76.76.21.21 | 3600
...
```

- [ ] **Step 3: Confirmar al usuario**

Pedir al usuario que confirme que tiene el inventario completo antes de continuar.

### Task 0.2: Recrear registros en Vercel DNS

**Files:** (ninguno — Vercel UI)

- [ ] **Step 1: Acceder a Vercel dashboard**

Vercel → Settings → Domains → tushorarios.com → "Manage DNS" (aún apunta a Hostinger; este paso solo crea los registros para cuando migremos).

- [ ] **Step 2: Crear cada registro manualmente en Vercel**

Por cada entry del inventario:
- Add Record → Type → Name → Value → TTL
- A, CNAME, MX, TXT recreados con valores idénticos

- [ ] **Step 3: Verificar con dig**

```bash
dig @ns1.vercel-dns.com tushorarios.com MX
dig @ns1.vercel-dns.com tushorarios.com TXT
dig @ns1.vercel-dns.com www.tushorarios.com CNAME
```

Expected: respuestas correctas en ambos NS de Vercel (sin propagación pública aún porque NS sigue siendo Hostinger).

### Task 0.3: Reducir TTL nameservers en Hostinger (pre-cutover)

- [ ] **Step 1: Bajar TTL del registro NS a 5min (300s)**

En Hostinger panel → DNS → registros NS de tushorarios.com → editar TTL a 300.

- [ ] **Step 2: Esperar 24h** para que el TTL viejo expire y los resolvers globales adopten el nuevo TTL bajo.

### Task 0.4: Cutover de nameservers

- [ ] **Step 1: Cambiar nameservers en Hostinger**

Hostinger panel → Domains → tushorarios.com → Nameservers → Custom:
- `ns1.vercel-dns.com`
- `ns2.vercel-dns.com`

- [ ] **Step 2: Monitorear propagación**

Abrir `https://www.whatsmydns.net/#NS/tushorarios.com` y verificar adopción global (mayoría ~30min-2h).

- [ ] **Step 3: Probar email recepción + envío en ventana de 2h**

- Enviar email de prueba a `hola@tushorarios.com` desde Gmail externo → debe llegar
- Recibir email Resend (ej. usar formulario `/demo-request` que dispara welcome) → debe llegar
- Si falla en 2h: revertir nameservers a Hostinger (TTL 300s permite rollback rápido)

### Task 0.5: Agregar wildcard domain en Vercel

- [ ] **Step 1: Vercel → Project Settings → Domains → Add**

Agregar: `*.tushorarios.com`

- [ ] **Step 2: Esperar emisión de cert SSL wildcard**

Vercel UI muestra estado "Issuing certificate..." → "Valid". Toma 1-5 min con DNS-01 challenge automático.

- [ ] **Step 3: Probar con subdomain de prueba**

Browser: `https://test123.tushorarios.com` → debe cargar el deploy actual (cualquier slug del wildcard resuelve a la app).

### Task 0.6: Subir TTL nameservers a default

- [ ] **Step 1: Tras 7 días de estabilidad post-cutover, subir TTL NS a 86400 (24h)**

Hostinger panel (los NS ahora apuntan a Vercel pero el registro NS sigue en Hostinger registrar) → registro NS TTL → 86400.

---

## Fase 1 — Helpers puros (TDD)

### Task 1.1: Tipos y constantes — `tenant-resolver.ts`

**Files:**
- Create: `src/lib/tenant-resolver.ts`

- [ ] **Step 1: Crear archivo con tipos y constantes**

```ts
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
  // Placeholder — implementation in next step
  return { subdomain: null, rootDomain: null };
}
```

- [ ] **Step 2: Commit (scaffolding)**

```bash
git add src/lib/tenant-resolver.ts
git commit -m "feat(subdomain): scaffold tenant-resolver con constantes RESERVED_SLUGS + KNOWN_ROOT_DOMAINS"
```

### Task 1.2: Tests `isReservedSlug` (TDD red)

**Files:**
- Create: `src/lib/tenant-resolver.test.ts`

- [ ] **Step 1: Escribir tests failing para `isReservedSlug`**

```ts
// src/lib/tenant-resolver.test.ts
import { describe, it, expect } from "vitest";
import {
  isReservedSlug,
  extractSubdomain,
  RESERVED_SLUGS,
  KNOWN_ROOT_DOMAINS,
} from "./tenant-resolver";

describe("isReservedSlug", () => {
  it.each([
    ["admin", true],
    ["api", true],
    ["www", true],
    ["app", true],
    ["auth", true],
    ["mail", true],
    ["static", true],
  ])("'%s' es reserved → %s", (slug, expected) => {
    expect(isReservedSlug(slug)).toBe(expected);
  });

  it.each([
    ["acme", false],
    ["lr", false],
    ["empresa-test", false],
    ["", false],
  ])("'%s' no es reserved → %s", (slug, expected) => {
    expect(isReservedSlug(slug)).toBe(expected);
  });

  it("case insensitive — 'Admin' es reserved", () => {
    expect(isReservedSlug("Admin")).toBe(true);
  });

  it("case insensitive — 'WWW' es reserved", () => {
    expect(isReservedSlug("WWW")).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests para verificar que isReservedSlug pasa, extractSubdomain placeholder**

Run: `npm run test -- tenant-resolver`

Expected: 9 tests passing (los de `isReservedSlug`); 0 fails porque `extractSubdomain` no se prueba aún.

- [ ] **Step 3: Commit**

```bash
git add src/lib/tenant-resolver.test.ts
git commit -m "test(subdomain): isReservedSlug cubre reserved + case-insensitive"
```

### Task 1.3: Tests `extractSubdomain` (TDD red)

**Files:**
- Modify: `src/lib/tenant-resolver.test.ts`

- [ ] **Step 1: Agregar tests fallando para `extractSubdomain`**

Append al archivo de tests:

```ts
describe("extractSubdomain", () => {
  it("acme.tushorarios.com → subdomain=acme, rootDomain=tushorarios.com", () => {
    expect(extractSubdomain("acme.tushorarios.com")).toEqual({
      subdomain: "acme",
      rootDomain: "tushorarios.com",
    });
  });

  it("tushorarios.com (apex) → subdomain=null, rootDomain=tushorarios.com", () => {
    expect(extractSubdomain("tushorarios.com")).toEqual({
      subdomain: null,
      rootDomain: "tushorarios.com",
    });
  });

  it("www.tushorarios.com → subdomain=www", () => {
    expect(extractSubdomain("www.tushorarios.com")).toEqual({
      subdomain: "www",
      rootDomain: "tushorarios.com",
    });
  });

  it("acme.lvh.me:3000 → subdomain=acme, rootDomain=lvh.me (strip port)", () => {
    expect(extractSubdomain("acme.lvh.me:3000")).toEqual({
      subdomain: "acme",
      rootDomain: "lvh.me",
    });
  });

  it("lvh.me:3000 (apex local) → subdomain=null", () => {
    expect(extractSubdomain("lvh.me:3000")).toEqual({
      subdomain: null,
      rootDomain: "lvh.me",
    });
  });

  it("localhost:3000 → subdomain=null, rootDomain=localhost", () => {
    expect(extractSubdomain("localhost:3000")).toEqual({
      subdomain: null,
      rootDomain: "localhost",
    });
  });

  it("acme.localhost:3000 → subdomain=acme, rootDomain=localhost", () => {
    expect(extractSubdomain("acme.localhost:3000")).toEqual({
      subdomain: "acme",
      rootDomain: "localhost",
    });
  });

  it("app-horarios-mauve.vercel.app → rootDomain=null (no en KNOWN_ROOT_DOMAINS)", () => {
    expect(extractSubdomain("app-horarios-mauve.vercel.app")).toEqual({
      subdomain: null,
      rootDomain: null,
    });
  });

  it("preview-deploy-xyz.vercel.app → null", () => {
    expect(extractSubdomain("preview-deploy-xyz.vercel.app")).toEqual({
      subdomain: null,
      rootDomain: null,
    });
  });

  it("host vacío → null", () => {
    expect(extractSubdomain("")).toEqual({
      subdomain: null,
      rootDomain: null,
    });
  });

  it("acme.dev.tushorarios.com (multi-level) → toma primer label como subdomain", () => {
    expect(extractSubdomain("acme.dev.tushorarios.com")).toEqual({
      subdomain: "acme.dev",
      rootDomain: "tushorarios.com",
    });
  });

  it("IP literal 192.168.1.1:3000 → null", () => {
    expect(extractSubdomain("192.168.1.1:3000")).toEqual({
      subdomain: null,
      rootDomain: null,
    });
  });

  it("case insensitive — ACME.TUSHORARIOS.COM → subdomain=acme", () => {
    expect(extractSubdomain("ACME.TUSHORARIOS.COM")).toEqual({
      subdomain: "acme",
      rootDomain: "tushorarios.com",
    });
  });
});
```

- [ ] **Step 2: Run tests — verificar FAIL en extractSubdomain**

Run: `npm run test -- tenant-resolver`

Expected: 13 fails en `extractSubdomain` (placeholder retorna `{null, null}`).

- [ ] **Step 3: Commit**

```bash
git add src/lib/tenant-resolver.test.ts
git commit -m "test(subdomain): extractSubdomain cubre apex/sub/lvh/localhost/vercel.app/case"
```

### Task 1.4: Implementación `extractSubdomain` (TDD green)

**Files:**
- Modify: `src/lib/tenant-resolver.ts`

- [ ] **Step 1: Reemplazar placeholder con implementación real**

```ts
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
```

- [ ] **Step 2: Run tests — verificar todos pass**

Run: `npm run test -- tenant-resolver`

Expected: 22 tests passing (9 isReservedSlug + 13 extractSubdomain).

- [ ] **Step 3: Commit**

```bash
git add src/lib/tenant-resolver.ts
git commit -m "feat(subdomain): extractSubdomain con strip-port + match KNOWN_ROOT_DOMAINS"
```

### Task 1.5: Cache module-scope — `tenant-cache.ts` con tests

**Files:**
- Create: `src/lib/tenant-cache.ts`
- Create: `src/lib/tenant-cache.test.ts`

- [ ] **Step 1: Crear test file primero (TDD red)**

```ts
// src/lib/tenant-cache.test.ts
import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  resolveSlugCached,
  __resetCacheForTests,
  __setNowForTests,
} from "./tenant-cache";

type FakeSupabase = {
  from: (table: string) => {
    select: (cols: string) => {
      eq: (col: string, val: string) => {
        maybeSingle: () => Promise<{
          data: { id: string; slug: string } | null;
          error: null;
        }>;
      };
    };
  };
};

function makeFakeSupabase(
  rows: Array<{ id: string; slug: string }>
): { client: FakeSupabase; calls: number } {
  let calls = 0;
  const client: FakeSupabase = {
    from: () => ({
      select: () => ({
        eq: (_col: string, val: string) => ({
          maybeSingle: async () => {
            calls++;
            const row = rows.find((r) => r.slug === val);
            return { data: row ?? null, error: null };
          },
        }),
      }),
    }),
  };
  return { client, calls: 0, get callCount() { return calls; } } as any;
}

describe("resolveSlugCached", () => {
  beforeEach(() => {
    __resetCacheForTests();
    __setNowForTests(1_000_000); // arbitrary fixed time
  });

  it("cache miss inicial — hace DB query", async () => {
    const fake = makeFakeSupabase([{ id: "org-1", slug: "acme" }]);
    const res = await resolveSlugCached("acme", fake.client as never);
    expect(res).toEqual({ id: "org-1", slug: "acme" });
    expect(fake.callCount).toBe(1);
  });

  it("cache hit dentro del TTL — no hace DB query 2da vez", async () => {
    const fake = makeFakeSupabase([{ id: "org-1", slug: "acme" }]);
    await resolveSlugCached("acme", fake.client as never);
    await resolveSlugCached("acme", fake.client as never);
    expect(fake.callCount).toBe(1);
  });

  it("cache miss después del TTL — re-fetch", async () => {
    const fake = makeFakeSupabase([{ id: "org-1", slug: "acme" }]);
    await resolveSlugCached("acme", fake.client as never);
    __setNowForTests(1_000_000 + 61_000); // 61s después
    await resolveSlugCached("acme", fake.client as never);
    expect(fake.callCount).toBe(2);
  });

  it("cachea miss (null) — evita DB hits repetidos en ataques", async () => {
    const fake = makeFakeSupabase([]); // nada matchea
    await resolveSlugCached("blablabla", fake.client as never);
    await resolveSlugCached("blablabla", fake.client as never);
    expect(fake.callCount).toBe(1);
  });

  it("retorna null cuando slug no existe", async () => {
    const fake = makeFakeSupabase([]);
    const res = await resolveSlugCached("ghost", fake.client as never);
    expect(res).toBeNull();
  });

  it("slugs distintos cachean independientemente", async () => {
    const fake = makeFakeSupabase([
      { id: "org-1", slug: "acme" },
      { id: "org-2", slug: "wayne" },
    ]);
    await resolveSlugCached("acme", fake.client as never);
    await resolveSlugCached("wayne", fake.client as never);
    expect(fake.callCount).toBe(2);
    await resolveSlugCached("acme", fake.client as never);
    await resolveSlugCached("wayne", fake.client as never);
    expect(fake.callCount).toBe(2); // ambos cache hits
  });
});
```

- [ ] **Step 2: Run tests — verificar fail (módulo no existe)**

Run: `npm run test -- tenant-cache`

Expected: fail con "Cannot find module './tenant-cache'".

- [ ] **Step 3: Crear implementación**

```ts
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
    // No cachear errors transitorios — re-intentar siguiente request
    console.error("[tenant-cache] DB error resolving slug:", error);
    return null;
  }

  const value = data ?? null;
  cache.set(key, { value, expiresAt: now + TTL_MS });
  return value;
}

// Test-only helpers (no exportados en index público)
export function __resetCacheForTests(): void {
  cache.clear();
}

export function __setNowForTests(ms: number): void {
  nowFn = () => ms;
}
```

- [ ] **Step 4: Run tests — verificar pass**

Run: `npm run test -- tenant-cache`

Expected: 6 tests passing.

- [ ] **Step 5: Commit**

```bash
git add src/lib/tenant-cache.ts src/lib/tenant-cache.test.ts
git commit -m "feat(subdomain): tenant-cache module-scope con TTL 60s + tests"
```

### Task 1.6: Helper `buildTenantUrl` — `urls.ts`

**Files:**
- Create: `src/lib/urls.ts`
- Create: `src/lib/urls.test.ts`

- [ ] **Step 1: Test primero**

```ts
// src/lib/urls.test.ts
import { describe, it, expect } from "vitest";
import { buildTenantUrl } from "./urls";

describe("buildTenantUrl", () => {
  it("prod tushorarios.com — construye URL con subdomain", () => {
    expect(buildTenantUrl("acme", "/dashboard", "tushorarios.com")).toBe(
      "https://acme.tushorarios.com/dashboard"
    );
  });

  it("dev lvh.me — usa http (no https)", () => {
    expect(buildTenantUrl("acme", "/dashboard", "lvh.me", 3000)).toBe(
      "http://acme.lvh.me:3000/dashboard"
    );
  });

  it("path sin slash inicial — agrega slash", () => {
    expect(buildTenantUrl("acme", "dashboard", "tushorarios.com")).toBe(
      "https://acme.tushorarios.com/dashboard"
    );
  });

  it("path con query string — preserva", () => {
    expect(
      buildTenantUrl("acme", "/login?next=/employees", "tushorarios.com")
    ).toBe("https://acme.tushorarios.com/login?next=/employees");
  });
});
```

- [ ] **Step 2: Implementación**

```ts
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
```

- [ ] **Step 3: Run tests**

Run: `npm run test -- urls`

Expected: 4 tests passing.

- [ ] **Step 4: Commit**

```bash
git add src/lib/urls.ts src/lib/urls.test.ts
git commit -m "feat(subdomain): buildTenantUrl helper para links cross-subdomain"
```

---

## Fase 2 — Migration 044 (reserved slugs en DB)

### Task 2.1: Crear migration 044

**Files:**
- Create: `supabase/migrations/044_reserved_slugs.sql`

- [ ] **Step 1: Crear archivo de migración**

```sql
-- Migration 044: Reserved slugs en DB (defense-in-depth)
--
-- ¿Qué hace?
--   - CHECK constraint en organizations.slug rechazando reserved slugs.
--   - Modifica suggest_unique_slug() para evitar generar reserved.
--   - Modifica approve_demo_request() para validar slug antes de INSERT.
--
-- ¿Por qué?
--   El middleware Next.js usa subdomains reservados (www, admin, api, app,
--   auth, mail, static) para infra y branding. Si una org se registra con
--   alguno de esos slugs, choca con el routing.
--   Defense-in-depth: validamos en (1) API layer Zod, (2) RPC SECURITY DEFINER,
--   (3) DB CHECK constraint. Cualquier vía que omita las dos primeras queda
--   bloqueada por la tercera.

BEGIN;

-- =============================================================================
-- 1. CHECK constraint en organizations.slug
-- =============================================================================
ALTER TABLE organizations
  ADD CONSTRAINT slug_not_reserved
  CHECK (slug NOT IN ('www', 'admin', 'api', 'app', 'auth', 'mail', 'static'));

-- =============================================================================
-- 2. suggest_unique_slug evita reserved
-- =============================================================================
CREATE OR REPLACE FUNCTION public.suggest_unique_slug(p_name TEXT)
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
  reserved TEXT[] := ARRAY['www', 'admin', 'api', 'app', 'auth', 'mail', 'static'];
  base TEXT := slugify(p_name);
  candidate TEXT := base;
  counter INT := 2;
BEGIN
  -- Si el base es reservado o vacío, forzar sufijo desde el inicio
  IF candidate = ANY(reserved) OR candidate = '' THEN
    candidate := base || '-' || counter;
    counter := counter + 1;
  END IF;

  WHILE EXISTS (SELECT 1 FROM organizations WHERE slug = candidate)
    OR candidate = ANY(reserved)
  LOOP
    candidate := base || '-' || counter;
    counter := counter + 1;
  END LOOP;

  RETURN candidate;
END;
$$;

-- =============================================================================
-- 3. approve_demo_request valida slug reservado antes de INSERT
-- =============================================================================
CREATE OR REPLACE FUNCTION approve_demo_request(
  p_demo_request_id UUID,
  p_org_name TEXT,
  p_org_slug TEXT,
  p_plan TEXT,
  p_admin_email TEXT,
  p_admin_first_name TEXT,
  p_admin_last_name TEXT,
  p_approver_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  reserved TEXT[] := ARRAY['www', 'admin', 'api', 'app', 'auth', 'mail', 'static'];
  v_new_org_id UUID;
BEGIN
  -- Guard: approver debe ser super_admin activo
  IF NOT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = p_approver_id AND role = 'super_admin' AND is_active = true
  ) THEN
    RAISE EXCEPTION 'Forbidden: approver must be active super_admin'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Guard: slug no puede ser reservado
  IF lower(p_org_slug) = ANY(reserved) THEN
    RAISE EXCEPTION 'Slug "%" is reserved and cannot be used', p_org_slug
      USING ERRCODE = 'check_violation';
  END IF;

  INSERT INTO organizations (name, slug, plan, status, trial_ends_at, country)
  VALUES (p_org_name, p_org_slug, p_plan, 'trialing', now() + INTERVAL '30 days', 'CO')
  RETURNING id INTO v_new_org_id;

  UPDATE demo_requests
    SET status = 'approved',
        approved_org_id = v_new_org_id,
        approved_at = now(),
        approved_by = p_approver_id
  WHERE id = p_demo_request_id;

  UPDATE organizations
    SET approved_by = p_approver_id,
        approved_from_demo_request_id = p_demo_request_id
  WHERE id = v_new_org_id;

  RETURN jsonb_build_object(
    'success', true,
    'organization_id', v_new_org_id,
    'trial_ends_at', (SELECT trial_ends_at FROM organizations WHERE id = v_new_org_id)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.approve_demo_request(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, UUID) TO authenticated;

COMMIT;
```

- [ ] **Step 2: Verificar que no existen orgs con slug reservado (pre-migration check)**

```bash
# Vía Supabase MCP execute_sql o psql
```

```sql
SELECT id, name, slug FROM organizations
  WHERE slug IN ('www', 'admin', 'api', 'app', 'auth', 'mail', 'static');
-- Expected: 0 rows. Si hay alguna, renombrarla antes de aplicar migration.
```

Si hay rows, abortar y reportar al usuario (improbable porque slug `les-raptors` es la única org actual según contexto).

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/044_reserved_slugs.sql
git commit -m "feat(db): migration 044 reserved slugs (CHECK + suggest_unique_slug + RPC guard)"
```

### Task 2.2: SQL test para migration 044

**Files:**
- Create: `supabase/tests/reserved_slugs_test.sql`

- [ ] **Step 1: Crear test SQL siguiendo patrón BEGIN/ROLLBACK del repo**

```sql
-- Test: migration 044 reserved slugs
-- Ejecutar via execute_sql (Supabase MCP) o psql como service_role.
-- Pattern BEGIN/ROLLBACK — seguro contra prod.

BEGIN;

-- =============================================================================
-- Test 1: suggest_unique_slug('admin') NO devuelve 'admin'
-- =============================================================================
DO $$
DECLARE r TEXT;
BEGIN
  r := suggest_unique_slug('admin');
  IF r = 'admin' THEN
    RAISE EXCEPTION 'FAIL test 1: suggest_unique_slug("admin") devolvió "admin" (reserved)';
  END IF;
  RAISE NOTICE 'PASS test 1: suggest_unique_slug("admin") = %', r;
END $$;

-- =============================================================================
-- Test 2: suggest_unique_slug('www') NO devuelve 'www'
-- =============================================================================
DO $$
DECLARE r TEXT;
BEGIN
  r := suggest_unique_slug('www');
  IF r = 'www' THEN
    RAISE EXCEPTION 'FAIL test 2: suggest_unique_slug("www") devolvió "www" (reserved)';
  END IF;
  RAISE NOTICE 'PASS test 2: suggest_unique_slug("www") = %', r;
END $$;

-- =============================================================================
-- Test 3: INSERT directo con slug reservado falla CHECK constraint
-- =============================================================================
DO $$
BEGIN
  BEGIN
    INSERT INTO organizations (id, name, slug, plan, status, trial_ends_at, country)
    VALUES (
      gen_random_uuid(), 'Test Admin Org', 'admin', 'trial', 'trialing',
      now() + INTERVAL '30 days', 'CO'
    );
    RAISE EXCEPTION 'FAIL test 3: INSERT con slug "admin" debería fallar pero no falló';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'PASS test 3: CHECK constraint rechaza slug "admin"';
  END;
END $$;

-- =============================================================================
-- Test 4: approve_demo_request con slug reservado falla con mensaje claro
-- =============================================================================
-- Setup: fake demo_request
INSERT INTO demo_requests (id, nombre, email, empresa, telefono, sector, status)
VALUES (
  '99999999-1111-1111-1111-111111111111',
  'Reserved Test', 'reserved@example.com', 'Reserved Org',
  '+57 300 000 0000', 'salud', 'new'
);

DO $$
BEGIN
  BEGIN
    PERFORM approve_demo_request(
      '99999999-1111-1111-1111-111111111111',
      'Reserved Org',
      'admin',
      'trial', 'reserved@example.com', 'Reserved', 'Test',
      '7e75517e-b3bd-4092-abaf-f9106a184a07'::UUID
    );
    RAISE EXCEPTION 'FAIL test 4: approve_demo_request con slug "admin" debería fallar';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'PASS test 4: approve_demo_request rechaza slug "admin"';
  END;
END $$;

-- =============================================================================
-- Test 5: approve_demo_request con slug válido pasa (sanity check)
-- =============================================================================
DO $$
DECLARE result JSONB;
BEGIN
  result := approve_demo_request(
    '99999999-1111-1111-1111-111111111111',
    'Reserved Org',
    'valid-slug-test-' || floor(random() * 100000)::TEXT,
    'trial', 'reserved@example.com', 'Reserved', 'Test',
    '7e75517e-b3bd-4092-abaf-f9106a184a07'::UUID
  );
  IF (result->>'success')::BOOLEAN IS NOT TRUE THEN
    RAISE EXCEPTION 'FAIL test 5: approve_demo_request con slug válido no retornó success=true';
  END IF;
  RAISE NOTICE 'PASS test 5: approve_demo_request acepta slug válido';
END $$;

ROLLBACK;
```

- [ ] **Step 2: Commit (test file solo, ejecución viene después)**

```bash
git add supabase/tests/reserved_slugs_test.sql
git commit -m "test(db): SQL tests para migration 044 reserved slugs"
```

### Task 2.3: Aplicar migration 044 a Supabase Cloud

**Files:** (ninguno — DB op)

- [ ] **Step 1: Pre-check — confirmar zero orgs con slug reservado**

Vía Supabase MCP `execute_sql`:

```sql
SELECT id, name, slug FROM organizations
  WHERE slug IN ('www', 'admin', 'api', 'app', 'auth', 'mail', 'static');
```

Expected: 0 rows. Si no, abortar y reportar.

- [ ] **Step 2: Aplicar migration via Supabase MCP `apply_migration`**

```
mcp__plugin_supabase_supabase__apply_migration
project_id: ugkvuinkynvtuiutwlkd
name: 044_reserved_slugs
query: <contenido de supabase/migrations/044_reserved_slugs.sql>
```

Expected: success.

- [ ] **Step 3: Ejecutar SQL test**

Vía Supabase MCP `execute_sql` con contenido completo de `supabase/tests/reserved_slugs_test.sql`.

Expected NOTICE messages:
- `PASS test 1: suggest_unique_slug("admin") = admin-2` (o similar)
- `PASS test 2: suggest_unique_slug("www") = www-2`
- `PASS test 3: CHECK constraint rechaza slug "admin"`
- `PASS test 4: approve_demo_request rechaza slug "admin"`
- `PASS test 5: approve_demo_request acepta slug válido`

- [ ] **Step 4: Regenerar types**

Vía Supabase MCP `generate_typescript_types` (project_id `ugkvuinkynvtuiutwlkd`), copiar output a `src/lib/supabase/database.types.ts`.

Verificar diff: probablemente sin cambios (la migración no agrega columnas, solo modifica funciones y agrega CHECK).

- [ ] **Step 5: Commit si types cambiaron**

```bash
git add src/lib/supabase/database.types.ts
git commit -m "chore(types): regen post migration 044" # solo si hay cambios
```

---

## Fase 3 — API route: validar reserved slug

### Task 3.1: Agregar validación en `/api/admin/demo-requests/approve`

**Files:**
- Modify: `src/app/api/admin/demo-requests/approve/route.ts`

- [ ] **Step 1: Importar RESERVED_SLUGS y agregar check**

Localizar en el archivo (después del Zod parse, antes del RPC call):

Patrón actual (líneas ~44-62):
```ts
const body = await request.json();
const parse = ApproveSchema.safeParse(body);
if (!parse.success) {
  return NextResponse.json(
    { error: parse.error.issues[0]?.message ?? "Body inválido" },
    { status: 400 }
  );
}
const {
  demo_request_id,
  org_name,
  org_slug,
  // ...
} = parse.data;

const adminSupabase = createAdminClient();
```

Insertar después de la destructuración, antes de `createAdminClient`:

```ts
// 2b. Validar slug no reservado (defense-in-depth además del DB CHECK)
if (isReservedSlug(org_slug)) {
  return NextResponse.json(
    { error: `El slug "${org_slug}" está reservado para uso interno` },
    { status: 400 }
  );
}
```

Y agregar import al top del archivo (después de los otros imports):

```ts
import { isReservedSlug } from "@/lib/tenant-resolver";
```

- [ ] **Step 2: Run lint para verificar sin errores**

Run: `npm run lint`

Expected: PASS (sin warnings nuevos).

- [ ] **Step 3: Run tests para verificar nada se rompió**

Run: `npm run test`

Expected: todos los tests existentes pasan + nuevos de Fase 1.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/admin/demo-requests/approve/route.ts
git commit -m "feat(api): approve demo-request rechaza slug reservado (defense-in-depth)"
```

---

## Fase 4 — Middleware: subdomain routing + cookie cross-subdomain

### Task 4.1: Agregar variable de entorno NEXT_PUBLIC_ROOT_DOMAIN

**Files:**
- Modify: `.env.example`

- [ ] **Step 1: Agregar var documentada**

Localizar `.env.example` y agregar al final:

```
# ============================================
# Subdomain routing (sub-proyecto 5)
# ============================================
# Root domain en producción. Determina el scope de cookies (.tushorarios.com)
# y el comportamiento del middleware al extraer subdomains.
# - Producción: tushorarios.com
# - Local dev: lvh.me (acceder via acme.lvh.me:3000)
NEXT_PUBLIC_ROOT_DOMAIN=tushorarios.com
```

- [ ] **Step 2: Agregar la var al `.env` local del dev (sin commitear)**

Comando para el usuario:
```bash
echo "" >> .env.local && echo "NEXT_PUBLIC_ROOT_DOMAIN=lvh.me" >> .env.local
```

- [ ] **Step 3: Commit**

```bash
git add .env.example
git commit -m "docs(env): documentar NEXT_PUBLIC_ROOT_DOMAIN para sub-proyecto 5"
```

### Task 4.2: Refactorizar `lib/supabase/middleware.ts` — extracción de tenant

**Files:**
- Modify: `src/lib/supabase/middleware.ts`

- [ ] **Step 1: Leer estado actual completo**

Run: `cat src/lib/supabase/middleware.ts` (revisar context completo).

- [ ] **Step 2: Reemplazar archivo con versión nueva que aplica reglas R1-R9**

```ts
// src/lib/supabase/middleware.ts
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

  // =============================================================================
  // R1. www.tushorarios.com → apex (canonicalize, solo prod)
  // =============================================================================
  if (subdomain === "www" && isProdRootDomain(rootDomain)) {
    const url = new URL(path + search, `https://${rootDomain}`);
    return NextResponse.redirect(url, 308);
  }

  // =============================================================================
  // R3. Subdomain en URL pero NO existe org (slug fantasma) → redirect a apex
  //     (R2 — reserved — se trata como raíz, sigue al resto del flow)
  // =============================================================================
  if (subdomain && !isReservedSlug(subdomain) && !tenantOrg && rootDomain) {
    const url = new URL("/", `https://${rootDomain}`);
    return NextResponse.redirect(url, 308);
  }

  // =============================================================================
  // Auth: getUser para resto de reglas
  // =============================================================================
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Fetch profile + org slug (1 query) si hay user
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
      const org = (data as unknown as {
        organizations: {
          slug: string | null;
          onboarding_completed_at: string | null;
          onboarding_step: string | null;
        } | null;
      }).organizations;
      profile = {
        role: (data as { role: string }).role,
        organization_id: (data as { organization_id: string | null })
          .organization_id,
        org_slug: org?.slug ?? null,
        onboarding_completed_at: org?.onboarding_completed_at ?? null,
        onboarding_step: org?.onboarding_step ?? null,
      };
    }
  }

  const proto = isProdRootDomain(rootDomain) ? "https" : "http";
  const portSuffix = !isProdRootDomain(rootDomain) ? `:${request.nextUrl.port || ""}` : "";
  const port = portSuffix === ":" ? "" : portSuffix; // edge case si port vacío

  // =============================================================================
  // R5. Super_admin entró a un subdomain → redirect a raíz (landing super_admin)
  // =============================================================================
  if (
    user &&
    profile?.role === "super_admin" &&
    tenantOrg &&
    rootDomain
  ) {
    const target = `${proto}://${rootDomain}${port}/admin/demo-requests`;
    return NextResponse.redirect(target, 308);
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
    const target = `${proto}://${profile.org_slug}.${rootDomain}${port}${path}${search}`;
    return NextResponse.redirect(target, 308);
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
    const target = `${proto}://${profile.org_slug}.${rootDomain}${port}${path}${search}`;
    return NextResponse.redirect(target, 308);
  }

  // =============================================================================
  // R8. Subdomain válido + NO logueado + path / → /login del subdomain
  // =============================================================================
  if (tenantOrg && !user && path === "/" && rootDomain) {
    const target = `${proto}://${tenantOrg.slug}.${rootDomain}${port}/login`;
    return NextResponse.redirect(target, 308);
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
```

- [ ] **Step 3: Verificar typecheck pasa**

Run: `npx tsc --noEmit`

Expected: PASS (sin errores TS).

Si hay errores en el join de `profiles.organizations`, ajustar cast tipos según `database.types.ts`.

- [ ] **Step 4: Run tests existentes**

Run: `npm run test`

Expected: todos los tests pasan (los nuevos de Fase 1 + existentes).

- [ ] **Step 5: Commit**

```bash
git add src/lib/supabase/middleware.ts
git commit -m "feat(middleware): subdomain routing R1-R9 + cookie .tushorarios.com en prod"
```

### Task 4.3: Smoke test local con lvh.me

**Files:** (ninguno — verificación manual)

- [ ] **Step 1: Levantar dev server**

Run: `npm run dev` (background)

- [ ] **Step 2: Abrir browser y probar paths críticos**

Manual checklist (anotar resultado de cada uno):

1. `http://lvh.me:3000/` — landing renderiza
2. `http://lvh.me:3000/login` — login renderiza
3. Login como super_admin → `http://lvh.me:3000/admin/demo-requests` carga
4. Logout
5. Login como admin de "les-raptors" (LR) en `http://lvh.me:3000/login`:
   - Post-auth debería redirigir a `http://les-raptors.lvh.me:3000/dashboard`
   - Verificar dashboard carga + sesión persiste
6. En `http://les-raptors.lvh.me:3000/` (raíz subdomain) NO logueado:
   - Cerrar sesión, refrescar → 308 a `http://les-raptors.lvh.me:3000/login`
7. `http://nonexistent.lvh.me:3000/` → 308 a `http://lvh.me:3000/`
8. `http://admin.lvh.me:3000/login` (reserved) → renderiza login normal (tratado como raíz)
9. Super_admin entra a `http://les-raptors.lvh.me:3000/dashboard` → 308 a `http://lvh.me:3000/admin/demo-requests`

- [ ] **Step 3: Reportar findings al usuario**

Si todo pasa → continuar.
Si algo falla → diagnosticar root cause (consultar `vercel:routing-middleware` skill, debuggear con `console.log` en middleware).

- [ ] **Step 4: Kill dev server**

---

## Fase 5 — E2E producción (post-DNS migration)

> **⚠️ Esta fase REQUIERE Fase 0 (DNS migration) completada.**

### Task 5.1: Deploy preview branch

**Files:** (ninguno — ops)

- [ ] **Step 1: Crear branch feature**

```bash
git checkout -b feature/subdomain-routing
git push -u origin feature/subdomain-routing
```

- [ ] **Step 2: Vercel auto-build del branch**

Esperar deploy preview. NOTA: env vars del preview pueden no incluir Supabase; verificar en Vercel project settings que el preview scope tiene `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_ROOT_DOMAIN=tushorarios.com`.

- [ ] **Step 3: Tomar URL del preview (ej. `app-horarios-mauve-git-feature-subdomain-routing.vercel.app`)**

Smoke en preview URL: login básico funciona (sin wildcard porque el preview NO usa el dominio custom).

### Task 5.2: Abrir PR + merge a main

- [ ] **Step 1: Crear PR vía `gh`**

```bash
gh pr create --title "feat(subdomain): sub-proyecto 5 — subdomain routing multi-tenant" --body "$(cat <<'EOF'
## Summary

- Subdomain routing por tenant (`acme.tushorarios.com`) con middleware Next.js
- Cookie scope `.tushorarios.com` para sesión cross-subdomain
- Reserved slugs (www, admin, api, app, auth, mail, static) bloqueados en DB + API
- Cache module-scope con TTL 60s para slug lookups (escala a miles de orgs)
- Migration 044 (CHECK constraint + suggest_unique_slug + RPC guard)
- Nameservers migrados a Vercel (Fase 0, completado pre-PR)

## Spec
- `docs/superpowers/specs/2026-05-21-subdomain-routing-design.md`

## Test plan
- [ ] Vitest pasa (helpers + cache + urls)
- [ ] SQL test reserved_slugs_test.sql 5/5 PASS
- [ ] Smoke local con lvh.me (R1-R9)
- [ ] Smoke producción wildcard:
  - [ ] apex/www canonicalize
  - [ ] login centralizado redirige a subdomain
  - [ ] subdomain mismatch redirige silencioso
  - [ ] slug fantasma redirige a apex
  - [ ] super_admin redirige a raíz
  - [ ] email recepción + envío OK post-DNS
  - [ ] cert SSL wildcard emitido

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 2: Esperar review y merge**

Pedir al usuario que mergee tras smoke OK.

### Task 5.3: Smoke E2E producción

**Files:** (ninguno — manual browser testing post-merge)

- [ ] **Step 1: Esperar production deploy en `tushorarios.com`**

Vercel auto-deploys main → production en ~1-2 min.

- [ ] **Step 2: Ejecutar checklist E2E completo**

1. `https://tushorarios.com` (apex) — landing renderiza
2. `https://www.tushorarios.com` — 308 a apex
3. `https://tushorarios.com/login` — login renderiza
4. Login como admin de "les-raptors":
   - Post-auth → 308 a `https://les-raptors.tushorarios.com/dashboard`
   - Cert SSL del subdomain válido (browser muestra padlock)
   - Sesión persiste (no re-auth en cambio de host)
5. `https://les-raptors.tushorarios.com/employees` — carga con sesión
6. Cerrar sesión:
   - Cookie `.tushorarios.com` se borra
   - Redirect a `/login`
7. `https://les-raptors.tushorarios.com/` no logueado → 308 a `/login`
8. Probar slug fantasma: `https://nonexistent.tushorarios.com/dashboard` → 308 a `https://tushorarios.com/`
9. Login como super_admin → entrar a `https://les-raptors.tushorarios.com/dashboard` → 308 a `https://tushorarios.com/admin/demo-requests`
10. Slug reserved: `https://admin.tushorarios.com/login` → renderiza login normal (tratado como raíz)
11. Crear demo-request via `https://tushorarios.com/demo-request`, super_admin aprueba con slug nuevo → email Welcome llega
12. Email recepción funciona (enviar email externo a `hola@tushorarios.com`)
13. Email Resend funciona (welcome email del approve enviado)

- [ ] **Step 3: Documentar findings**

Si todo pasa → cerrar sub-proyecto 5.
Si algo falla → crear issue por cada falla específica, fix forward.

### Task 5.4: Memoria + cierre

**Files:**
- Create: `/Users/usuario/.claude/projects/-Users-usuario-App-Horarios/memory/project_status_2026_05_21_subproy5_shipped.md`
- Modify: `/Users/usuario/.claude/projects/-Users-usuario-App-Horarios/memory/MEMORY.md`

- [ ] **Step 1: Crear memoria de project status**

Contenido con frontmatter estándar y resumen del sub-proy 5 shipped (similar a `project_status_2026_05_20_subproy4_shipped.md`).

- [ ] **Step 2: Agregar entry a MEMORY.md**

```markdown
- [Project status 2026-05-21 sub-proy 5 shipped](project_status_2026_05_21_subproy5_shipped.md) — subdomain routing multi-tenant. PR #N MERGED. Migration 044 cloud. Wildcard SSL via Vercel nameservers.
```

- [ ] **Step 3: Cerrar tasks pendientes**

---

## Self-review notes

**Spec coverage:**
- ✅ R1-R9 reglas → Task 4.2
- ✅ Cookie `.tushorarios.com` → Task 4.2
- ✅ Cache module-scope TTL 60s → Task 1.5
- ✅ Reserved slugs DB + API → Task 2.1, 2.2, 2.3, 3.1
- ✅ `extractSubdomain` + `isReservedSlug` → Tasks 1.1-1.4
- ✅ `buildTenantUrl` → Task 1.6
- ✅ DNS migration plan → Fase 0
- ✅ Wildcard domain + SSL → Task 0.5
- ✅ E2E smoke checklist → Task 5.3
- ✅ Local dev lvh.me → Task 4.3

**No placeholders en steps:** verificado, todo el código está inline.

**Type consistency:** `tenantOrg`, `profile.org_slug`, `RESERVED_SLUGS`, `extractSubdomain` usados consistentemente entre tasks.

**Dependencias:** Fase 0 (DNS) puede correr en paralelo con Fases 1-4 si el usuario está haciendo migración DNS mientras tanto. Fase 5 BLOQUEADA por Fase 0 + 4.
