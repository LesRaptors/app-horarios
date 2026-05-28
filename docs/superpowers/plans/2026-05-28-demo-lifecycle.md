# Ciclo de vida de solicitudes de demo — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Detectar duplicados de solicitudes de demo (guiar a quien ya tiene cuenta), impedir orgs zombie al aprobar, crear la subscription en trial para que la vigencia funcione, y exponer trazabilidad en el panel.

**Architecture:** La detección de duplicados vive dentro del endpoint público existente `POST /api/demo-requests` (service_role + rate-limit). Una función pura clasifica el resultado. El `approve_demo_request` RPC se redefine para crear la `subscription` atómicamente. El panel admin gana un guard, "Reenviar acceso", y trazabilidad.

**Tech Stack:** Next.js 14 (App Router, route handlers + client components), Supabase (Postgres + RPC + Auth admin), TypeScript, Tailwind + shadcn/ui, Vitest, SQL tests (`BEGIN…ROLLBACK`).

**Skills/plugins para subagentes:** `modern-web-guidance:modern-web-guidance` (MANDATORY antes de tocar UI/TSX), `supabase:supabase` (RPC/migraciones), plugin `supabase` MCP (`apply_migration`, `execute_sql`, `generate_typescript_types`). Pin `model: opus` para Task 1 (RPC) y reviewers; `model: sonnet` para el resto.

---

## File Structure

**Crear:**
- `supabase/migrations/056_demo_lifecycle.sql` — `demo_requests.updated_at` + trigger; redefine `approve_demo_request` con `subscription`.
- `supabase/tests/approve_demo_request_subscription.sql` — SQL test del nuevo comportamiento.
- `src/lib/landing/classify-demo.ts` — función pura `classifyDemoSubmission`.
- `src/lib/landing/classify-demo.test.ts` — Vitest.
- `src/app/api/admin/demo-requests/resend-access/route.ts` — route "Reenviar acceso".

**Modificar:**
- `src/app/api/demo-requests/route.ts` — detección de cuenta + dedupe; devuelve `outcome`.
- `src/components/landing/DemoForm.tsx` — ramas de UI por `outcome`.
- `src/app/api/admin/demo-requests/approve/route.ts` — guard de email existente (409).
- `src/app/(authenticated)/admin/demo-requests/page.tsx` — badge "Ya tiene cuenta" + acciones + `contacted_at` + detalle/notes.
- `src/lib/supabase/database.types.ts` — regenerado.

---

## Task 1: Migración 056 — updated_at + subscription al aprobar

**Files:**
- Create: `supabase/migrations/056_demo_lifecycle.sql`

**Contexto:** El RPC actual (`supabase/migrations/044_reserved_slugs.sql:58-114`) crea la org en `trialing` con `trial_ends_at = now()+30d` pero NO crea fila en `subscriptions`. `subscriptions` requiere `plan_id` (FK a `plans`: seed `starter`/`pro`/`enterprise`), `status`, `current_period_start`, `current_period_end`. El diálogo pasa `p_plan` ∈ {trial,starter,pro,enterprise}; si no es un plan real, default a `starter`.

- [ ] **Step 1: Escribir el archivo de migración**

Crear `supabase/migrations/056_demo_lifecycle.sql`:

