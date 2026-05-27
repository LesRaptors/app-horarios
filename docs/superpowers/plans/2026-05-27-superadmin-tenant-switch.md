# Panel super_admin + cambio de tenant — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dar al super_admin un panel SaaS para ver todas las organizaciones y un selector global para "entrar" a un tenant y operar como su admin (leer/crear/editar), sin reescribir las 116 RLS policies.

**Architecture:** El "tenant activo" del super_admin vive en una tabla server-side (`super_admin_active_org`). Tres funciones helper de RLS (`is_super_admin`, `get_user_org_id`, `get_user_role`) se redefinen para ser conscientes de ese tenant activo, de modo que el patrón de policy existente `is_super_admin() OR organization_id = get_user_org_id()` filtre automáticamente. La UI expone el tenant activo vía `AuthContext` y un selector en el navbar; las escrituras usan `effectiveOrgId`.

**Tech Stack:** Next.js 14 (App Router, client components), Supabase (Postgres + RLS), TypeScript, Tailwind + shadcn/ui, Vitest (lógica pura), SQL tests (`BEGIN…ROLLBACK`).

**Skills/plugins para subagentes:** `modern-web-guidance:modern-web-guidance` (MANDATORY antes de tocar UI/TSX — combobox/dialog a11y), `supabase:supabase` (RLS/migraciones), `vercel:shadcn` (componentes), plugin `supabase` MCP (`apply_migration`, `execute_sql`, `generate_typescript_types`). Pin `model: opus` para Task 1-2 (RLS core) y reviewers; `model: sonnet` para UI.

---

## File Structure

**Crear:**
- `supabase/migrations/053_super_admin_active_org.sql` — tabla + RPC + 3 funciones tenant-aware.
- `supabase/tests/super_admin_active_org_test.sql` — SQL test de los 3 estados + aislamiento de escritura.
- `src/lib/auth/effective-org.ts` — función pura `computeEffectiveOrgId`.
- `src/lib/auth/effective-org.test.ts` — Vitest.
- `src/hooks/use-organizations.ts` — hook que lista organizaciones con métricas (panel + selector).
- `src/app/(authenticated)/super-admin/page.tsx` — panel SaaS (home del super_admin).
- `src/components/layout/tenant-switcher.tsx` — selector global + indicador (combobox).

**Modificar:**
- `src/contexts/auth-context.tsx` — exponer `isSuperAdmin`, `activeOrgId`, `activeOrg`, `effectiveOrgId`, `setActiveOrg`.
- `src/components/layout/navbar.tsx` — montar `<TenantSwitcher>`.
- `src/app/login/page.tsx` — redirect super_admin → `/super-admin`.
- `src/lib/supabase/middleware.ts` — R5 → `/super-admin`; login redirect por rol; guard "elige org".
- Los ~25 inserts `profile?.organization_id ?? ""` → `effectiveOrgId` (lista en Task 8).

---

## Task 1: Migración — tenant activo (tabla + RPC + 3 funciones)

**Files:**
- Create: `supabase/migrations/053_super_admin_active_org.sql`

**Contexto:** las funciones actuales (en `039_multi_tenant.sql`) son: `is_super_admin()` (true si `role='super_admin'`), `get_user_org_id()` (devuelve `profiles.organization_id`, NULL para super_admin), `get_user_role()` (devuelve `role`). Las redefinimos para que, cuando un super_admin tenga un tenant activo seteado, se comporte como admin de ese tenant.

- [ ] **Step 1: Escribir el archivo de migración**

Crear `supabase/migrations/053_super_admin_active_org.sql`:

```sql
-- =============================================================================
-- 053: Tenant activo del super_admin (panel + modo operación)
-- =============================================================================
-- Objetivo: permitir que un super_admin "entre" a una organización y opere como
-- su admin, SIN reescribir las 116 policies multi-tenant. Se logra haciendo que
-- 3 funciones helper de RLS sean conscientes de un "tenant activo" guardado en
-- super_admin_active_org.
--
-- Tabla de verdad (con el patrón de policy existente intacto):
--   super_admin SIN tenant activo  -> is_super_admin()=true  (modo panel, ve todo)
--   super_admin CON tenant activo  -> is_super_admin()=false, get_user_org_id()=tenant,
--                                     get_user_role()='admin' (opera como admin del tenant)
--   usuario normal                 -> sin cambios
-- =============================================================================

BEGIN;

-- 1. Tabla del tenant activo (1 fila por super_admin)
CREATE TABLE IF NOT EXISTS public.super_admin_active_org (
  user_id       UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  active_org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.super_admin_active_org ENABLE ROW LEVEL SECURITY;

-- El super_admin solo lee su propia fila (la escritura va por RPC SECURITY DEFINER)
DROP POLICY IF EXISTS saao_self ON public.super_admin_active_org;
CREATE POLICY saao_self ON public.super_admin_active_org
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- 2. RPC para setear/limpiar el tenant activo
CREATE OR REPLACE FUNCTION public.set_active_org(p_org_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Check CRUDO de rol (no la función is_super_admin(), que es tenant-aware)
  IF NOT EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin'
  ) THEN
    RAISE EXCEPTION 'solo super_admin puede cambiar de organización';
  END IF;

  IF p_org_id IS NULL THEN
    DELETE FROM super_admin_active_org WHERE user_id = auth.uid();
  ELSE
    INSERT INTO super_admin_active_org (user_id, active_org_id)
    VALUES (auth.uid(), p_org_id)
    ON CONFLICT (user_id) DO UPDATE
      SET active_org_id = EXCLUDED.active_org_id, updated_at = now();
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_active_org(UUID) TO authenticated;

-- 3. Helper interno: rol crudo + org propia + tenant activo en UNA fila
--    (evita 2 SELECTs por policy; STABLE -> cacheado por query)
CREATE OR REPLACE FUNCTION public._user_ctx()
RETURNS TABLE(raw_role TEXT, own_org UUID, active_org UUID)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT p.role, p.organization_id, s.active_org_id
  FROM profiles p
  LEFT JOIN super_admin_active_org s ON s.user_id = p.id
  WHERE p.id = auth.uid();
$$;

GRANT EXECUTE ON FUNCTION public._user_ctx() TO authenticated;

-- 4. Redefinir las 3 funciones para ser tenant-aware
CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT raw_role = 'super_admin' AND active_org IS NULL FROM public._user_ctx()),
    false
  );
$$;

CREATE OR REPLACE FUNCTION public.get_user_org_id()
RETURNS UUID
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT CASE WHEN raw_role = 'super_admin' THEN active_org ELSE own_org END
  FROM public._user_ctx();
$$;

CREATE OR REPLACE FUNCTION public.get_user_role()
RETURNS TEXT
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN raw_role = 'super_admin' AND active_org IS NOT NULL THEN 'admin'
    ELSE raw_role
  END
  FROM public._user_ctx();
$$;

COMMIT;
```

- [ ] **Step 2: NO aplicar todavía**

La validación segura (en transacción con ROLLBACK contra cloud) se hace en Task 2; recién en Task 3 se aplica de verdad. No ejecutar `apply_migration` aún.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/053_super_admin_active_org.sql
git commit -m "feat(superadmin): migración 053 tenant activo (tabla + RPC + funciones tenant-aware)"
```

---

## Task 2: SQL test del tenant activo (TDD — validar en transacción)

**Files:**
- Create: `supabase/tests/super_admin_active_org_test.sql`

Sigue el patrón de `supabase/tests/multi_tenant_isolation_test.sql`: aplica el DDL de la migración **dentro** de `BEGIN…ROLLBACK` y corre aserciones; al hacer ROLLBACK, prod queda intacto. Verde = lógica correcta antes de aplicar de verdad.

- [ ] **Step 1: Escribir el test**

Crear `supabase/tests/super_admin_active_org_test.sql` con: (a) el DDL completo de la migración 053 (copiado de Task 1, sin el `BEGIN/COMMIT`), seguido de (b) las aserciones. Estructura:

```sql
BEGIN;

-- (a) Aplicar DDL de la migración 053 aquí (tabla + RPC + _user_ctx + 3 funciones),
--     COPIANDO el cuerpo de 053_super_admin_active_org.sql SIN sus líneas BEGIN/COMMIT.

-- (b) Setup de datos
-- Org A = la real existente (usar una org de prod) o crear dos orgs de prueba:
INSERT INTO organizations (id, name, slug, plan, status, country, timezone) VALUES
  ('00000000-0000-0000-0000-0000000000a1', 'Test Org A', 'test-org-a', 'starter', 'active', 'CO', 'America/Bogota'),
  ('00000000-0000-0000-0000-0000000000b2', 'Test Org B', 'test-org-b', 'starter', 'active', 'CO', 'America/Bogota');

INSERT INTO profiles (id, email, first_name, last_name, role, organization_id, is_active) VALUES
  ('aaaaaaaa-0000-0000-0000-000000000001', 'admin-a@test.com', 'Admin', 'A', 'admin', '00000000-0000-0000-0000-0000000000a1', true),
  ('99999999-0000-0000-0000-000000000009', 'super@saas.com', 'Super', 'Admin', 'super_admin', NULL, true);

INSERT INTO locations (id, organization_id, name) VALUES
  ('a1a1a1a1-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a1', 'Sede A'),
  ('b2b2b2b2-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000000b2', 'Sede B');

SET LOCAL role authenticated;