```sql
-- =============================================================================
-- 056: Ciclo de vida de demos — updated_at + subscription al aprobar
-- =============================================================================
-- 1. demo_requests.updated_at (para dedupe de solicitudes pendientes).
-- 2. approve_demo_request ahora crea la subscription en 'trialing' (vigencia
--    real: el dunning opera sobre subscriptions, no sobre organizations).
-- =============================================================================

BEGIN;

-- 1. updated_at + trigger
ALTER TABLE public.demo_requests
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

DROP TRIGGER IF EXISTS demo_requests_set_updated_at ON public.demo_requests;
CREATE TRIGGER demo_requests_set_updated_at
  BEFORE UPDATE ON public.demo_requests
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 2. Redefinir approve_demo_request para crear la subscription en trial.
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
  v_trial_end TIMESTAMPTZ := now() + INTERVAL '30 days';
  -- subscriptions.plan_id es FK a plans (starter/pro/enterprise). Si el plan
  -- elegido no es real (p. ej. 'trial'), default a 'starter'.
  v_plan_id TEXT := CASE WHEN p_plan IN ('starter','pro','enterprise') THEN p_plan ELSE 'starter' END;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = p_approver_id AND role = 'super_admin' AND is_active = true
  ) THEN
    RAISE EXCEPTION 'Forbidden: approver must be active super_admin'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF lower(p_org_slug) = ANY(reserved) THEN
    RAISE EXCEPTION 'Slug "%" is reserved and cannot be used', p_org_slug
      USING ERRCODE = 'check_violation';
  END IF;

  INSERT INTO organizations (name, slug, plan, status, trial_ends_at, country)
  VALUES (p_org_name, p_org_slug, p_plan, 'trialing', v_trial_end, 'CO')
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

  -- NUEVO: crear subscription en trial (vigencia real para el dunning)
  INSERT INTO subscriptions (organization_id, plan_id, status, current_period_start, current_period_end)
  VALUES (v_new_org_id, v_plan_id, 'trialing', now(), v_trial_end);

  RETURN jsonb_build_object(
    'success', true,
    'organization_id', v_new_org_id,
    'trial_ends_at', v_trial_end
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.approve_demo_request(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, UUID) TO authenticated;

COMMIT;
```

> Nota: `set_updated_at()` ya existe en el repo (usado por otras tablas, p. ej. `subscriptions_set_updated_at` en migración 046). Verificar que existe: `SELECT to_regprocedure('public.set_updated_at()');` — si no existe, crearla en la migración (`CREATE OR REPLACE FUNCTION public.set_updated_at() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;`).

- [ ] **Step 2: Verificar `set_updated_at` existe (antes de aplicar)**

Vía Supabase MCP `execute_sql`: `SELECT to_regprocedure('public.set_updated_at()') IS NOT NULL AS existe;`
Si `existe = false`, añadir la definición de `set_updated_at()` al inicio de la migración (bloque del Step 1, antes del trigger).

- [ ] **Step 3: Commit (NO aplicar aún — Task 2 valida primero)**

```bash
git add supabase/migrations/056_demo_lifecycle.sql
git commit -m "feat(demo): migración 056 (updated_at + subscription al aprobar)"
```

---

## Task 2: SQL test del nuevo approve_demo_request

**Files:**
- Create: `supabase/tests/approve_demo_request_subscription.sql`

Sigue el patrón `BEGIN…ROLLBACK` de `supabase/tests/`. Aplica el DDL de 056 inline (sin BEGIN/COMMIT) y valida que aprobar crea la subscription.

- [ ] **Step 1: Escribir el test**

Crear `supabase/tests/approve_demo_request_subscription.sql`:

```sql
BEGIN;

-- (a) DDL de migración 056 inline (copiar de 056_demo_lifecycle.sql SIN sus BEGIN/COMMIT):
--     el ALTER TABLE + trigger + CREATE OR REPLACE FUNCTION approve_demo_request.

-- (b) Setup
INSERT INTO auth.users (id) VALUES ('99999999-0000-0000-0000-000000000009');
INSERT INTO profiles (id, email, first_name, last_name, role, organization_id, is_active)
  VALUES ('99999999-0000-0000-0000-000000000009', 'super@saas.com', 'Super', 'Admin', 'super_admin', NULL, true);

INSERT INTO demo_requests (id, nombre, email, empresa, telefono, sector, status)
  VALUES ('dddddddd-0000-0000-0000-000000000001', 'Lead Test', 'lead-test@example.com', 'Acme SAS', '3001234567', 'otro', 'new');

-- (c) Aprobar
DO $$
DECLARE v_result JSONB; v_org UUID; v_sub_count INT; v_sub_status TEXT; v_period_end TIMESTAMPTZ; v_trial_end TIMESTAMPTZ;
BEGIN
  SELECT approve_demo_request(
    'dddddddd-0000-0000-0000-000000000001',
    'Acme SAS', 'acme-sas', 'starter',
    'lead-test@example.com', 'Lead', 'Test',
    '99999999-0000-0000-0000-000000000009'
  ) INTO v_result;

  v_org := (v_result->>'organization_id')::UUID;
  v_trial_end := (v_result->>'trial_ends_at')::TIMESTAMPTZ;

  -- TEST 1: se creó exactamente 1 subscription para la org
  SELECT COUNT(*) INTO v_sub_count FROM subscriptions WHERE organization_id = v_org;
  ASSERT v_sub_count = 1, format('TEST 1 FAILED: %s subscriptions creadas (esperado 1)', v_sub_count);

  -- TEST 2: status trialing + current_period_end = trial_ends_at
  SELECT status, current_period_end INTO v_sub_status, v_period_end FROM subscriptions WHERE organization_id = v_org;
  ASSERT v_sub_status = 'trialing', format('TEST 2a FAILED: status=%s', v_sub_status);
  ASSERT v_period_end = v_trial_end, 'TEST 2b FAILED: current_period_end != trial_ends_at';

  -- TEST 3: demo marcado approved con la org
  ASSERT (SELECT status FROM demo_requests WHERE id = 'dddddddd-0000-0000-0000-000000000001') = 'approved', 'TEST 3 FAILED';

  RAISE NOTICE 'approve_demo_request_subscription: 3 tests PASSED';
END $$;

-- TEST 4: plan inválido ('trial') cae a 'starter'
INSERT INTO demo_requests (id, nombre, email, empresa, telefono, sector, status)
  VALUES ('dddddddd-0000-0000-0000-000000000002', 'Lead 2', 'lead2@example.com', 'Beta SAS', '3001112222', 'otro', 'new');
DO $$
DECLARE v_result JSONB; v_plan TEXT;
BEGIN
  SELECT approve_demo_request(
    'dddddddd-0000-0000-0000-000000000002',
    'Beta SAS', 'beta-sas', 'trial',
    'lead2@example.com', 'Lead', 'Two',
    '99999999-0000-0000-0000-000000000009'
  ) INTO v_result;
  SELECT plan_id INTO v_plan FROM subscriptions WHERE organization_id = (v_result->>'organization_id')::UUID;
  ASSERT v_plan = 'starter', format('TEST 4 FAILED: plan_id=%s (esperado starter)', v_plan);
  RAISE NOTICE 'TEST 4 PASSED: plan trial -> starter';
END $$;

ROLLBACK;
SELECT 'approve_demo_request_subscription: 4 tests PASSED' AS result;
```

- [ ] **Step 2: Ejecutar contra cloud (debe pasar)**

Vía Supabase MCP `execute_sql` con el contenido completo.
Expected: `approve_demo_request_subscription: 4 tests PASSED`. Si falla por setup (columnas faltantes, etc.), ajustar el seed; no debilitar las aserciones.

- [ ] **Step 3: Commit**

```bash
git add supabase/tests/approve_demo_request_subscription.sql
git commit -m "test(demo): subscription creada al aprobar (4 tests)"
```

---

## Task 3: Aplicar migración 056 + regenerar tipos

**Files:**
- Modify: `src/lib/supabase/database.types.ts`

- [ ] **Step 1: Aplicar** vía Supabase MCP `apply_migration` (name `056_demo_lifecycle`, contenido del archivo). Si error de transacción anidada, reintentar sin el BEGIN/COMMIT externo.
- [ ] **Step 2: Verificar** vía `execute_sql`: `SELECT to_regclass('public.demo_requests') IS NOT NULL; SELECT column_name FROM information_schema.columns WHERE table_name='demo_requests' AND column_name='updated_at';` (debe devolver updated_at). Y `pg_get_functiondef('public.approve_demo_request'::regproc)` contiene `INSERT INTO subscriptions`.
- [ ] **Step 3: Regenerar tipos** vía `generate_typescript_types`, sobrescribir `src/lib/supabase/database.types.ts`. Confirmar que `demo_requests.Row` incluye `updated_at`.
- [ ] **Step 4: tsc** `npx tsc --noEmit 2>&1 | grep -v test.ts | head` → sin errores nuevos.
- [ ] **Step 5: Commit**

```bash
git add src/lib/supabase/database.types.ts
git commit -m "chore(demo): aplicar migración 056 + regen types"
```

---

## Task 4: `classifyDemoSubmission` (función pura, TDD)

**Files:**
- Create: `src/lib/landing/classify-demo.ts`
- Create: `src/lib/landing/classify-demo.test.ts`