-- TEST 1: super_admin SIN tenant activo -> modo panel (is_super_admin=true, ve ambas orgs)
SET LOCAL "request.jwt.claim.sub" TO '99999999-0000-0000-0000-000000000009';
DO $$
DECLARE v_super BOOLEAN; v_orgs INT;
BEGIN
  SELECT public.is_super_admin() INTO v_super;
  ASSERT v_super = true, 'TEST 1a FAILED: is_super_admin no es true en modo panel';
  SELECT COUNT(DISTINCT organization_id) INTO v_orgs FROM locations;
  ASSERT v_orgs >= 2, format('TEST 1b FAILED: super_admin ve %s orgs (esperado >= 2)', v_orgs);
  RAISE NOTICE 'TEST 1 PASSED: modo panel ve todo';
END $$;

-- TEST 2: super_admin CON tenant activo = Org A -> opera como admin de A
INSERT INTO super_admin_active_org (user_id, active_org_id)
  VALUES ('99999999-0000-0000-0000-000000000009', '00000000-0000-0000-0000-0000000000a1');
DO $$
DECLARE v_super BOOLEAN; v_org UUID; v_role TEXT; v_b INT;
BEGIN
  SELECT public.is_super_admin() INTO v_super;
  ASSERT v_super = false, 'TEST 2a FAILED: is_super_admin debe ser false con tenant activo';
  SELECT public.get_user_org_id() INTO v_org;
  ASSERT v_org = '00000000-0000-0000-0000-0000000000a1', format('TEST 2b FAILED: get_user_org_id=%s', v_org);
  SELECT public.get_user_role() INTO v_role;
  ASSERT v_role = 'admin', format('TEST 2c FAILED: get_user_role=%s (esperado admin)', v_role);
  SELECT COUNT(*) INTO v_b FROM locations WHERE organization_id = '00000000-0000-0000-0000-0000000000b2';
  ASSERT v_b = 0, format('TEST 2d FAILED: operando en A ve %s locations de B', v_b);
  RAISE NOTICE 'TEST 2 PASSED: opera como admin de A, no ve B';
END $$;

-- TEST 3: super_admin operando en A PUEDE insertar en A, NO en B
DO $$
DECLARE v_failed BOOLEAN := false;
BEGIN
  INSERT INTO locations (organization_id, name) VALUES ('00000000-0000-0000-0000-0000000000a1', 'Sede A2');
  RAISE NOTICE 'TEST 3a PASSED: insert en A permitido';
  BEGIN
    INSERT INTO locations (organization_id, name) VALUES ('00000000-0000-0000-0000-0000000000b2', 'Hack B');
  EXCEPTION WHEN insufficient_privilege OR check_violation OR others THEN v_failed := true;
  END;
  ASSERT v_failed = true, 'TEST 3b FAILED: insert en B NO fue bloqueado';
  RAISE NOTICE 'TEST 3b PASSED: insert en B bloqueado';
END $$;

-- TEST 4: usuario normal (admin-a) sin cambios
SET LOCAL "request.jwt.claim.sub" TO 'aaaaaaaa-0000-0000-0000-000000000001';
DO $$
DECLARE v_super BOOLEAN; v_org UUID; v_role TEXT;
BEGIN
  SELECT public.is_super_admin() INTO v_super;
  ASSERT v_super = false, 'TEST 4a FAILED';
  SELECT public.get_user_org_id() INTO v_org;
  ASSERT v_org = '00000000-0000-0000-0000-0000000000a1', 'TEST 4b FAILED';
  SELECT public.get_user_role() INTO v_role;
  ASSERT v_role = 'admin', 'TEST 4c FAILED';
  RAISE NOTICE 'TEST 4 PASSED: usuario normal intacto';
END $$;

-- TEST 5: set_active_org por no-super_admin falla
DO $$
DECLARE v_failed BOOLEAN := false;
BEGIN
  BEGIN
    PERFORM public.set_active_org('00000000-0000-0000-0000-0000000000b2');
  EXCEPTION WHEN others THEN v_failed := true;
  END;
  ASSERT v_failed = true, 'TEST 5 FAILED: no-super_admin pudo set_active_org';
  RAISE NOTICE 'TEST 5 PASSED: set_active_org bloqueado para no-super_admin';
END $$;

ROLLBACK;
SELECT 'super_admin_active_org: 5 tests PASSED' AS result;
```

- [ ] **Step 2: Ejecutar el test contra cloud (debe pasar)**

Vía Supabase MCP `execute_sql` (project `ugkvuinkynvtuiutwlkd`), pegar el contenido completo del archivo.
Expected: `super_admin_active_org: 5 tests PASSED`. Si algún `ASSERT` falla, la transacción aborta con el mensaje del test — corregir la migración (Task 1) y reintentar. Prod queda intacto (ROLLBACK).

- [ ] **Step 3: Commit**

```bash
git add supabase/tests/super_admin_active_org_test.sql
git commit -m "test(superadmin): SQL test tenant activo (3 estados + aislamiento escritura)"
```

---

## Task 3: Aplicar migración a cloud + regenerar tipos

**Files:**
- Modify: `src/lib/supabase/database.types.ts` (regenerado)

- [ ] **Step 1: Aplicar la migración**

Vía Supabase MCP `apply_migration` (project `ugkvuinkynvtuiutwlkd`, name `053_super_admin_active_org`), con el contenido de `supabase/migrations/053_super_admin_active_org.sql`.

- [ ] **Step 2: Verificar que las funciones quedaron tenant-aware**

Vía `execute_sql`: `SELECT pg_get_functiondef('public.get_user_role'::regproc);` — Expected: el cuerpo con el `CASE WHEN raw_role = 'super_admin' AND active_org IS NOT NULL`.

- [ ] **Step 3: Smoke de no-regresión multi-tenant**

Re-ejecutar `supabase/tests/multi_tenant_isolation_test.sql` vía `execute_sql`.
Expected: `All 8 isolation tests PASSED` (confirma que los usuarios normales no se rompieron).

- [ ] **Step 4: Regenerar tipos**

Vía Supabase MCP `generate_typescript_types` y sobrescribir `src/lib/supabase/database.types.ts`. Debe aparecer la tabla `super_admin_active_org` y la función `set_active_org`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/supabase/database.types.ts
git commit -m "chore(superadmin): aplicar migración 053 a cloud + regen types"
```

---

## Task 4: `effectiveOrgId` puro + extender AuthContext

**Files:**
- Create: `src/lib/auth/effective-org.ts`
- Create: `src/lib/auth/effective-org.test.ts`
- Modify: `src/contexts/auth-context.tsx`

- [ ] **Step 1: Test de la función pura**

Crear `src/lib/auth/effective-org.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { computeEffectiveOrgId } from "./effective-org";

describe("computeEffectiveOrgId", () => {
  it("usuario normal: usa su organization_id (ignora activeOrgId)", () => {
    expect(computeEffectiveOrgId("org-1", "org-9")).toBe("org-1");
  });
  it("super_admin (org null) con tenant activo: usa activeOrgId", () => {
    expect(computeEffectiveOrgId(null, "org-9")).toBe("org-9");
  });
  it("super_admin sin tenant activo: null", () => {
    expect(computeEffectiveOrgId(null, null)).toBeNull();
  });
});
```

- [ ] **Step 2: Verificar que falla**

Run: `npm run test -- effective-org`
Expected: FAIL (módulo no existe).

- [ ] **Step 3: Implementar**

Crear `src/lib/auth/effective-org.ts`:

```typescript
/**
 * Org efectiva para escrituras/scoping en el cliente.
 * - Usuario normal: su propia organization_id.
 * - super_admin (organization_id null): la org activa seleccionada, o null si está en el panel.
 */
export function computeEffectiveOrgId(
  ownOrgId: string | null,
  activeOrgId: string | null
): string | null {
  return ownOrgId ?? activeOrgId;
}
```

- [ ] **Step 4: Verificar que pasa**

Run: `npm run test -- effective-org`
Expected: PASS (3 tests).

- [ ] **Step 5: Extender AuthContext**

Modificar `src/contexts/auth-context.tsx`. Añadir imports y campos. La interfaz pasa a:

```typescript
import type { Database } from "@/lib/supabase/database.types";
import { computeEffectiveOrgId } from "@/lib/auth/effective-org";

type OrgRow = Database["public"]["Tables"]["organizations"]["Row"];

interface AuthContextValue {
  user: User | null;
  profile: Profile | null;
  loading: boolean;
  isSuperAdmin: boolean;
  activeOrgId: string | null;
  activeOrg: OrgRow | null;
  effectiveOrgId: string | null;
  setActiveOrg: (orgId: string | null) => Promise<void>;
  signOut: () => Promise<void>;
}
```

En `AuthProvider`, añadir estado `const [activeOrg, setActiveOrgState] = useState<OrgRow | null>(null);`. Dentro de `getUser()`, después de cargar `profileData`, si el perfil es super_admin, cargar el tenant activo:

```typescript
const isSA = (profileData as unknown as Profile)?.role === "super_admin";
if (isSA) {
  const { data: saao } = await supabase
    .from("super_admin_active_org")
    .select("active_org_id, organizations:active_org_id(*)")
    .eq("user_id", user.id)
    .maybeSingle();
  const org = (saao as unknown as { organizations: OrgRow | null } | null)?.organizations ?? null;
  setActiveOrgState(org);
}
```

Añadir el callback (llama al RPC y refresca la org en estado):

```typescript
const setActiveOrg = useCallback(async (orgId: string | null) => {
  const supabase = createClient();
  const { error } = await supabase.rpc("set_active_org", { p_org_id: orgId });
  if (error) throw error;
  if (orgId === null) {
    setActiveOrgState(null);
  } else {
    const { data } = await supabase.from("organizations").select("*").eq("id", orgId).single();
    setActiveOrgState((data as OrgRow) ?? null);
  }
}, []);
```

Calcular derivados y exponerlos en el `value`:

```typescript
const isSuperAdmin = profile?.role === "super_admin";
const activeOrgId = activeOrg?.id ?? null;
const effectiveOrgId = computeEffectiveOrgId(profile?.organization_id ?? null, activeOrgId);
```