- [ ] **Step 1: Test**

Crear `src/lib/landing/classify-demo.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { classifyDemoSubmission } from "./classify-demo";

describe("classifyDemoSubmission", () => {
  it("email con cuenta -> existing_account (gana sobre pendiente)", () => {
    expect(classifyDemoSubmission(true, "req-1")).toBe("existing_account");
    expect(classifyDemoSubmission(true, null)).toBe("existing_account");
  });
  it("sin cuenta pero con solicitud pendiente -> duplicate_pending", () => {
    expect(classifyDemoSubmission(false, "req-1")).toBe("duplicate_pending");
  });
  it("sin cuenta ni pendiente -> created", () => {
    expect(classifyDemoSubmission(false, null)).toBe("created");
  });
});
```

- [ ] **Step 2: Verificar que falla** — Run `npm run test -- classify-demo` → FAIL (módulo no existe).

- [ ] **Step 3: Implementar**

Crear `src/lib/landing/classify-demo.ts`:

```typescript
export type DemoOutcome = "created" | "existing_account" | "duplicate_pending";

/**
 * Decide qué hacer con un envío del formulario de demo.
 * - Si el email ya tiene cuenta -> existing_account (guiar a login/recuperar).
 * - Si no, pero ya hay una solicitud pendiente -> duplicate_pending (deduplicar).
 * - Si no -> created (insertar nueva).
 * "Tiene cuenta" tiene prioridad sobre "pendiente".
 */
export function classifyDemoSubmission(
  hasAccount: boolean,
  pendingRequestId: string | null
): DemoOutcome {
  if (hasAccount) return "existing_account";
  if (pendingRequestId) return "duplicate_pending";
  return "created";
}
```

- [ ] **Step 4: Verificar que pasa** — Run `npm run test -- classify-demo` → PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/landing/classify-demo.ts src/lib/landing/classify-demo.test.ts
git commit -m "feat(demo): classifyDemoSubmission puro (TDD)"
```

---

## Task 5: Detección de cuenta + dedupe en `POST /api/demo-requests`

**Files:**
- Modify: `src/app/api/demo-requests/route.ts`

**Contexto:** El route (líneas 50-72) usa `createAdminClient()` y hace `INSERT` directo tras honeypot. Insertamos la lógica de clasificación justo antes del INSERT y devolvemos `outcome`.

- [ ] **Step 1: Insertar la lógica antes del INSERT actual**

En `src/app/api/demo-requests/route.ts`, tras `const supabase = createAdminClient();` (línea 53) y ANTES del `INSERT`, añadir:

```typescript
import { classifyDemoSubmission } from "@/lib/landing/classify-demo";
// ...dentro del POST, tras crear `supabase` admin client:

// ¿El email ya tiene cuenta? (profile existente)
const { data: existingProfile } = await supabase
  .from("profiles")
  .select("id")
  .ilike("email", email)
  .maybeSingle();

// ¿Hay una solicitud pendiente con ese email?
const { data: pendingReq } = await supabase
  .from("demo_requests")
  .select("id")
  .ilike("email", email)
  .in("status", ["new", "contacted", "scheduled"])
  .order("created_at", { ascending: false })
  .limit(1)
  .maybeSingle();

const outcome = classifyDemoSubmission(!!existingProfile, pendingReq?.id ?? null);

if (outcome === "existing_account") {
  return NextResponse.json({ ok: true, outcome });
}

if (outcome === "duplicate_pending" && pendingReq) {
  // Deduplicar: actualizar la solicitud pendiente con los datos nuevos
  await supabase
    .from("demo_requests")
    .update({ nombre, empresa, telefono, sector, mensaje: mensaje || null })
    .eq("id", pendingReq.id);
  return NextResponse.json({ ok: true, outcome });
}
// outcome === "created" -> continúa al INSERT + emails existentes
```

Al final del flujo `created` (donde hoy retorna), cambiar el retorno a incluir el outcome: `return NextResponse.json({ ok: true, outcome: "created" });` (buscar el `return NextResponse.json` de éxito tras enviar los emails — añadir `outcome: "created"`).

- [ ] **Step 2: Verificar build + tipos**

Run: `npm run build 2>&1 | grep -E "Compiled|error" | head` → Compiled successfully.
Run: `npx tsc --noEmit 2>&1 | grep -v test.ts | head` → sin errores nuevos.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/demo-requests/route.ts
git commit -m "feat(demo): detección de cuenta existente + dedupe de pendientes en /api/demo-requests"
```