```tsx
<AuthContext.Provider value={{ user, profile, loading, isSuperAdmin, activeOrgId, activeOrg, effectiveOrgId, setActiveOrg, signOut }}>
```

- [ ] **Step 6: Verificar build de tipos**

Run: `npx tsc --noEmit` — Expected: sin errores nuevos en `auth-context.tsx` (ignorar los 9 pre-existentes en `*.test.ts`).

- [ ] **Step 7: Commit**

```bash
git add src/lib/auth/effective-org.ts src/lib/auth/effective-org.test.ts src/contexts/auth-context.tsx
git commit -m "feat(superadmin): effectiveOrgId puro + AuthContext con tenant activo"
```

---

## Task 5: Hook `useOrganizations` (lista con métricas)

**Files:**
- Create: `src/hooks/use-organizations.ts`

Carga todas las organizaciones con métricas para el panel y el selector. El super_admin en modo panel (sin tenant activo) ve todas por RLS.

- [ ] **Step 1: Implementar el hook**

Crear `src/hooks/use-organizations.ts`:

```typescript
"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";

export interface OrgSummary {
  id: string;
  name: string;
  slug: string;
  status: string;
  billing_exempt: boolean;
  current_plan_id: string | null;
  onboarding_completed_at: string | null;
  subscription_status: string | null;
  employee_count: number;
  location_count: number;
}

export function useOrganizations(enabled: boolean) {
  const [orgs, setOrgs] = useState<OrgSummary[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const supabase = createClient();
    // Org base + suscripción (join) + conteos en paralelo
    const [{ data: orgRows }, { data: profileRows }, { data: locRows }] = await Promise.all([
      supabase
        .from("organizations")
        .select("id, name, slug, status, billing_exempt, current_plan_id, onboarding_completed_at, subscriptions(status)")
        .order("name"),
      supabase.from("profiles").select("organization_id").eq("is_active", true),
      supabase.from("locations").select("organization_id"),
    ]);

    const empByOrg = new Map<string, number>();
    (profileRows ?? []).forEach((r) => {
      if (r.organization_id) empByOrg.set(r.organization_id, (empByOrg.get(r.organization_id) ?? 0) + 1);
    });
    const locByOrg = new Map<string, number>();
    (locRows ?? []).forEach((r) => {
      if (r.organization_id) locByOrg.set(r.organization_id, (locByOrg.get(r.organization_id) ?? 0) + 1);
    });

    const summaries: OrgSummary[] = (orgRows ?? []).map((o) => {
      const subs = (o as unknown as { subscriptions: { status: string }[] | { status: string } | null }).subscriptions;
      const subStatus = Array.isArray(subs) ? (subs[0]?.status ?? null) : (subs?.status ?? null);
      return {
        id: o.id,
        name: o.name,
        slug: o.slug,
        status: o.status,
        billing_exempt: o.billing_exempt,
        current_plan_id: o.current_plan_id,
        onboarding_completed_at: o.onboarding_completed_at,
        subscription_status: subStatus,
        employee_count: empByOrg.get(o.id) ?? 0,
        location_count: locByOrg.get(o.id) ?? 0,
      };
    });
    setOrgs(summaries);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!enabled) return;
    void load();
  }, [enabled, load]);

  return { orgs, loading, reload: load };
}
```

> Nota: si `organizations.subscriptions` no es un nombre de relación válido en los tipos generados, usar el nombre real de la FK (`subscriptions` referencia `organization_id`). Verificar contra `database.types.ts` tras Task 3 y ajustar el `select`.

- [ ] **Step 2: Verificar tipos**

Run: `npx tsc --noEmit` — Expected: sin errores nuevos.

- [ ] **Step 3: Commit**

```bash
git add src/hooks/use-organizations.ts
git commit -m "feat(superadmin): hook useOrganizations con métricas"
```

---

## Task 6: Panel SaaS `/super-admin`

**Files:**
- Create: `src/app/(authenticated)/super-admin/page.tsx`

**ANTES de escribir TSX:** invocar `modern-web-guidance` con query `"data table landmarks heading accessible"` y aplicar DOs/DON'Ts.

- [ ] **Step 1: Implementar la página**

Crear `src/app/(authenticated)/super-admin/page.tsx` (client component). Usa `DataTable`, `PageHeader`, `useAuth`, `useOrganizations`. Guard de rol con `isSuperAdmin`. Por fila: nombre+slug, # empleados, # sedes, estado de suscripción (o "Exenta" si `billing_exempt`), onboarding (✓/pendiente), y botón "Trabajar en esta org" que llama `setActiveOrg(org.id)` y navega a `/dashboard`.

```tsx
"use client";

import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/use-auth";
import { useOrganizations } from "@/hooks/use-organizations";
import { isSuperAdmin } from "@/lib/auth/can-manage";
import { DataTable } from "@/components/shared/data-table";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import type { UserRole } from "@/lib/types";

const SUB_LABELS: Record<string, string> = {
  trialing: "En prueba",
  active: "Activa",
  past_due: "Morosa",
  paused: "Pausada",
  canceled: "Cancelada",
};

export default function SuperAdminPanelPage() {
  const router = useRouter();
  const { profile, loading: authLoading, setActiveOrg } = useAuth();
  const isSA = isSuperAdmin((profile?.role ?? null) as UserRole | null);
  const { orgs, loading } = useOrganizations(isSA);

  if (!authLoading && !isSA) {
    return <p className="text-muted-foreground">No tienes acceso a esta sección.</p>;
  }

  async function enter(orgId: string) {
    try {
      await setActiveOrg(orgId);
      router.push("/dashboard");
      router.refresh();
    } catch {
      toast.error("No se pudo cambiar de organización");
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Organizaciones" description="Panel de administración del SaaS" />
      <DataTable
        loading={loading || authLoading}
        data={orgs}
        keyAccessor={(o) => o.id}
        emptyMessage="No hay organizaciones"
        columns={[
          { header: "Organización", cell: (o) => (
            <div><span className="font-medium">{o.name}</span>
            <span className="block text-xs text-muted-foreground">{o.slug}</span></div>
          )},
          { header: "Empleados", cell: (o) => o.employee_count },
          { header: "Sedes", cell: (o) => o.location_count },
          { header: "Suscripción", cell: (o) =>
            o.billing_exempt ? "Exenta" : (o.subscription_status ? (SUB_LABELS[o.subscription_status] ?? o.subscription_status) : "—") },
          { header: "Onboarding", cell: (o) => o.onboarding_completed_at ? "Completo" : "Pendiente" },
          { header: "", cell: (o) => (
            <Button size="sm" onClick={() => enter(o.id)}>Trabajar en esta org</Button>
          )},
        ]}
      />
    </div>
  );
}
```

> Verificar las props reales de `DataTable` y `PageHeader` en `src/components/shared/` y ajustar (p.ej. si `columns` usa `accessorKey` o si `PageHeader` recibe `description`). No inventar props.

- [ ] **Step 2: Verificar build**

Run: `npm run build` — Expected: la ruta `/super-admin` aparece en el output, sin errores.

- [ ] **Step 3: Commit**

```bash
git add "src/app/(authenticated)/super-admin/page.tsx"
git commit -m "feat(superadmin): panel SaaS /super-admin (lista de orgs + entrar)"
```

---

## Task 7: Selector global + indicador en el navbar

**Files:**
- Create: `src/components/layout/tenant-switcher.tsx`
- Modify: `src/components/layout/navbar.tsx`

**ANTES de escribir TSX:** invocar `modern-web-guidance` con query `"combobox select dropdown accessible keyboard"` y aplicar DOs/DON'Ts. Usar el componente de shadcn ya presente (`Select` o `Command`/`Popover` si existe) — verificar en `src/components/ui/`.

- [ ] **Step 1: Implementar el selector**

Crear `src/components/layout/tenant-switcher.tsx`. Visible solo para super_admin. Muestra "Viendo: [Org] ▾" con la org activa, o "Elige organización" si no hay. Lista las orgs (de `useOrganizations`) + opción "Salir al panel SaaS". Al elegir → `setActiveOrg` + `router.refresh()`.

```tsx
"use client";

import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/use-auth";
import { useOrganizations } from "@/hooks/use-organizations";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

const PANEL_VALUE = "__panel__";

export function TenantSwitcher() {
  const router = useRouter();
  const { isSuperAdmin, activeOrg, setActiveOrg } = useAuth();
  const { orgs } = useOrganizations(isSuperAdmin);

  if (!isSuperAdmin) return null;

  async function onChange(value: string) {
    await setActiveOrg(value === PANEL_VALUE ? null : value);
    if (value === PANEL_VALUE) {
      router.push("/super-admin");
    } else {
      router.refresh();
    }
  }

  return (
    <Select value={activeOrg?.id ?? PANEL_VALUE} onValueChange={onChange}>
      <SelectTrigger className="w-[220px]" aria-label="Organización activa">
        <SelectValue placeholder="Elige organización" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={PANEL_VALUE}>← Panel SaaS (todas)</SelectItem>
        {orgs.map((o) => (
          <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
```

- [ ] **Step 2: Montar en el navbar + indicador**

Modificar `src/components/layout/navbar.tsx`. Importar `TenantSwitcher` y `useAuth().activeOrg`. Insertar el switcher en el lado izquierdo (después del botón de menú, antes del `flex-1`). Cuando hay `activeOrg`, aplicar una franja de color distintiva al `<header>` para que el modo operación sea inconfundible:

```tsx
import { TenantSwitcher } from "@/components/layout/tenant-switcher";
// ...
const { profile, activeOrg } = useAuth();
// header className condicional:
<header className={cn(
  "sticky top-0 z-40 flex h-16 items-center border-b px-4 lg:px-6",
  activeOrg ? "bg-amber-50 border-amber-300 dark:bg-amber-950/40" : "bg-card"
)}>
  <Button variant="ghost" size="icon" className="lg:hidden" onClick={onMenuClick} aria-label="Abrir menú">
    <Menu className="size-5" aria-hidden="true" />
  </Button>
  <div className="ml-2 hidden lg:block"><TenantSwitcher /></div>
  {activeOrg && (
    <span className="ml-3 text-sm font-medium text-amber-900 dark:text-amber-200">
      Operando como {activeOrg.name}
    </span>
  )}
  <div className="flex-1" />
  {/* ...resto igual... */}
```

Añadir `import { cn } from "@/lib/utils";` si no está.

- [ ] **Step 3: Verificar build**

Run: `npm run build` — Expected: sin errores.

- [ ] **Step 4: Commit**

```bash
git add src/components/layout/tenant-switcher.tsx src/components/layout/navbar.tsx
git commit -m "feat(superadmin): selector global de tenant + indicador modo operación"
```

---

## Task 8: Migrar los inserts a `effectiveOrgId`

**Files (cada uno reemplaza `profile?.organization_id ?? ""` por `effectiveOrgId` de `useAuth()`):**
- `src/app/(authenticated)/schedule/page.tsx` (2: líneas ~276, ~399)
- `src/app/(authenticated)/departments/page.tsx` (~210)
- `src/app/(authenticated)/positions/page.tsx` (~188)
- `src/app/(authenticated)/locations/page.tsx` (~175)
- `src/app/(authenticated)/shifts/page.tsx` (~208)
- `src/app/(authenticated)/contract-types/contract-type-form.tsx` (2: ~244, ~285)
- `src/components/settings/salaries-visibility-toggle.tsx` (~49)
- `src/components/settings/payment-frequency-selector.tsx` (~61)
- `src/components/nomina/payroll-setting-form.tsx` (~81)
- `src/components/schedule/auto-generate-dialog.tsx` (~306)
- `src/components/nomina/period-generate-modal.tsx` (~111)
- `src/components/nomina/period-override-form.tsx` (~100)
- `src/components/requests/swap-tab.tsx` (~160)
- `src/components/requests/time-off-tab.tsx` (~101)
- `src/components/employees/salary-adjustment-form.tsx` (~71)
- `src/components/employees/salary-cell.tsx` (~105)
- `src/components/employees/salary-change-form.tsx` (~101)
- `src/components/employees/tax-deductions-form.tsx` (~81)
- `src/components/employees/absence-form.tsx` (~135)

- [ ] **Step 1: Localizar todas las ocurrencias**

Run: `grep -rn 'organization_id: profile?.organization_id ?? ""' src/ ; grep -rn 'organization_id ?? ""' src/`
Expected: la lista de archivos de arriba.

- [ ] **Step 2: En cada archivo, obtener `effectiveOrgId` de `useAuth()`**

Para cada componente: si ya hace `const { profile } = useAuth();`, cambiar a `const { profile, effectiveOrgId } = useAuth();`. Si no usa `useAuth`, añadir el import `import { useAuth } from "@/hooks/use-auth";` y el hook. Luego reemplazar:

```typescript
// ANTES
organization_id: profile?.organization_id ?? "",
// DESPUÉS
organization_id: effectiveOrgId ?? "",
```

> El `?? ""` se conserva como fallback defensivo: si por alguna razón no hay org efectiva, el RLS `WITH CHECK` rechaza el insert con error visible (no es fuga). El happy path siempre tendrá `effectiveOrgId`.

- [ ] **Step 3: Verificar que no quedan ocurrencias viejas**

Run: `grep -rn 'profile?.organization_id ?? ""' src/`
Expected: sin resultados (o solo en API routes server-side, que no usan `useAuth`; esos se dejan — ver nota del spec §4.3).

- [ ] **Step 4: Verificar build + tests**

Run: `npm run build && npm run test`
Expected: build OK; tests verdes (495+ pass, 1 skip Wompi).

- [ ] **Step 5: Commit**

```bash
git add src/
git commit -m "fix(superadmin): inserts usan effectiveOrgId (super_admin puede crear en tenant activo)"
```

---

## Task 9: Login redirect + middleware

**Files:**
- Modify: `src/app/login/page.tsx` (~línea 39)
- Modify: `src/lib/supabase/middleware.ts` (R5 ~161, login redirect ~229)

- [ ] **Step 1: Login redirect por rol**

En `src/app/login/page.tsx`, tras login exitoso, reemplazar `router.push("/dashboard")`. El perfil aún no está en contexto aquí; consultar el rol directo:

```typescript
const { data: { user } } = await supabase.auth.getUser();
let dest = "/dashboard";
if (user) {
  const { data: prof } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (prof?.role === "super_admin") dest = "/super-admin";
}
router.push(dest);
router.refresh();
```

- [ ] **Step 2: Middleware R5 → /super-admin**