---

## Task 6: DemoForm reacciona al outcome

**Files:**
- Modify: `src/components/landing/DemoForm.tsx`

**ANTES de tocar TSX:** invocar `modern-web-guidance` con query `"form success alert links accessible"` y aplicar DOs/DON'Ts.

**Contexto:** Hoy (`DemoForm.tsx:64-80`) `onSubmit` hace POST y si `ok` → `router.push('/gracias')`. El payload ahora trae `outcome`. Para `created` y `duplicate_pending` mantenemos un mensaje de éxito; para `existing_account` mostramos un bloque con enlaces a login/recuperar.

- [ ] **Step 1: Añadir estado y manejo de outcome**

En `DemoForm.tsx`:
- Ampliar el tipo `Status`: `type Status = 'idle' | 'submitting' | 'error' | 'existing_account';`
- En `onSubmit`, reemplazar el bloque `if (!res.ok ...) throw ...; router.push('/gracias');` por:

```typescript
const payload = await res.json();
if (!res.ok || !payload.ok) throw new Error(payload.error || 'unknown');
if (payload.outcome === 'existing_account') {
  setStatus('existing_account');
  return;
}
// created o duplicate_pending -> página de gracias
router.push('/gracias');
```

- [ ] **Step 2: Renderizar el bloque "ya tienes cuenta"**

Antes del bloque de error (`{status === 'error' ...}`), añadir:

```tsx
{status === 'existing_account' ? (
  <div role="status" aria-live="polite" className="mt-5 flex items-start gap-3 p-4 rounded-lg bg-blue-50 border border-blue-200 text-blue-900 text-sm">
    <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" aria-hidden="true" />
    <div>
      <p className="font-semibold">Parece que ya tienes una cuenta en Tus Horarios</p>
      <p className="mt-1">Inicia sesión o recupera tu contraseña para entrar.</p>
      <div className="mt-3 flex gap-3">
        <a href="/login" className="font-semibold underline">Iniciar sesión</a>
        <a href="/forgot-password" className="font-semibold underline">¿Olvidaste tu contraseña?</a>
      </div>
    </div>
  </div>
) : null}
```

- [ ] **Step 3: Build** — Run `npm run build 2>&1 | grep -E "Compiled|error" | head` → Compiled successfully.

- [ ] **Step 4: Commit**

```bash
git add src/components/landing/DemoForm.tsx
git commit -m "feat(demo): DemoForm guía a login/recuperar si el email ya tiene cuenta"
```

---

## Task 7: Guard en approve + route "Reenviar acceso"

**Files:**
- Modify: `src/app/api/admin/demo-requests/approve/route.ts`
- Create: `src/app/api/admin/demo-requests/resend-access/route.ts`

- [ ] **Step 1: Guard de email existente en approve**

En `src/app/api/admin/demo-requests/approve/route.ts`, tras el bloque "2b. Validar slug" (línea 70) y antes de `const adminSupabase = createAdminClient();` (línea 72) — mover `createAdminClient()` arriba o reutilizar. Insertar:

```typescript
const adminSupabase = createAdminClient();

// 2c. Guard: si el email ya tiene cuenta, NO crear org zombie.
const { data: existing } = await adminSupabase
  .from("profiles")
  .select("organization_id")
  .ilike("email", admin_email)
  .maybeSingle();

if (existing) {
  let existingOrg: { name: string; slug: string; trial_ends_at: string | null } | null = null;
  if (existing.organization_id) {
    const { data: org } = await adminSupabase
      .from("organizations")
      .select("name, slug, trial_ends_at")
      .eq("id", existing.organization_id)
      .maybeSingle();
    existingOrg = org ?? null;
  }
  return NextResponse.json(
    {
      error: existingOrg
        ? `Este email ya tiene la organización "${existingOrg.name}". Usa "Reenviar acceso" para que recupere su contraseña.`
        : "Este email ya tiene una cuenta. Usa \"Reenviar acceso\".",
      existingOrg,
    },
    { status: 409 }
  );
}
```