En `src/lib/supabase/middleware.ts`, en R5 (super_admin en subdomain), cambiar el destino de `/admin/demo-requests` a `/super-admin`:

```typescript
if (user && profile?.role === "super_admin" && tenantOrg && rootDomain) {
  return NextResponse.redirect(buildRootUrl("/super-admin", rootDomain, port), 308);
}
```

- [ ] **Step 3: Middleware — login redirect del super_admin**

En el bloque `if (user && path.startsWith("/login"))` (~229), enviar al super_admin a `/super-admin`. El `profile.role` ya está disponible en ese punto:

```typescript
if (user && path.startsWith("/login")) {
  const url = request.nextUrl.clone();
  url.pathname = profile?.role === "super_admin" ? "/super-admin" : "/dashboard";
  return NextResponse.redirect(url);
}
```

- [ ] **Step 4: Middleware — guard "elige organización"**

Añadir, después del bloque de onboarding (después de R9, ~250), un guard: super_admin **sin** tenant activo que entra a una ruta operativa (no `/super-admin`, no `/admin`, no público) → `/super-admin`. Requiere conocer si hay tenant activo; leerlo solo cuando `role === 'super_admin'`:

```typescript
// R11. super_admin sin tenant activo en ruta operativa -> al panel
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
```

- [ ] **Step 5: Verificar build**

Run: `npm run build` — Expected: sin errores.

- [ ] **Step 6: Commit**

```bash
git add src/app/login/page.tsx src/lib/supabase/middleware.ts
git commit -m "feat(superadmin): login + middleware enrutan super_admin a /super-admin"
```

---

## Task 10: Smoke E2E en preview

**Files:** ninguno (validación manual en preview de Vercel).

- [ ] **Step 1: Push de la rama y esperar preview**

```bash
git push -u origin feature/sub-proyecto-7-superadmin
```
Abrir el preview de Vercel de la rama. (Las env vars `ANON_KEY`/`SERVICE_ROLE_KEY` ya están en scope Preview de todas las ramas.)

- [ ] **Step 2: Recorrido completo (login como super_admin `suv411@hotmail.com`)**

Verificar, anotando resultado de cada paso:
1. Login → aterriza en `/super-admin` con la tabla de 2 orgs (Les Raptors, Base Laboral SAS) y sus métricas.
2. "Trabajar en Les Raptors" → va a `/dashboard`; el navbar muestra franja ámbar "Operando como Les Raptors".
3. `/employees` muestra **solo** los 17 de Les Raptors (no mezclados con Base Laboral).
4. Crear una sede de prueba en `/locations` → **se crea sin error** (antes fallaba). Borrarla.
5. Selector del navbar → cambiar a "Base Laboral SAS" → `/dashboard` refleja esa org (1 empleado).
6. Selector → "← Panel SaaS" → vuelve a `/super-admin` y la franja ámbar desaparece.
7. Navegar manualmente a `/dashboard` estando en el panel (sin tenant activo) → middleware R11 redirige a `/super-admin`.

- [ ] **Step 3: Verificar no-regresión de tenant normal**

Login como admin de Les Raptors (`admin@apphorarios.com`) en `les-raptors.tushorarios.com` → opera normal, sin selector de tenant, ve solo su org. (Confirma que los usuarios normales no se afectaron.)

- [ ] **Step 4: Documentar resultado**

Anotar en el PR el resultado del smoke. Si todo verde, listo para merge.

---

## Self-Review (completado por el autor del plan)

- **Cobertura del spec:** §4.1 (tenant activo/3 funciones) → Task 1-3. §4.2 (seguridad/casos borde) → Task 2 tests 4-5 + Task 3 step 3 no-regresión. §4.3 (inserts) → Task 8. §4.4 (auditoría) → preservada por diseño (auth.uid() no cambia; nota en migración). §5.1 (panel) → Task 6. §5.2 (selector+indicador) → Task 7. §5.3 (AuthContext+routing) → Task 4 + Task 9. §6 (testing) → Task 2 (SQL), Task 4 (Vitest), Task 10 (smoke).
- **Placeholders:** ninguno; cada step trae código o comando concreto. Las dos notas "verificar props reales de DataTable/relación subscriptions" son validaciones contra el código generado, no placeholders de lógica.
- **Consistencia de tipos:** `effectiveOrgId`, `activeOrg`, `setActiveOrg`, `isSuperAdmin` usados igual en Tasks 4/6/7/8. RPC `set_active_org(p_org_id)` consistente entre migración (Task 1), AuthContext (Task 4) y test (Task 2).
- **Riesgo conocido:** Task 1-3 tocan funciones core de RLS; mitigado por Task 2 (validación en transacción ROLLBACK) y Task 3 step 3 (re-correr el test de aislamiento existente). Auditar otros usos de `is_super_admin()` en triggers/RPCs durante Task 3 (buscar `is_super_admin` en `supabase/migrations/*.sql` fuera de policies).