Eliminar la línea `const adminSupabase = createAdminClient();` duplicada que estaba en la línea 72 original (ahora se crea arriba).

- [ ] **Step 2: Route resend-access**

Crear `src/app/api/admin/demo-requests/resend-access/route.ts`:

```typescript
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { isSuperAdmin } from "@/lib/auth/can-manage";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import type { UserRole } from "@/lib/types";

const Schema = z.object({ email: z.string().email() });

export async function POST(request: NextRequest) {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const { data: caller } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (!isSuperAdmin((caller?.role ?? null) as UserRole | null)) {
    return NextResponse.json({ error: "Solo super_admin" }, { status: 403 });
  }

  const parse = Schema.safeParse(await request.json());
  if (!parse.success) return NextResponse.json({ error: "Email inválido" }, { status: 400 });

  const appUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.tushorarios.com";
  const admin = createAdminClient();
  const { error } = await admin.auth.resetPasswordForEmail(parse.data.email, {
    redirectTo: `${appUrl}/auth/set-password`,
  });
  if (error) {
    console.error("[resend-access] error:", error);
    return NextResponse.json({ error: "No se pudo reenviar el acceso" }, { status: 500 });
  }
  return NextResponse.json({ success: true });
}
```

- [ ] **Step 3: Build + tipos** — Run `npm run build 2>&1 | grep -E "Compiled|error" | head` y `npx tsc --noEmit 2>&1 | grep -v test.ts | head` → sin errores nuevos.

- [ ] **Step 4: Commit**

```bash
git add "src/app/api/admin/demo-requests/approve/route.ts" "src/app/api/admin/demo-requests/resend-access/route.ts"
git commit -m "feat(demo): guard de email existente al aprobar + route reenviar acceso"
```

---

## Task 8: Panel admin — badge "Ya tiene cuenta", contacted_at, reenviar acceso

**Files:**
- Modify: `src/app/(authenticated)/admin/demo-requests/page.tsx`

**ANTES de tocar TSX:** invocar `modern-web-guidance` con query `"table actions badge accessible button"`.

**Contexto:** La página (`page.tsx`) lista demo_requests y renderiza acciones (Aprobar/Contactado/Rechazar para pendientes, "→ Org creada" para aprobados). Añadimos: (a) saber qué emails ya tienen cuenta; (b) para esos, badge + "Reenviar acceso" + "Descartar"; (c) `contacted_at = now()` al marcar contactado.

- [ ] **Step 1: Cargar set de emails con cuenta**

En `DemoRequestsPage`, añadir estado y carga. Tras `setRequests(...)` en `loadRequests`, consultar qué emails de los visibles tienen profile:

```typescript
const [emailsWithAccount, setEmailsWithAccount] = useState<Set<string>>(new Set());
// ...dentro de loadRequests, después de setRequests:
const emails = (data ?? []).map((r) => r.email.toLowerCase());
if (emails.length > 0) {
  const { data: profs } = await supabase
    .from("profiles")
    .select("email")
    .in("email", emails);
  setEmailsWithAccount(new Set((profs ?? []).map((p) => (p.email ?? "").toLowerCase())));
} else {
  setEmailsWithAccount(new Set());
}
```

> Nota: la RLS de `profiles` permite al super_admin (sin tenant activo) leer todos vía `is_super_admin()`. El `.in("email", ...)` filtra a los relevantes.

- [ ] **Step 2: `contacted_at` al marcar contactado**

Cambiar `markStatus` para setear `contacted_at` cuando el status es `contacted`:

```typescript
async function markStatus(id: string, status: string) {
  const patch: { status: string; contacted_at?: string } = { status };
  if (status === "contacted") patch.contacted_at = new Date().toISOString();
  const { error } = await supabase.from("demo_requests").update(patch).eq("id", id);
  if (error) { toast.error("Error actualizando"); }
  else { toast.success("Estado actualizado"); void loadRequests(); }
}
```

- [ ] **Step 3: Acción "Reenviar acceso"**

Añadir función:

```typescript
async function resendAccess(email: string) {
  const res = await fetch("/api/admin/demo-requests/resend-access", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email }),
  });
  if (res.ok) toast.success("Acceso reenviado (revisar email)");
  else toast.error("No se pudo reenviar el acceso");
}
```

- [ ] **Step 4: Render condicional de acciones**

Reemplazar el `cell` de la columna "Acciones" (líneas 133-163) por: si el email ya tiene cuenta y el demo está pendiente → badge + Reenviar acceso + Descartar; si pendiente y sin cuenta → Aprobar/Contactado/Rechazar (igual que hoy); aprobado → "→ Org creada"; resto → "—".

```tsx
{
  header: "Acciones",
  cell: (r) => {
    const pending = ["new", "contacted", "scheduled"].includes(r.status ?? "");
    const hasAccount = emailsWithAccount.has(r.email.toLowerCase());
    if (pending && hasAccount) {
      return (
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
            Ya tiene cuenta
          </span>
          <Button size="sm" variant="outline" onClick={() => resendAccess(r.email)}>
            Reenviar acceso
          </Button>
          <Button size="sm" variant="outline" onClick={() => markStatus(r.id, "spam")}>
            Descartar
          </Button>
        </div>
      );
    }
    if (pending) {
      return (
        <div className="flex gap-2">
          <Button size="sm" onClick={() => setSelectedLead(r)}>Aprobar</Button>
          {r.status !== "contacted" && (
            <Button size="sm" variant="outline" onClick={() => markStatus(r.id, "contacted")}>Contactado</Button>
          )}
          <Button size="sm" variant="outline" onClick={() => markStatus(r.id, "rejected")}>Rechazar</Button>
        </div>
      );
    }
    if (r.status === "approved" && r.approved_org_id) {
      return <span className="text-sm text-slate-500">&rarr; Org creada</span>;
    }
    return <span className="text-sm text-slate-400">—</span>;
  },
}
```

- [ ] **Step 5: Build** — Run `npm run build 2>&1 | grep -E "Compiled|error" | head` → Compiled successfully.

- [ ] **Step 6: Commit**

```bash
git add "src/app/(authenticated)/admin/demo-requests/page.tsx"
git commit -m "feat(demo): panel marca emails con cuenta (badge + reenviar acceso) + contacted_at"
```

---

## Task 9: Trazabilidad — detalle con quién/cuándo aprobó + notes

**Files:**
- Modify: `src/app/(authenticated)/admin/demo-requests/page.tsx`

**ANTES de tocar TSX:** invocar `modern-web-guidance` con query `"dialog details accessible textarea"`.

**Contexto:** Añadir una columna/acción "Ver" que abre un diálogo con la trazabilidad de la solicitud y un campo `notes` editable.

- [ ] **Step 1: Estado del diálogo de detalle + guardar notes**

En `DemoRequestsPage`:

```typescript
const [detailLead, setDetailLead] = useState<DemoRequest | null>(null);
const [noteDraft, setNoteDraft] = useState("");
// al abrir: setNoteDraft(lead.notes ?? "")

async function saveNotes(id: string, notes: string) {
  const { error } = await supabase.from("demo_requests").update({ notes }).eq("id", id);
  if (error) toast.error("Error guardando notas");
  else { toast.success("Notas guardadas"); void loadRequests(); }
}
```

- [ ] **Step 2: Botón "Ver" en cada fila + diálogo**

Añadir una columna "Detalle" con `<Button size="sm" variant="ghost" onClick={() => { setDetailLead(r); setNoteDraft(r.notes ?? ""); }}>Ver</Button>`.

Añadir el diálogo (usar el componente `Dialog` de `@/components/ui/dialog` — verificar API real). Muestra: nombre, email, empresa, teléfono, sector, mensaje, estado, `created_at`; si `approved_at`: "Aprobado el {fecha}" + (si se puede resolver) quién aprobó + slug de la org (`approved_org_id` → query o link a `/super-admin`). Un `<textarea>` con `noteDraft` + botón "Guardar notas" → `saveNotes(detailLead.id, noteDraft)`.

> Para mostrar quién aprobó: `approved_by` es un UUID. Cargar el nombre con una query puntual al abrir el diálogo (`profiles.select("first_name,last_name").eq("id", approved_by)`), o mostrar el UUID si no se resuelve. Mantenerlo simple: query al abrir.

- [ ] **Step 3: Build** — Run `npm run build 2>&1 | grep -E "Compiled|error" | head` → Compiled successfully.

- [ ] **Step 4: Commit**

```bash
git add "src/app/(authenticated)/admin/demo-requests/page.tsx"
git commit -m "feat(demo): detalle de solicitud con trazabilidad + notas editables"
```

---

## Task 10: Limpieza de duplicados de ceobaselab + smoke E2E

**Files:** ninguno (operación de datos + validación en preview).

- [ ] **Step 1: Descartar los 2 duplicados actuales**

Vía Supabase MCP `execute_sql` (es prod; el email ya tiene la org `base-laboral-sas`):

```sql
UPDATE demo_requests
SET status = 'spam'
WHERE email = 'ceobaselab@gmail.com' AND status = 'new';
```
Verificar: `SELECT status, count(*) FROM demo_requests WHERE email='ceobaselab@gmail.com' GROUP BY status;` → 1 approved, 2 spam.

- [ ] **Step 2: Push + preview**

```bash
git push -u origin feature/sub-proyecto-8-demo-lifecycle
```
Abrir el preview de Vercel de la rama.

- [ ] **Step 3: Smoke E2E** (anotar cada resultado):
  1. Landing del preview → solicitar demo con email nuevo (p. ej. `smoke-nuevo@example.com`) → debe ir a `/gracias` (outcome created). Verificar en BD que se creó la fila.
  2. Re-enviar el formulario con `ceobaselab@gmail.com` → debe mostrar el bloque "Ya tienes una cuenta" + enlaces login/recuperar; **no** se crea fila nueva.
  3. Re-enviar con `smoke-nuevo@example.com` (que quedó pendiente) cambiando la empresa → debe deduplicar (sigue 1 sola fila, empresa actualizada).
  4. Panel `/admin/demo-requests` como super_admin: la fila de un email con cuenta (ceobaselab si reaparece, o el de prueba tras aprobarlo) muestra "Ya tiene cuenta" + "Reenviar acceso". Probar "Reenviar acceso" → verificar que llega el email de recuperación.
  5. Aprobar `smoke-nuevo@example.com` → verificar en BD: org creada + `subscription` `trialing` con `current_period_end = trial_ends_at`.
  6. Abrir "Ver" en una solicitud aprobada → muestra quién/cuándo aprobó + permite guardar una nota.
  7. Marcar otra solicitud como "Contactado" → verificar `contacted_at` poblado en BD.

- [ ] **Step 4: Limpieza de datos de prueba**

Borrar las filas de prueba creadas en el smoke (demo_requests de `smoke-nuevo@example.com`, la org creada + su subscription + auth user). Anotar el resultado del smoke en el PR.

---

## Self-Review (completado por el autor del plan)

- **Cobertura del spec:** §4.1 (dedupe landing) → Task 4+5. §4.2 (DemoForm) → Task 6. §4.3 (guard + resend-access) → Task 7. §4.4 (subscription al aprobar) → Task 1-3. §4.5 (migración updated_at) → Task 1. §4.6 (trazabilidad + contacted_at + notes) → Task 8+9. §4.7 (limpieza) → Task 10. §6 (testing) → Task 2 (SQL), Task 4 (Vitest), Task 10 (smoke).
- **Placeholders:** ninguno; cada step trae código o comando. Las notas ("verificar API real de Dialog", "verificar set_updated_at existe") son validaciones contra el código real, no placeholders de lógica.
- **Consistencia de tipos:** `outcome` (`created`/`existing_account`/`duplicate_pending`) consistente entre `classify-demo.ts` (Task 4), el route (Task 5) y `DemoForm` (Task 6). `DemoOutcome` exportado de classify-demo. `existingOrg` shape consistente entre approve route (Task 7) y su uso. `emailsWithAccount: Set<string>` (lowercase) consistente en Task 8.
- **Riesgo:** Task 1 redefine el RPC de aprobación (core). Mitigado por Task 2 (SQL test BEGIN/ROLLBACK) + smoke Task 10. La detección de cuenta usa `ilike` (case-insensitive) consistentemente en landing y approve.
