# Sub-proyecto 4 — Org Onboarding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Before coding UI/CSS/client-JS, invoke `modern-web-guidance:modern-web-guidance` skill.

**Goal:** Convertir el flow manual de alta de clientes en un flow completo end-to-end: lead llega vía `/demo-request` → super_admin aprueba en `/admin/demo-requests` → cliente recibe email → completa wizard de 6 pasos → queda operativo con trial de 30 días.

**Architecture:** Migración 042 agrega columnas onboarding a `organizations` + RPC atómica `approve_demo_request`. Pantalla mínima `/admin/demo-requests` para super_admin. API `/api/admin/demo-requests/approve` orquesta org-create + invite + email Resend. Wizard `/onboarding/[step]` con 6 pasos persistido en `organizations.onboarding_step`. Middleware redirige post-login al wizard mientras `onboarding_completed_at IS NULL`.

**Tech Stack:** Next.js 14 App Router + TypeScript + Supabase Cloud (`ugkvuinkynvtuiutwlkd`) + Resend + Vitest + Zod + React Email. MCPs disponibles: `plugin_supabase_supabase`, `plugin_vercel_vercel`, `plugin_chrome-devtools-mcp`.

**Spec:** `docs/superpowers/specs/2026-05-20-org-onboarding-design.md` (commit `7b58753`)

**Branch trabajo:** `feature/sub-proyecto-4-onboarding`

**Skills/plugins a consultar antes de codear (siempre):**
- `supabase:supabase` — patrones Auth/RLS/migrations
- `modern-web-guidance:modern-web-guidance` — antes de cada componente UI nuevo
- `vercel:nextjs` — App Router patterns
- MCP `plugin_supabase_supabase` para apply_migration, execute_sql

---

## Pre-flight checks

### Task 0: Verificar pre-condiciones

- [ ] **Step 0.1: Verificar branch base + working tree**

```bash
cd "/Users/usuario/App Horarios"
git checkout main
git pull origin main
git status
```

Expected: HEAD en `7b58753` o más reciente, `working tree clean`.

- [ ] **Step 0.2: Crear feature branch**

```bash
git checkout -b feature/sub-proyecto-4-onboarding
```

- [ ] **Step 0.3: Verificar tests + build pasan en main**

```bash
npm run test
npm run build
```

Expected: `Tests 298 passed` + `✓ Compiled successfully`.

---

## Phase A: Task 0 — Fix super_admin UI guards

### Task 1: Helper `can-manage.ts` con tests TDD

**Files:**
- Create: `src/lib/auth/can-manage.ts`
- Create: `src/lib/auth/can-manage.test.ts`

- [ ] **Step 1.1: Crear test file con tests fallando**

Crear `src/lib/auth/can-manage.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { canManage, canAdmin, isSuperAdmin } from "./can-manage";

describe("canManage", () => {
  it("acepta super_admin", () => expect(canManage("super_admin")).toBe(true));
  it("acepta admin", () => expect(canManage("admin")).toBe(true));
  it("acepta manager", () => expect(canManage("manager")).toBe(true));
  it("rechaza employee", () => expect(canManage("employee")).toBe(false));
  it("rechaza null", () => expect(canManage(null)).toBe(false));
  it("rechaza undefined", () => expect(canManage(undefined)).toBe(false));
});

describe("canAdmin", () => {
  it("acepta super_admin", () => expect(canAdmin("super_admin")).toBe(true));
  it("acepta admin", () => expect(canAdmin("admin")).toBe(true));
  it("rechaza manager", () => expect(canAdmin("manager")).toBe(false));
  it("rechaza employee", () => expect(canAdmin("employee")).toBe(false));
  it("rechaza null", () => expect(canAdmin(null)).toBe(false));
});

describe("isSuperAdmin", () => {
  it("acepta super_admin", () => expect(isSuperAdmin("super_admin")).toBe(true));
  it("rechaza admin", () => expect(isSuperAdmin("admin")).toBe(false));
  it("rechaza manager", () => expect(isSuperAdmin("manager")).toBe(false));
  it("rechaza employee", () => expect(isSuperAdmin("employee")).toBe(false));
  it("rechaza null", () => expect(isSuperAdmin(null)).toBe(false));
});
```

- [ ] **Step 1.2: Correr test → debe fallar (helper no existe)**

```bash
npm run test -- --run src/lib/auth/can-manage.test.ts
```

Expected: FAIL con "Failed to resolve import".

- [ ] **Step 1.3: Implementar helper**

Crear `src/lib/auth/can-manage.ts`:

```typescript
import type { UserRole } from "@/lib/types";

/** Roles autorizados para gestión (configuración + write). Incluye super_admin. */
export function canManage(role: UserRole | null | undefined): boolean {
  return role === "super_admin" || role === "admin" || role === "manager";
}

/** Roles autorizados para acciones admin-only (settings, contract-types). */
export function canAdmin(role: UserRole | null | undefined): boolean {
  return role === "super_admin" || role === "admin";
}

/** True solo para super_admin (acceso cross-org). */
export function isSuperAdmin(role: UserRole | null | undefined): boolean {
  return role === "super_admin";
}
```

- [ ] **Step 1.4: Correr test → deben pasar (16/16)**

```bash
npm run test -- --run src/lib/auth/can-manage.test.ts
```

Expected: `Tests  16 passed`.

- [ ] **Step 1.5: Commit**

```bash
git add src/lib/auth/can-manage.ts src/lib/auth/can-manage.test.ts
git commit -m "feat(auth): can-manage / can-admin / is-super-admin helpers + tests TDD"
```

### Task 2: Refactor sidebar para incluir super_admin

**Files:**
- Modify: `src/components/layout/sidebar.tsx`

- [ ] **Step 2.1: Agregar 'super_admin' a Role union y a cada item de nav**

En `src/components/layout/sidebar.tsx`:

1. Buscar `type Role = ...` y agregar `'super_admin'`. Si no existe el tipo local, agregar `'super_admin'` a `Role[]` en cada item.

2. Para cada item de los arrays `mainNav`, `nominaNav`, `configNav`: agregar `"super_admin"` al array `roles` de TODOS los items (super_admin tiene acceso a todo).

Antes:
```typescript
{ name: "Empleados", href: "/employees", icon: Users, roles: ["admin", "manager"] },
```

Después:
```typescript
{ name: "Empleados", href: "/employees", icon: Users, roles: ["super_admin", "admin", "manager"] },
```

Aplicar la misma transformación a los 18 items totales (mainNav 7 + nominaNav 3 + configNav 8).

- [ ] **Step 2.2: Verificar build pasa**

```bash
npm run build
```

Expected: `✓ Compiled successfully`.

- [ ] **Step 2.3: Commit**

```bash
git add src/components/layout/sidebar.tsx
git commit -m "feat(sidebar): super_admin ve todos los nav items"
```

### Task 3: Refactor 11 UI pages para usar canManage/canAdmin

**Files (11 pages):**
- Modify: `src/app/(authenticated)/contract-types/page.tsx`
- Modify: `src/app/(authenticated)/dashboard/page.tsx`
- Modify: `src/app/(authenticated)/departments/page.tsx`
- Modify: `src/app/(authenticated)/employees/page.tsx`
- Modify: `src/app/(authenticated)/holidays/page.tsx`
- Modify: `src/app/(authenticated)/locations/page.tsx`
- Modify: `src/app/(authenticated)/nomina/ausencias/page.tsx`
- Modify: `src/app/(authenticated)/positions/page.tsx`
- Modify: `src/app/(authenticated)/schedule/page.tsx`
- Modify: `src/app/(authenticated)/shifts/page.tsx`
- Modify: `src/app/(authenticated)/staffing/page.tsx`

- [ ] **Step 3.1: Buscar todos los patrones existentes**

```bash
grep -rEn "role *=== *['\"](admin|manager)['\"]|\[.admin.,. *.manager.\]\.includes\(|role.includes\(['\"](admin|manager)" src/app/\(authenticated\) | grep -v test
```

Anotar cada match línea por línea — son las que vas a reemplazar.

- [ ] **Step 3.2: Refactor mecánico (pages que requieren admin O manager)**

Para cada page que tenga checks `['admin', 'manager'].includes(profile?.role)` o `profile?.role === 'admin' || profile?.role === 'manager'`:

1. Agregar import:
```typescript
import { canManage } from "@/lib/auth/can-manage";
```

2. Reemplazar el check:
Antes:
```typescript
const isAdmin = profile?.role === "admin" || profile?.role === "manager";
// o:
if (!["admin", "manager"].includes(profile?.role ?? "")) { /* sin permisos */ }
```

Después:
```typescript
const isAdmin = canManage(profile?.role);
// o:
if (!canManage(profile?.role)) { /* sin permisos */ }
```

3. Si el booleano se usa para mostrar/ocultar UI, renombrar a `canEdit` o similar (más legible). Opcional.

Aplicar a las 11 pages excepto las de admin-only (siguiente step).

- [ ] **Step 3.3: Pages admin-only → canAdmin**

`/contract-types/page.tsx` y `/settings/page.tsx` (si tiene check) son admin-only. Usar `canAdmin(profile?.role)` en vez de `canManage`.

- [ ] **Step 3.4: Build pasa**

```bash
npm run build
```

Expected: `✓ Compiled successfully`.

- [ ] **Step 3.5: Commit**

```bash
git add src/app/\(authenticated\)
git commit -m "refactor(auth): UI pages usan canManage/canAdmin (incluye super_admin)"
```

### Task 4: Refactor components/hooks + API routes

**Files:**
- Modify: `src/components/requests/swap-tab.tsx`
- Modify: `src/components/requests/time-off-tab.tsx`
- Modify: `src/hooks/use-equidad-dashboard.ts`
- Modify: `src/app/api/employees/demo/route.ts`
- Modify: `src/app/api/employees/demo/convert/route.ts`
- Modify: `src/app/api/employees/demo/transfer/route.ts`
- Modify: `src/app/api/employees/invite/route.ts`
- Modify: `src/app/api/swaps/approve/route.ts`

- [ ] **Step 4.1: Refactor 2 components + 1 hook con canManage**

Igual al Task 3 pero en `src/components/requests/swap-tab.tsx`, `src/components/requests/time-off-tab.tsx`, `src/hooks/use-equidad-dashboard.ts`:

- Importar `canManage` desde `@/lib/auth/can-manage`
- Reemplazar `['admin', 'manager'].includes(...)` → `canManage(...)`

- [ ] **Step 4.2: Refactor 5 API routes con canManage**

Para cada API route (`api/employees/demo`, `demo/convert`, `demo/transfer`, `invite`, `swaps/approve`):

1. Importar `canManage`:
```typescript
import { canManage } from "@/lib/auth/can-manage";
```

2. Reemplazar:
Antes:
```typescript
if (!callerProfile || !["admin", "manager"].includes(callerProfile.role)) {
  return NextResponse.json({ error: "No autorizado" }, { status: 403 });
}
```

Después:
```typescript
if (!canManage(callerProfile?.role)) {
  return NextResponse.json({ error: "No autorizado" }, { status: 403 });
}
```

- [ ] **Step 4.3: Build + tests pasan**

```bash
npm run build
npm run test
```

Expected: build OK + 314 tests pass (298 + 16 del helper).

- [ ] **Step 4.4: Commit**

```bash
git add src/components src/hooks src/app/api
git commit -m "refactor(auth): components/hooks/API routes usan canManage helper"
```

---

## Phase B: Migration 042 (schema + RPC)

### Task 5: Migration 042 scaffold

**Files:**
- Create: `supabase/migrations/042_org_onboarding.sql`

- [ ] **Step 5.1: Crear migración via /new-migration o cat heredoc**

Como el hook de migrations a veces bloquea Write tool, usar Bash heredoc:

```bash
cat > supabase/migrations/042_org_onboarding.sql <<'MIGRATION_EOF'
-- Migration 042: Org onboarding tracking + approve_demo_request RPC
--
-- ¿Qué hace?
--   - organizations: onboarding_completed_at, onboarding_step, welcome_email_sent_at,
--     approved_by, approved_from_demo_request_id
--   - demo_requests: approved_org_id, approved_at, approved_by + status='approved'
--   - RPC approve_demo_request(...) SECURITY DEFINER, atómica, super_admin guard
--
-- ¿Por qué?
--   Sub-proy 4 necesita rastrear progreso del wizard onboarding y auditar el
--   approval. La RPC garantiza atomicidad org-create + demo_request-update.

BEGIN;

ALTER TABLE organizations
  ADD COLUMN onboarding_completed_at TIMESTAMPTZ,
  ADD COLUMN onboarding_step TEXT
    CHECK (onboarding_step IS NULL OR onboarding_step IN
      ('empresa','sede','departments','positions','shifts','team','done')),
  ADD COLUMN welcome_email_sent_at TIMESTAMPTZ,
  ADD COLUMN approved_by UUID REFERENCES profiles(id),
  ADD COLUMN approved_from_demo_request_id UUID REFERENCES demo_requests(id);

-- Les Raptors ya está onboarded
UPDATE organizations
  SET onboarding_completed_at = created_at, onboarding_step = 'done'
  WHERE slug = 'les-raptors';

ALTER TABLE demo_requests
  ADD COLUMN approved_org_id UUID REFERENCES organizations(id),
  ADD COLUMN approved_at TIMESTAMPTZ,
  ADD COLUMN approved_by UUID REFERENCES profiles(id);

ALTER TABLE demo_requests DROP CONSTRAINT IF EXISTS demo_requests_status_check;
ALTER TABLE demo_requests ADD CONSTRAINT demo_requests_status_check
  CHECK (status IN ('new','contacted','scheduled','approved','rejected','spam'));

CREATE OR REPLACE FUNCTION approve_demo_request(
  p_demo_request_id UUID,
  p_org_name TEXT,
  p_org_slug TEXT,
  p_plan TEXT,
  p_admin_email TEXT,
  p_admin_first_name TEXT,
  p_admin_last_name TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_new_org_id UUID;
BEGIN
  IF NOT is_super_admin() THEN
    RAISE EXCEPTION 'Forbidden: only super_admin can approve demo requests'
      USING ERRCODE='insufficient_privilege';
  END IF;

  INSERT INTO organizations (name, slug, plan, status, trial_ends_at, country)
  VALUES (p_org_name, p_org_slug, p_plan, 'trialing', now() + INTERVAL '30 days', 'CO')
  RETURNING id INTO v_new_org_id;

  UPDATE demo_requests
    SET status='approved',
        approved_org_id=v_new_org_id,
        approved_at=now(),
        approved_by=auth.uid()
  WHERE id=p_demo_request_id;

  UPDATE organizations
    SET approved_by=auth.uid(),
        approved_from_demo_request_id=p_demo_request_id
  WHERE id=v_new_org_id;

  RETURN jsonb_build_object(
    'success', true,
    'organization_id', v_new_org_id,
    'trial_ends_at', (SELECT trial_ends_at FROM organizations WHERE id=v_new_org_id)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.approve_demo_request(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) TO authenticated;

COMMIT;
MIGRATION_EOF
wc -l supabase/migrations/042_org_onboarding.sql
```

Expected: `~80 lines`.

- [ ] **Step 5.2: Commit migration (sin aplicar)**

```bash
git add supabase/migrations/042_org_onboarding.sql
git commit -m "feat(db): migration 042 — org onboarding columns + approve_demo_request RPC (build, no apply yet)"
```

### Task 6: Aplicar migration 042 a Supabase Cloud

> **PRE-AUTORIZACIÓN:** el usuario aprueba aplicar migrations al cloud sin checkpoint manual cuando son aditivas + revisión inline (feedback `subproy3-apply-authorization`).

- [ ] **Step 6.1: Aplicar via MCP apply_migration**

Usar `mcp__plugin_supabase_supabase__apply_migration`:
- `project_id`: `ugkvuinkynvtuiutwlkd`
- `name`: `org_onboarding`
- `query`: contenido completo del archivo 042 (sin BEGIN/COMMIT explícito si MCP los envuelve — incluirlo igual por defensa).

Expected: success.

- [ ] **Step 6.2: Verificar columnas + RPC**

Usar `mcp__plugin_supabase_supabase__execute_sql`:

```sql
SELECT column_name, data_type FROM information_schema.columns
WHERE table_name='organizations' AND column_name LIKE 'onboarding%' OR column_name LIKE 'approved%' OR column_name LIKE 'welcome%';

SELECT proname FROM pg_proc WHERE proname='approve_demo_request';

SELECT id, slug, onboarding_completed_at, onboarding_step FROM organizations WHERE slug='les-raptors';
```

Expected: 5 columnas nuevas en organizations + RPC existe + Les Raptors `onboarding_step='done'`.

### Task 7: Regenerar database.types.ts

**Files:**
- Modify: `src/lib/supabase/database.types.ts`

- [ ] **Step 7.1: Generar types via MCP**

Usar `mcp__plugin_supabase_supabase__generate_typescript_types` para `ugkvuinkynvtuiutwlkd`.

Reemplazar contenido completo de `src/lib/supabase/database.types.ts`.

- [ ] **Step 7.2: Build verifica tipos**

```bash
npm run build
```

Expected: pass.

- [ ] **Step 7.3: Commit**

```bash
git add src/lib/supabase/database.types.ts
git commit -m "chore(types): regen database.types.ts post-migration 042"
```

### Task 8: SQL test del RPC

**Files:**
- Create: `supabase/tests/approve_demo_request_test.sql`

- [ ] **Step 8.1: Crear archivo de test**

```bash
cat > supabase/tests/approve_demo_request_test.sql <<'SQL_TEST_EOF'
-- Test: approve_demo_request RPC
-- Ejecutar via execute_sql. Pattern BEGIN/ROLLBACK para no ensuciar prod.

BEGIN;
SET LOCAL row_security = off;

-- Setup: crear demo_request fake
INSERT INTO demo_requests (id, nombre, email, empresa, sector, status)
VALUES (
  '88888888-1111-1111-1111-111111111111',
  'Test User',
  'test@example.com',
  'Test Empresa',
  'salud',
  'new'
);

-- Caller = super_admin
SET LOCAL role authenticated;
SET LOCAL "request.jwt.claim.sub" TO '7e75517e-b3bd-4092-abaf-f9106a184a07';

-- Test 1: super_admin puede aprobar
DO $$
DECLARE result JSONB;
BEGIN
  result := approve_demo_request(
    '88888888-1111-1111-1111-111111111111',
    'Test Empresa',
    'test-empresa-' || floor(random() * 100000)::TEXT,
    'trial',
    'test@example.com',
    'Test',
    'User'
  );
  ASSERT (result->>'success')::BOOLEAN = true, 'TEST 1 FAILED: success=false';
  ASSERT (result->>'organization_id') IS NOT NULL, 'TEST 1 FAILED: no org id';
  RAISE NOTICE 'TEST 1 PASSED: org % created', result->>'organization_id';
END $$;

-- Test 2: demo_request quedó marcado como approved
DO $$
DECLARE
  v_status TEXT;
  v_approved_org UUID;
BEGIN
  SELECT status, approved_org_id INTO v_status, v_approved_org
  FROM demo_requests WHERE id='88888888-1111-1111-1111-111111111111';
  ASSERT v_status = 'approved', format('TEST 2 FAILED: status=%s', v_status);
  ASSERT v_approved_org IS NOT NULL, 'TEST 2 FAILED: no approved_org_id';
  RAISE NOTICE 'TEST 2 PASSED: demo_request status=approved, linked to org';
END $$;

-- Test 3: organization tiene trial_ends_at = now() + 30 days
DO $$
DECLARE v_trial_ends TIMESTAMPTZ;
BEGIN
  SELECT trial_ends_at INTO v_trial_ends FROM organizations
  WHERE id=(SELECT approved_org_id FROM demo_requests WHERE id='88888888-1111-1111-1111-111111111111');
  ASSERT v_trial_ends > now() + INTERVAL '29 days',
    format('TEST 3 FAILED: trial_ends_at=%s', v_trial_ends);
  ASSERT v_trial_ends < now() + INTERVAL '31 days',
    format('TEST 3 FAILED: trial_ends_at=%s (too far)', v_trial_ends);
  RAISE NOTICE 'TEST 3 PASSED: trial_ends_at = %', v_trial_ends;
END $$;

-- Test 4: NO super_admin → exception
INSERT INTO profiles (id, email, first_name, last_name, role, organization_id, is_active)
VALUES ('44444444-4444-4444-4444-444444444444', 'admin-test@evi.co', 'Admin', 'Test', 'admin',
        '00000000-0000-0000-0000-000000000001', true);

SET LOCAL "request.jwt.claim.sub" TO '44444444-4444-4444-4444-444444444444';

DO $$
DECLARE
  insert_failed BOOLEAN := false;
BEGIN
  BEGIN
    PERFORM approve_demo_request(
      '88888888-1111-1111-1111-111111111111',
      'Hack Org', 'hack-org', 'trial', 'hack@test.com', 'Hack', 'Er'
    );
  EXCEPTION WHEN insufficient_privilege OR others THEN
    insert_failed := true;
  END;
  ASSERT insert_failed = true, 'TEST 4 FAILED: non-super_admin pudo aprobar';
  RAISE NOTICE 'TEST 4 PASSED: non-super_admin bloqueado';
END $$;

ROLLBACK;

SELECT 'All 4 approve_demo_request tests PASSED' AS result;
SQL_TEST_EOF
wc -l supabase/tests/approve_demo_request_test.sql
```

Expected: ~80 lines.

- [ ] **Step 8.2: Ejecutar test via execute_sql**

Usar `mcp__plugin_supabase_supabase__execute_sql` con el contenido del archivo.

Expected: `All 4 approve_demo_request tests PASSED`.

- [ ] **Step 8.3: Commit**

```bash
git add supabase/tests/approve_demo_request_test.sql
git commit -m "test(db): approve_demo_request RPC test (4 scenarios: success + audit + trial + super_admin guard)"
```

---

## Phase C: Slug validator + Resend welcome email

### Task 9: Slug validator helper TDD

**Files:**
- Create: `src/lib/onboarding/slug-validator.ts`
- Create: `src/lib/onboarding/slug-validator.test.ts`

- [ ] **Step 9.1: Test file TDD**

```typescript
// src/lib/onboarding/slug-validator.test.ts
import { describe, it, expect } from "vitest";
import { isValidSlug, sanitizeSlug } from "./slug-validator";

describe("isValidSlug", () => {
  it("acepta lowercase + numbers + hyphen", () => expect(isValidSlug("test-empresa-1")).toBe(true));
  it("acepta solo lowercase", () => expect(isValidSlug("acme")).toBe(true));
  it("rechaza uppercase", () => expect(isValidSlug("Acme")).toBe(false));
  it("rechaza espacios", () => expect(isValidSlug("acme corp")).toBe(false));
  it("rechaza < 3 chars", () => expect(isValidSlug("ab")).toBe(false));
  it("rechaza > 50 chars", () => expect(isValidSlug("a".repeat(51))).toBe(false));
  it("rechaza chars especiales", () => expect(isValidSlug("acme!")).toBe(false));
  it("rechaza tildes", () => expect(isValidSlug("clínica")).toBe(false));
});

describe("sanitizeSlug", () => {
  it("convierte uppercase a lowercase", () => expect(sanitizeSlug("Acme Corp")).toBe("acme-corp"));
  it("remueve tildes", () => expect(sanitizeSlug("Clínica Salud")).toBe("clinica-salud"));
  it("colapsa espacios consecutivos", () => expect(sanitizeSlug("Mi   Empresa")).toBe("mi-empresa"));
  it("remueve chars especiales", () => expect(sanitizeSlug("Acme!@#")).toBe("acme"));
  it("trim hyphens al inicio/fin", () => expect(sanitizeSlug("--acme--")).toBe("acme"));
});
```

- [ ] **Step 9.2: Run → FAIL**

```bash
npm run test -- --run src/lib/onboarding/slug-validator.test.ts
```

Expected: FAIL.

- [ ] **Step 9.3: Implementar**

```typescript
// src/lib/onboarding/slug-validator.ts
const SLUG_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function isValidSlug(slug: string): boolean {
  if (slug.length < 3 || slug.length > 50) return false;
  return SLUG_REGEX.test(slug);
}

export function sanitizeSlug(input: string): string {
  return input
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // remueve diacríticos
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "") // solo a-z, 0-9, espacios, guiones
    .trim()
    .replace(/\s+/g, "-") // colapsa espacios a guion
    .replace(/-+/g, "-") // colapsa múltiples guiones
    .replace(/^-+|-+$/g, ""); // trim guiones laterales
}
```

- [ ] **Step 9.4: Tests pass**

```bash
npm run test -- --run src/lib/onboarding/slug-validator.test.ts
```

Expected: `Tests  13 passed`.

- [ ] **Step 9.5: Commit**

```bash
git add src/lib/onboarding/slug-validator.ts src/lib/onboarding/slug-validator.test.ts
git commit -m "feat(onboarding): slug validator + sanitizer helpers TDD"
```

### Task 10: Wizard state helper TDD

**Files:**
- Create: `src/lib/onboarding/wizard-state.ts`
- Create: `src/lib/onboarding/wizard-state.test.ts`

- [ ] **Step 10.1: Test file TDD**

```typescript
// src/lib/onboarding/wizard-state.test.ts
import { describe, it, expect } from "vitest";
import { WIZARD_STEPS, nextStep, prevStep, isValidStep } from "./wizard-state";

describe("WIZARD_STEPS", () => {
  it("tiene 6 steps + done", () => expect(WIZARD_STEPS.length).toBe(7));
  it("primer step es empresa", () => expect(WIZARD_STEPS[0]).toBe("empresa"));
  it("último step antes de done es team", () => expect(WIZARD_STEPS[5]).toBe("team"));
});

describe("nextStep", () => {
  it("empresa → sede", () => expect(nextStep("empresa")).toBe("sede"));
  it("sede → departments", () => expect(nextStep("sede")).toBe("departments"));
  it("team → done", () => expect(nextStep("team")).toBe("done"));
  it("done → done (idempotente)", () => expect(nextStep("done")).toBe("done"));
});

describe("prevStep", () => {
  it("sede → empresa", () => expect(prevStep("sede")).toBe("empresa"));
  it("empresa → empresa (no va atrás del primero)", () => expect(prevStep("empresa")).toBe("empresa"));
});

describe("isValidStep", () => {
  it("acepta empresa", () => expect(isValidStep("empresa")).toBe(true));
  it("acepta done", () => expect(isValidStep("done")).toBe(true));
  it("rechaza invalid", () => expect(isValidStep("foo")).toBe(false));
});
```

- [ ] **Step 10.2: Run → FAIL**

```bash
npm run test -- --run src/lib/onboarding/wizard-state.test.ts
```

- [ ] **Step 10.3: Implementar**

```typescript
// src/lib/onboarding/wizard-state.ts
export const WIZARD_STEPS = [
  "empresa",
  "sede",
  "departments",
  "positions",
  "shifts",
  "team",
  "done",
] as const;

export type WizardStep = (typeof WIZARD_STEPS)[number];

export function isValidStep(step: string): step is WizardStep {
  return (WIZARD_STEPS as readonly string[]).includes(step);
}

export function nextStep(current: WizardStep): WizardStep {
  const idx = WIZARD_STEPS.indexOf(current);
  if (idx === -1 || idx === WIZARD_STEPS.length - 1) return "done";
  return WIZARD_STEPS[idx + 1];
}

export function prevStep(current: WizardStep): WizardStep {
  const idx = WIZARD_STEPS.indexOf(current);
  if (idx <= 0) return "empresa";
  return WIZARD_STEPS[idx - 1];
}
```

- [ ] **Step 10.4: Tests pass + commit**

```bash
npm run test -- --run src/lib/onboarding/wizard-state.test.ts
git add src/lib/onboarding/wizard-state.ts src/lib/onboarding/wizard-state.test.ts
git commit -m "feat(onboarding): wizard-state helper (steps + next/prev + validation)"
```

### Task 11: Resend welcome email template + helper

**Files:**
- Create: `src/emails/welcome-org-admin.tsx`
- Create: `src/lib/emails/send-welcome.ts`

- [ ] **Step 11.1: Crear template React Email**

```tsx
// src/emails/welcome-org-admin.tsx
import {
  Body, Button, Container, Head, Heading, Html, Img,
  Preview, Section, Text
} from "@react-email/components";

interface Props {
  firstName: string;
  orgName: string;
  trialEndsAt: string;
  setPasswordUrl: string;
}

const LOGO = "https://www.tushorarios.com/icono-transparente.png";

export default function WelcomeOrgAdminEmail({
  firstName, orgName, trialEndsAt, setPasswordUrl,
}: Props) {
  const trialDate = new Date(trialEndsAt).toLocaleDateString("es-CO", {
    day: "numeric", month: "long", year: "numeric",
  });
  return (
    <Html lang="es-CO">
      <Head />
      <Preview>Bienvenido a Tus Horarios — empezá tu trial de 30 días</Preview>
      <Body style={body}>
        <Container style={container}>
          <Section style={header}>
            <Img src={LOGO} alt="Tus Horarios" width="40" height="40" />
            <Text style={brand}>Tus Horarios</Text>
          </Section>
          <Section style={content}>
            <Heading style={h1}>¡Bienvenido, {firstName}!</Heading>
            <Text style={p}>
              Acabamos de crear la cuenta de <strong>{orgName}</strong>. Tenés{" "}
              <strong>30 días gratis</strong> para configurar tu sistema de turnos.
            </Text>
            <Text style={p}>
              <strong>Tu trial termina:</strong> {trialDate}
            </Text>
            <Heading style={h2}>¿Qué hago ahora?</Heading>
            <Text style={p}>
              <strong>1.</strong> Haz clic en el botón abajo para establecer tu contraseña.<br />
              <strong>2.</strong> Te guiaremos por un wizard de 6 pasos para configurar tu equipo.<br />
              <strong>3.</strong> En 10 minutos tendrás tu primer cuadro de turnos.
            </Text>
            <Button style={button} href={setPasswordUrl}>Establecer mi contraseña</Button>
            <Text style={small}>
              ¿Dudas? Respondé este correo o escribinos a hola@tushorarios.com. Estamos para ayudarte.
            </Text>
          </Section>
          <Section style={footer}>
            <Text style={footerText}>Tus Horarios — Programación de turnos para empresas en Colombia.</Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

const body = { backgroundColor: "#F1F5F9", fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" };
const container = { maxWidth: "600px", margin: "40px auto", backgroundColor: "#FFFFFF", borderRadius: "12px", border: "1px solid #E2E8F0", overflow: "hidden" as const };
const header = { padding: "32px 40px 24px", borderBottom: "1px solid #E2E8F0" };
const brand = { fontSize: "20px", fontWeight: 700, color: "#020817", display: "inline-block", marginLeft: "10px", verticalAlign: "middle" as const };
const content = { padding: "32px 40px" };
const h1 = { fontSize: "24px", fontWeight: 700, color: "#020817", margin: "0 0 16px" };
const h2 = { fontSize: "18px", fontWeight: 700, color: "#020817", margin: "24px 0 12px" };
const p = { fontSize: "16px", lineHeight: "1.6", color: "#020817", margin: "0 0 16px" };
const small = { fontSize: "14px", lineHeight: "1.5", color: "#475569", margin: "24px 0 0" };
const button = { backgroundColor: "#2563EB", color: "#FFFFFF", textDecoration: "none", fontSize: "16px", fontWeight: 600, padding: "14px 32px", borderRadius: "8px", display: "inline-block", marginTop: "8px" };
const footer = { padding: "24px 40px", backgroundColor: "#F8FAFC", borderTop: "1px solid #E2E8F0" };
const footerText = { fontSize: "13px", color: "#64748B", margin: 0, textAlign: "center" as const };
```

- [ ] **Step 11.2: Crear helper**

```typescript
// src/lib/emails/send-welcome.ts
import { resend, FROM_NOREPLY } from "@/lib/resend";
import WelcomeOrgAdminEmail from "@/emails/welcome-org-admin";

interface Params {
  to: string;
  firstName: string;
  orgName: string;
  trialEndsAt: string;
  setPasswordUrl: string;
}

export async function sendWelcomeEmail(params: Params) {
  return resend.emails.send({
    from: FROM_NOREPLY,
    to: params.to,
    subject: `Bienvenido a Tus Horarios, ${params.firstName}`,
    react: WelcomeOrgAdminEmail({
      firstName: params.firstName,
      orgName: params.orgName,
      trialEndsAt: params.trialEndsAt,
      setPasswordUrl: params.setPasswordUrl,
    }),
  });
}
```

- [ ] **Step 11.3: Build pasa**

```bash
npm run build
```

- [ ] **Step 11.4: Commit**

```bash
git add src/emails/welcome-org-admin.tsx src/lib/emails/send-welcome.ts
git commit -m "feat(emails): welcome-org-admin Resend template + sendWelcomeEmail helper"
```

---

## Phase D: API routes (approve + check-slug)

### Task 12: Endpoint check-slug

**Files:**
- Create: `src/app/api/admin/demo-requests/check-slug/route.ts`

- [ ] **Step 12.1: Crear endpoint**

```typescript
// src/app/api/admin/demo-requests/check-slug/route.ts
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isSuperAdmin } from "@/lib/auth/can-manage";
import { isValidSlug } from "@/lib/onboarding/slug-validator";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (!isSuperAdmin(profile?.role)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const slug = searchParams.get("slug")?.trim() ?? "";

  if (!isValidSlug(slug)) {
    return NextResponse.json({ available: false, reason: "invalid_format" });
  }

  // Check si existe
  const adminSupabase = createAdminClient();
  const { data: existing } = await adminSupabase
    .from("organizations")
    .select("id")
    .eq("slug", slug)
    .maybeSingle();

  if (existing) {
    // Sugerir alternativa
    const { data: suggestion } = await adminSupabase.rpc("suggest_unique_slug", {
      p_name: slug,
    });
    return NextResponse.json({ available: false, reason: "taken", suggestion });
  }

  return NextResponse.json({ available: true });
}
```

- [ ] **Step 12.2: Build pasa**

```bash
npm run build
```

- [ ] **Step 12.3: Commit**

```bash
git add src/app/api/admin/demo-requests/check-slug/route.ts
git commit -m "feat(api): GET /api/admin/demo-requests/check-slug — validates slug availability"
```

### Task 13: Endpoint approve

**Files:**
- Create: `src/app/api/admin/demo-requests/approve/route.ts`

- [ ] **Step 13.1: Crear endpoint completo**

```typescript
// src/app/api/admin/demo-requests/approve/route.ts
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { isSuperAdmin } from "@/lib/auth/can-manage";
import { sendWelcomeEmail } from "@/lib/emails/send-welcome";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const ApproveSchema = z.object({
  demo_request_id: z.string().uuid(),
  org_name: z.string().min(2).max(100),
  org_slug: z.string().regex(/^[a-z0-9-]+$/).min(3).max(50),
  plan: z.enum(["trial", "starter", "pro", "enterprise"]),
  admin_email: z.string().email(),
  admin_first_name: z.string().min(1).max(50),
  admin_last_name: z.string().min(1).max(50),
  send_welcome_email: z.boolean().default(true),
});

export async function POST(request: NextRequest) {
  try {
    // 1. Verify caller = super_admin
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

    const { data: callerProfile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    if (!isSuperAdmin(callerProfile?.role)) {
      return NextResponse.json({ error: "Solo super_admin puede aprobar" }, { status: 403 });
    }

    // 2. Validate body
    const body = await request.json();
    const parse = ApproveSchema.safeParse(body);
    if (!parse.success) {
      return NextResponse.json({ error: parse.error.issues[0]?.message ?? "Body inválido" }, { status: 400 });
    }
    const {
      demo_request_id, org_name, org_slug, plan,
      admin_email, admin_first_name, admin_last_name, send_welcome_email,
    } = parse.data;

    const adminSupabase = createAdminClient();

    // 3. RPC atómica: crea org + actualiza demo_request
    const { data: rpcResult, error: rpcError } = await adminSupabase.rpc(
      "approve_demo_request",
      {
        p_demo_request_id: demo_request_id,
        p_org_name: org_name,
        p_org_slug: org_slug,
        p_plan: plan,
        p_admin_email: admin_email,
        p_admin_first_name: admin_first_name,
        p_admin_last_name: admin_last_name,
      }
    );

    if (rpcError) {
      console.error("[approve] RPC error:", rpcError);
      if (rpcError.code === "23505") {
        return NextResponse.json({ error: "El slug ya está en uso" }, { status: 409 });
      }
      return NextResponse.json({ error: "Error creando organización" }, { status: 500 });
    }

    const result = rpcResult as { success: boolean; organization_id: string; trial_ends_at: string };
    const { organization_id, trial_ends_at } = result;

    // 4. Invite Supabase Auth
    const appUrl =
      process.env.NEXT_PUBLIC_SITE_URL ??
      process.env.NEXT_PUBLIC_APP_URL ??
      "https://www.tushorarios.com";

    const { data: newUser, error: inviteError } =
      await adminSupabase.auth.admin.inviteUserByEmail(admin_email, {
        data: {
          first_name: admin_first_name,
          last_name: admin_last_name,
          role: "admin",
          organization_id,
        },
        redirectTo: `${appUrl}/auth/set-password`,
      });

    if (inviteError) {
      // Rollback: pausar org para revisión manual
      await adminSupabase
        .from("organizations")
        .update({ status: "paused" })
        .eq("id", organization_id);
      return NextResponse.json(
        {
          error: `Org creada pero falló invite: ${inviteError.message}. Org marcada como paused.`,
          organization_id,
        },
        { status: 500 }
      );
    }

    // 5. Welcome email (opcional)
    if (send_welcome_email) {
      try {
        await sendWelcomeEmail({
          to: admin_email,
          firstName: admin_first_name,
          orgName: org_name,
          trialEndsAt: trial_ends_at,
          setPasswordUrl: `${appUrl}/auth/set-password`,
        });
        await adminSupabase
          .from("organizations")
          .update({ welcome_email_sent_at: new Date().toISOString() })
          .eq("id", organization_id);
      } catch (err) {
        console.error("[approve] welcome email failed:", err);
        // NO fatal — auth invite ya se envió
      }
    }

    return NextResponse.json({
      success: true,
      organization_id,
      user_id: newUser?.user?.id,
      trial_ends_at,
    });
  } catch (err) {
    console.error("[approve] unexpected:", err);
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}
```

- [ ] **Step 13.2: Build pasa**

```bash
npm run build
```

- [ ] **Step 13.3: Commit**

```bash
git add src/app/api/admin/demo-requests/approve/route.ts
git commit -m "feat(api): POST /api/admin/demo-requests/approve — RPC + Auth invite + Resend welcome"
```

---

## Phase E: Pantalla `/admin/demo-requests`

### Task 14: Page listado

**Files:**
- Create: `src/app/(authenticated)/admin/demo-requests/page.tsx`

- [ ] **Step 14.1: Invocar modern-web-guidance**

```bash
npx -y modern-web-guidance@latest search "data table accessibility filter"
```

Aplicar recomendaciones de accessibility (a11y labels, focus management, keyboard nav) en la implementación.

- [ ] **Step 14.2: Crear page con guard super_admin + DataTable**

```typescript
// src/app/(authenticated)/admin/demo-requests/page.tsx
"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { isSuperAdmin } from "@/lib/auth/can-manage";
import { DataTable } from "@/components/shared/data-table";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { ApproveDialog } from "./approve-dialog";
import { toast } from "sonner";
import type { Database } from "@/lib/supabase/database.types";

type DemoRequest = Database["public"]["Tables"]["demo_requests"]["Row"];

export default function DemoRequestsPage() {
  const { profile, loading: authLoading } = useAuth();
  const [requests, setRequests] = useState<DemoRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>("pending");
  const [selectedLead, setSelectedLead] = useState<DemoRequest | null>(null);
  const supabase = createClient();

  useEffect(() => {
    if (authLoading) return;
    if (!isSuperAdmin(profile?.role)) return;
    void loadRequests();
  }, [authLoading, profile?.role, statusFilter]);

  async function loadRequests() {
    setLoading(true);
    let query = supabase
      .from("demo_requests")
      .select("*")
      .order("created_at", { ascending: false });

    if (statusFilter === "pending") {
      query = query.in("status", ["new", "contacted", "scheduled"]);
    } else if (statusFilter !== "all") {
      query = query.eq("status", statusFilter);
    }

    const { data, error } = await query;
    if (error) toast.error("Error cargando solicitudes");
    setRequests((data ?? []) as DemoRequest[]);
    setLoading(false);
  }

  if (authLoading) return <div>Cargando…</div>;
  if (!isSuperAdmin(profile?.role)) {
    return <div className="p-6">No tienes permisos para ver esta página.</div>;
  }

  async function markStatus(id: string, status: string) {
    const { error } = await supabase
      .from("demo_requests")
      .update({ status })
      .eq("id", id);
    if (error) {
      toast.error("Error actualizando");
    } else {
      toast.success("Estado actualizado");
      void loadRequests();
    }
  }

  return (
    <div className="p-6">
      <PageHeader
        title="Solicitudes de demo"
        description="Gestiona y aprueba leads del landing"
      />

      <div className="my-4 flex gap-2">
        {["pending", "all", "approved", "rejected"].map((s) => (
          <Button
            key={s}
            variant={statusFilter === s ? "default" : "outline"}
            size="sm"
            onClick={() => setStatusFilter(s)}
          >
            {s === "pending" ? "Pendientes" : s === "all" ? "Todos" : s === "approved" ? "Aprobados" : "Rechazados"}
          </Button>
        ))}
      </div>

      <DataTable
        data={requests}
        loading={loading}
        keyAccessor={(r) => r.id}
        emptyMessage="No hay solicitudes."
        columns={[
          { header: "Fecha", cell: (r) => new Date(r.created_at).toLocaleDateString("es-CO") },
          { header: "Empresa", cell: (r) => r.empresa },
          { header: "Email", cell: (r) => r.email },
          { header: "Sector", cell: (r) => r.sector },
          { header: "Estado", cell: (r) => <span className="capitalize">{r.status}</span> },
          {
            header: "Acciones",
            cell: (r) =>
              ["new", "contacted", "scheduled"].includes(r.status ?? "") ? (
                <div className="flex gap-2">
                  <Button size="sm" onClick={() => setSelectedLead(r)}>Aprobar</Button>
                  {r.status !== "contacted" && (
                    <Button size="sm" variant="outline" onClick={() => markStatus(r.id, "contacted")}>
                      Contactado
                    </Button>
                  )}
                  <Button size="sm" variant="outline" onClick={() => markStatus(r.id, "rejected")}>
                    Rechazar
                  </Button>
                </div>
              ) : r.status === "approved" && r.approved_org_id ? (
                <span className="text-sm text-slate-500">→ Org creada</span>
              ) : (
                <span className="text-sm text-slate-400">—</span>
              ),
          },
        ]}
      />

      {selectedLead && (
        <ApproveDialog
          lead={selectedLead}
          onClose={() => setSelectedLead(null)}
          onApproved={() => {
            setSelectedLead(null);
            void loadRequests();
          }}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 14.3: Commit (sin ApproveDialog aún, tests no compilarán)**

Saltamos commit hasta tener el dialog. Pasamos al Task 15.

### Task 15: Modal `ApproveDialog`

**Files:**
- Create: `src/app/(authenticated)/admin/demo-requests/approve-dialog.tsx`

- [ ] **Step 15.1: Crear dialog**

```typescript
// src/app/(authenticated)/admin/demo-requests/approve-dialog.tsx
"use client";

import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { sanitizeSlug, isValidSlug } from "@/lib/onboarding/slug-validator";
import { toast } from "sonner";
import { Loader2, Check, AlertCircle } from "lucide-react";
import type { Database } from "@/lib/supabase/database.types";

type DemoRequest = Database["public"]["Tables"]["demo_requests"]["Row"];

interface Props {
  lead: DemoRequest;
  onClose: () => void;
  onApproved: () => void;
}

export function ApproveDialog({ lead, onClose, onApproved }: Props) {
  const [orgName, setOrgName] = useState(lead.empresa);
  const [slug, setSlug] = useState(sanitizeSlug(lead.empresa));
  const [plan, setPlan] = useState<"trial" | "starter" | "pro" | "enterprise">("trial");
  const [firstName, setFirstName] = useState(lead.nombre?.split(" ")[0] ?? "");
  const [lastName, setLastName] = useState(lead.nombre?.split(" ").slice(1).join(" ") ?? "");
  const [email, setEmail] = useState(lead.email);
  const [sendWelcome, setSendWelcome] = useState(true);
  const [slugStatus, setSlugStatus] = useState<"checking" | "available" | "taken" | "invalid">("checking");
  const [submitting, setSubmitting] = useState(false);

  // Check slug availability con debounce
  useEffect(() => {
    if (!isValidSlug(slug)) {
      setSlugStatus("invalid");
      return;
    }
    setSlugStatus("checking");
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/admin/demo-requests/check-slug?slug=${encodeURIComponent(slug)}`);
        const data = await res.json();
        if (data.available) setSlugStatus("available");
        else setSlugStatus("taken");
      } catch {
        setSlugStatus("invalid");
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [slug]);

  async function handleApprove() {
    if (slugStatus !== "available") {
      toast.error("El slug no está disponible");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/admin/demo-requests/approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          demo_request_id: lead.id,
          org_name: orgName,
          org_slug: slug,
          plan,
          admin_email: email,
          admin_first_name: firstName,
          admin_last_name: lastName,
          send_welcome_email: sendWelcome,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "Error aprobando");
        return;
      }
      toast.success(`Org creada: ${slug}`);
      onApproved();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Aprobar demo: {lead.empresa}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label htmlFor="org-name">Nombre empresa *</Label>
            <Input id="org-name" value={orgName} onChange={(e) => setOrgName(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="org-slug">Slug (URL única) *</Label>
            <div className="relative">
              <Input id="org-slug" value={slug} onChange={(e) => setSlug(sanitizeSlug(e.target.value))} />
              <div className="absolute right-2 top-2.5">
                {slugStatus === "checking" && <Loader2 className="h-4 w-4 animate-spin text-slate-400" />}
                {slugStatus === "available" && <Check className="h-4 w-4 text-green-600" />}
                {(slugStatus === "taken" || slugStatus === "invalid") && <AlertCircle className="h-4 w-4 text-red-600" />}
              </div>
            </div>
            {slugStatus === "taken" && <p className="text-sm text-red-600 mt-1">Slug en uso</p>}
            {slugStatus === "invalid" && <p className="text-sm text-red-600 mt-1">Formato inválido (lowercase + guiones)</p>}
            <p className="text-xs text-slate-500 mt-1">Se usará como subdomain en sub-proy 5</p>
          </div>
          <div>
            <Label>País</Label>
            <Input value="Colombia (CO)" disabled />
          </div>
          <div>
            <Label htmlFor="plan">Plan inicial</Label>
            <Select value={plan} onValueChange={(v) => setPlan(v as typeof plan)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="trial">Trial 30 días</SelectItem>
                <SelectItem value="starter">Starter</SelectItem>
                <SelectItem value="pro">Pro</SelectItem>
                <SelectItem value="enterprise">Enterprise</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="border-t pt-4">
            <Label className="block mb-2">Primer admin</Label>
            <div className="grid grid-cols-2 gap-2">
              <Input placeholder="Nombre" value={firstName} onChange={(e) => setFirstName(e.target.value)} />
              <Input placeholder="Apellido" value={lastName} onChange={(e) => setLastName(e.target.value)} />
            </div>
            <Input className="mt-2" type="email" placeholder="email@empresa.com" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="flex items-center gap-2">
            <Checkbox id="welcome" checked={sendWelcome} onCheckedChange={(c) => setSendWelcome(c === true)} />
            <Label htmlFor="welcome" className="text-sm">Enviar email de bienvenida (Resend)</Label>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={onClose} disabled={submitting}>Cancelar</Button>
            <Button onClick={handleApprove} disabled={submitting || slugStatus !== "available"}>
              {submitting && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Aprobar y crear
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 15.2: Build pasa**

```bash
npm run build
```

- [ ] **Step 15.3: Commit**

```bash
git add src/app/\(authenticated\)/admin
git commit -m "feat(admin): /admin/demo-requests page + ApproveDialog modal"
```

### Task 16: Sidebar entry para super_admin

**Files:**
- Modify: `src/components/layout/sidebar.tsx`

- [ ] **Step 16.1: Agregar nuevo nav item al sidebar**

En `src/components/layout/sidebar.tsx`, agregar al array correspondiente (probablemente `mainNav` o crear nuevo sección "Admin"):

```typescript
// Agregar después de los items de "Configuración" o crear nueva sección:
const adminNav = [
  { name: "Solicitudes demo", href: "/admin/demo-requests", icon: Inbox, roles: ["super_admin"] },
];
```

Y en el JSX render, agregar:

```tsx
{isSuperAdmin(profile?.role) && (
  <section>
    <h3 className="...">Admin SaaS</h3>
    {adminNav.map(item => /* ... */)}
  </section>
)}
```

(Adaptar al pattern existente del componente.)

- [ ] **Step 16.2: Build + commit**

```bash
npm run build
git add src/components/layout/sidebar.tsx
git commit -m "feat(sidebar): sección Admin SaaS para super_admin (nav demo-requests)"
```

---

## Phase F: Wizard onboarding

### Task 17: Middleware redirect a /onboarding

**Files:**
- Modify: `src/middleware.ts`

- [ ] **Step 17.1: Agregar lógica de redirect**

Leer `src/middleware.ts` actual y agregar (después del check de session, antes del check de routes públicas):

```typescript
// Onboarding redirect: si el user tiene org sin onboarding_completed_at,
// forzar a /onboarding/<step>
if (session?.user && !pathname.startsWith("/onboarding") && !pathname.startsWith("/auth")) {
  const { data: profile } = await supabase
    .from("profiles")
    .select("role, organization_id")
    .eq("id", session.user.id)
    .single();

  // super_admin no es forzado al wizard
  if (profile && profile.role !== "super_admin" && profile.organization_id) {
    const { data: org } = await supabase
      .from("organizations")
      .select("onboarding_completed_at, onboarding_step")
      .eq("id", profile.organization_id)
      .single();

    if (org && !org.onboarding_completed_at) {
      const step = org.onboarding_step || "empresa";
      const url = request.nextUrl.clone();
      url.pathname = `/onboarding/${step}`;
      return NextResponse.redirect(url);
    }
  }
}
```

- [ ] **Step 17.2: Build + commit**

```bash
npm run build
git add src/middleware.ts
git commit -m "feat(middleware): redirigir a /onboarding/[step] si org sin onboarding_completed_at"
```

### Task 18: Layout `/onboarding` con stepper

**Files:**
- Create: `src/app/onboarding/layout.tsx`
- Create: `src/components/onboarding/stepper.tsx`

- [ ] **Step 18.1: Invocar modern-web-guidance**

```bash
npx -y modern-web-guidance@latest search "stepper progress accessibility"
```

Aplicar aria-current="step" + role="progressbar".

- [ ] **Step 18.2: Crear stepper**

```typescript
// src/components/onboarding/stepper.tsx
"use client";

import { WIZARD_STEPS } from "@/lib/onboarding/wizard-state";
import { Check } from "lucide-react";

const STEP_LABELS: Record<string, string> = {
  empresa: "Empresa",
  sede: "Sede",
  departments: "Departamentos",
  positions: "Posiciones",
  shifts: "Turnos",
  team: "Equipo",
};

interface Props {
  currentStep: string;
}

export function Stepper({ currentStep }: Props) {
  const visibleSteps = WIZARD_STEPS.filter((s) => s !== "done");
  const currentIdx = visibleSteps.indexOf(currentStep as (typeof visibleSteps)[number]);

  return (
    <nav aria-label="Progreso del wizard" className="flex items-center justify-center gap-2 py-6">
      {visibleSteps.map((step, idx) => {
        const status = idx < currentIdx ? "complete" : idx === currentIdx ? "current" : "upcoming";
        return (
          <div key={step} className="flex items-center gap-2">
            <div
              aria-current={status === "current" ? "step" : undefined}
              className={`h-8 w-8 rounded-full flex items-center justify-center text-xs font-semibold ${
                status === "complete"
                  ? "bg-blue-600 text-white"
                  : status === "current"
                  ? "bg-blue-600 text-white ring-4 ring-blue-100"
                  : "bg-slate-200 text-slate-500"
              }`}
            >
              {status === "complete" ? <Check className="h-4 w-4" /> : idx + 1}
            </div>
            <span className={`hidden sm:inline text-sm ${status === "current" ? "font-semibold text-slate-950" : "text-slate-500"}`}>
              {STEP_LABELS[step]}
            </span>
            {idx < visibleSteps.length - 1 && <div className="w-8 h-0.5 bg-slate-200" />}
          </div>
        );
      })}
    </nav>
  );
}
```

- [ ] **Step 18.3: Crear layout**

```typescript
// src/app/onboarding/layout.tsx
import Link from "next/link";
import Image from "next/image";
import { APP_NAME } from "@/lib/constants";

export default function OnboardingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="max-w-3xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link href="/" className="inline-flex items-center gap-2.5 text-slate-950">
            <Image src="/icono-transparente.png" alt={APP_NAME} width={28} height={28} priority />
            <span className="font-bold tracking-tight">{APP_NAME}</span>
          </Link>
          <span className="text-sm text-slate-500">Configuración inicial</span>
        </div>
      </header>
      <main className="max-w-3xl mx-auto px-6">{children}</main>
    </div>
  );
}
```

- [ ] **Step 18.4: Build + commit**

```bash
npm run build
git add src/app/onboarding/layout.tsx src/components/onboarding/stepper.tsx
git commit -m "feat(onboarding): layout + Stepper component"
```

### Task 19: Step 1 — `/onboarding/empresa`

**Files:**
- Create: `src/app/onboarding/empresa/page.tsx`

- [ ] **Step 19.1: Crear form de datos empresa**

```typescript
// src/app/onboarding/empresa/page.tsx
"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Stepper } from "@/components/onboarding/stepper";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

const INDUSTRIES = [
  { value: "salud", label: "Salud" },
  { value: "retail", label: "Retail" },
  { value: "hoteleria", label: "Hotelería" },
  { value: "vigilancia", label: "Vigilancia" },
  { value: "otro", label: "Otro" },
];

export default function EmpresaStepPage() {
  const router = useRouter();
  const { profile } = useAuth();
  const supabase = createClient();
  const [legalName, setLegalName] = useState("");
  const [nit, setNit] = useState("");
  const [industry, setIndustry] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!profile?.organization_id) return;
    (async () => {
      const { data } = await supabase
        .from("organizations")
        .select("legal_name, nit, industry")
        .eq("id", profile.organization_id)
        .single();
      if (data) {
        setLegalName(data.legal_name ?? "");
        setNit(data.nit ?? "");
        setIndustry(data.industry ?? "");
      }
      setLoading(false);
    })();
  }, [profile?.organization_id, supabase]);

  async function handleContinue() {
    if (!profile?.organization_id) return;
    setSubmitting(true);
    const { error } = await supabase
      .from("organizations")
      .update({
        legal_name: legalName || null,
        nit: nit || null,
        industry: industry || null,
        onboarding_step: "sede",
      })
      .eq("id", profile.organization_id);
    setSubmitting(false);
    if (error) {
      toast.error("Error guardando datos");
      return;
    }
    router.push("/onboarding/sede");
  }

  if (loading) return <Loader2 className="h-6 w-6 animate-spin mx-auto mt-8" />;

  return (
    <>
      <Stepper currentStep="empresa" />
      <div className="bg-white rounded-xl border border-slate-200 p-8 mb-12">
        <h1 className="text-2xl font-bold mb-2">Datos de tu empresa</h1>
        <p className="text-slate-600 mb-6">
          Esta información es opcional ahora, podés completarla después en Ajustes.
        </p>
        <div className="space-y-4">
          <div>
            <Label htmlFor="legal-name">Razón social</Label>
            <Input
              id="legal-name"
              value={legalName}
              onChange={(e) => setLegalName(e.target.value)}
              placeholder="Mi Empresa S.A.S."
            />
          </div>
          <div>
            <Label htmlFor="nit">NIT</Label>
            <Input id="nit" value={nit} onChange={(e) => setNit(e.target.value)} placeholder="900123456-7" />
          </div>
          <div>
            <Label htmlFor="industry">Sector</Label>
            <Select value={industry} onValueChange={setIndustry}>
              <SelectTrigger id="industry">
                <SelectValue placeholder="Selecciona…" />
              </SelectTrigger>
              <SelectContent>
                {INDUSTRIES.map((i) => (
                  <SelectItem key={i.value} value={i.value}>{i.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-6 mt-6 border-t">
          <Button onClick={handleContinue} disabled={submitting}>
            {submitting && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            Continuar →
          </Button>
        </div>
      </div>
    </>
  );
}
```

- [ ] **Step 19.2: Build + commit**

```bash
npm run build
git add src/app/onboarding/empresa
git commit -m "feat(onboarding): step 1 /onboarding/empresa — datos empresa (opcional)"
```

### Task 20: Step 2 — `/onboarding/sede`

**Files:**
- Create: `src/app/onboarding/sede/page.tsx`

- [ ] **Step 20.1: Crear form crear primera sede**

```typescript
// src/app/onboarding/sede/page.tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Stepper } from "@/components/onboarding/stepper";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

export default function SedeStepPage() {
  const router = useRouter();
  const { profile } = useAuth();
  const supabase = createClient();
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleContinue() {
    if (!profile?.organization_id || !name.trim()) return;
    setSubmitting(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase.from("locations") as any).insert({
      name: name.trim(),
      address: address.trim() || null,
      organization_id: profile.organization_id,
    });
    if (error) {
      toast.error("Error creando sede");
      setSubmitting(false);
      return;
    }
    await supabase
      .from("organizations")
      .update({ onboarding_step: "departments" })
      .eq("id", profile.organization_id);
    setSubmitting(false);
    router.push("/onboarding/departments");
  }

  return (
    <>
      <Stepper currentStep="sede" />
      <div className="bg-white rounded-xl border border-slate-200 p-8 mb-12">
        <h1 className="text-2xl font-bold mb-2">Tu primera sede</h1>
        <p className="text-slate-600 mb-6">
          Una sede es un lugar físico donde trabajan tus empleados. Podés agregar más después.
        </p>
        <div className="space-y-4">
          <div>
            <Label htmlFor="name">Nombre de la sede *</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ej: Sede Principal, Sucursal Norte"
              required
            />
          </div>
          <div>
            <Label htmlFor="address">Dirección (opcional)</Label>
            <Input
              id="address"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="Calle 123 # 45-67, Bogotá"
            />
          </div>
        </div>
        <div className="flex justify-between gap-2 pt-6 mt-6 border-t">
          <Button variant="outline" onClick={() => router.push("/onboarding/empresa")}>
            ← Atrás
          </Button>
          <Button onClick={handleContinue} disabled={submitting || name.trim().length < 2}>
            {submitting && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            Continuar →
          </Button>
        </div>
      </div>
    </>
  );
}
```

- [ ] **Step 20.2: Build + commit**

```bash
npm run build
git add src/app/onboarding/sede
git commit -m "feat(onboarding): step 2 /onboarding/sede — crear primera sede"
```

### Task 21: Step 3 — `/onboarding/departments`

**Files:**
- Create: `src/app/onboarding/departments/page.tsx`

- [ ] **Step 21.1: Crear form de N departamentos**

Reusar el patrón de Task 20 pero con un array editable. El form permite agregar/quitar filas dinámicamente.

```typescript
// src/app/onboarding/departments/page.tsx
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Stepper } from "@/components/onboarding/stepper";
import { Loader2, Plus, X } from "lucide-react";
import { toast } from "sonner";
import type { Database } from "@/lib/supabase/database.types";

type Location = Database["public"]["Tables"]["locations"]["Row"];

interface DeptRow {
  name: string;
  location_id: string;
}

export default function DepartmentsStepPage() {
  const router = useRouter();
  const { profile } = useAuth();
  const supabase = createClient();
  const [locations, setLocations] = useState<Location[]>([]);
  const [rows, setRows] = useState<DeptRow[]>([{ name: "", location_id: "" }]);
  const [submitting, setSubmitting] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!profile?.organization_id) return;
    (async () => {
      const { data } = await supabase.from("locations").select("*").order("name");
      const locs = (data ?? []) as Location[];
      setLocations(locs);
      if (locs.length > 0) {
        setRows([{ name: "", location_id: locs[0].id }]);
      }
      setLoading(false);
    })();
  }, [profile?.organization_id, supabase]);

  function updateRow(i: number, field: keyof DeptRow, value: string) {
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, [field]: value } : r)));
  }

  function addRow() {
    setRows((prev) => [...prev, { name: "", location_id: locations[0]?.id ?? "" }]);
  }

  function removeRow(i: number) {
    setRows((prev) => prev.filter((_, idx) => idx !== i));
  }

  async function handleContinue() {
    if (!profile?.organization_id) return;
    const valid = rows.filter((r) => r.name.trim().length > 0 && r.location_id);
    if (valid.length === 0) {
      toast.error("Agrega al menos un departamento");
      return;
    }
    setSubmitting(true);
    const payload = valid.map((r) => ({
      name: r.name.trim(),
      location_id: r.location_id,
      organization_id: profile.organization_id as string,
    }));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase.from("departments") as any).insert(payload);
    if (error) {
      toast.error("Error creando departamentos");
      setSubmitting(false);
      return;
    }
    await supabase
      .from("organizations")
      .update({ onboarding_step: "positions" })
      .eq("id", profile.organization_id);
    setSubmitting(false);
    router.push("/onboarding/positions");
  }

  if (loading) return <Loader2 className="h-6 w-6 animate-spin mx-auto mt-8" />;

  return (
    <>
      <Stepper currentStep="departments" />
      <div className="bg-white rounded-xl border border-slate-200 p-8 mb-12">
        <h1 className="text-2xl font-bold mb-2">Departamentos</h1>
        <p className="text-slate-600 mb-6">
          Agrupá tus posiciones por área (ej. Cocina, Recepción, Enfermería).
        </p>
        <div className="space-y-3">
          {rows.map((r, i) => (
            <div key={i} className="flex gap-2 items-end">
              <div className="flex-1">
                {i === 0 && <Label>Nombre</Label>}
                <Input
                  value={r.name}
                  onChange={(e) => updateRow(i, "name", e.target.value)}
                  placeholder="Ej: Enfermería"
                />
              </div>
              <div className="w-48">
                {i === 0 && <Label>Sede</Label>}
                <Select value={r.location_id} onValueChange={(v) => updateRow(i, "location_id", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {locations.map((l) => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              {rows.length > 1 && (
                <Button variant="ghost" size="icon" onClick={() => removeRow(i)}>
                  <X className="h-4 w-4" />
                </Button>
              )}
            </div>
          ))}
        </div>
        <Button variant="outline" size="sm" onClick={addRow} className="mt-3">
          <Plus className="h-4 w-4 mr-1" /> Agregar departamento
        </Button>
        <div className="flex justify-between gap-2 pt-6 mt-6 border-t">
          <Button variant="outline" onClick={() => router.push("/onboarding/sede")}>← Atrás</Button>
          <Button onClick={handleContinue} disabled={submitting}>
            {submitting && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            Continuar →
          </Button>
        </div>
      </div>
    </>
  );
}
```

- [ ] **Step 21.2: Build + commit**

```bash
npm run build
git add src/app/onboarding/departments
git commit -m "feat(onboarding): step 3 /onboarding/departments — crear N departamentos"
```

### Task 22: Step 4 — `/onboarding/positions`

**Files:**
- Create: `src/app/onboarding/positions/page.tsx`

- [ ] **Step 22.1: Crear form de N posiciones con department_id select**

Estructura idéntica a departments pero campo `department_id` (cargado desde DB) y color picker simple (default `#2563EB`). Validación: ≥1 posición.

Reusa el patrón de Task 21 cambiando:
- Carga `departments` en lugar de `locations`
- Insert en `positions` con campos `{ name, department_id, color, organization_id }`
- Después de insert, UPDATE `onboarding_step='shifts'` → `router.push('/onboarding/shifts')`

(No repito el código aquí — patrón idéntico, solo cambia source data y target table. Si el implementer pide ver, le decimos "patrón de Task 21".)

- [ ] **Step 22.2: Build + commit**

```bash
npm run build
git add src/app/onboarding/positions
git commit -m "feat(onboarding): step 4 /onboarding/positions — crear N posiciones"
```

### Task 23: Step 5 — `/onboarding/shifts`

**Files:**
- Create: `src/app/onboarding/shifts/page.tsx`

- [ ] **Step 23.1: Crear form de N shift templates**

Estructura: name, start_time, end_time, location_id. `is_night` auto-suggested basado en horario (CST rule: solapa 21:00-06:00). Validación: ≥1.

Patrón idéntico a Task 21 — campos diferentes:
```typescript
interface ShiftRow {
  name: string;
  start_time: string;  // HH:MM
  end_time: string;
  location_id: string;
  is_night: boolean;   // auto
}
```

Insert payload:
```typescript
{
  name, start_time, end_time, location_id,
  is_night: suggestIsNight(start_time, end_time),  // helper existente equity-helpers
  organization_id,
}
```

Después: UPDATE `onboarding_step='team'` → push `/onboarding/team`.

- [ ] **Step 23.2: Build + commit**

```bash
npm run build
git add src/app/onboarding/shifts
git commit -m "feat(onboarding): step 5 /onboarding/shifts — crear N plantillas turno"
```

### Task 24: Step 6 — `/onboarding/team` (SKIP-ABLE)

**Files:**
- Create: `src/app/onboarding/team/page.tsx`

- [ ] **Step 24.1: Crear form de invitar emails (opcional)**

```typescript
// src/app/onboarding/team/page.tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Stepper } from "@/components/onboarding/stepper";
import { Loader2, Plus, X } from "lucide-react";
import { toast } from "sonner";

export default function TeamStepPage() {
  const router = useRouter();
  const { profile } = useAuth();
  const supabase = createClient();
  const [emails, setEmails] = useState<string[]>([""]);
  const [submitting, setSubmitting] = useState(false);

  function updateEmail(i: number, v: string) {
    setEmails((prev) => prev.map((e, idx) => (idx === i ? v : e)));
  }
  function addEmail() { setEmails((prev) => [...prev, ""]); }
  function removeEmail(i: number) { setEmails((prev) => prev.filter((_, idx) => idx !== i)); }

  async function completeOnboarding() {
    if (!profile?.organization_id) return;
    setSubmitting(true);
    await supabase
      .from("organizations")
      .update({
        onboarding_step: "done",
        onboarding_completed_at: new Date().toISOString(),
      })
      .eq("id", profile.organization_id);
    setSubmitting(false);
    router.push("/dashboard");
  }

  async function handleContinue() {
    const valid = emails.map((e) => e.trim()).filter((e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e));
    if (valid.length > 0) {
      // Invitar cada email via /api/employees/invite
      let failed = 0;
      for (const email of valid) {
        const res = await fetch("/api/employees/invite", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email,
            first_name: "",  // pendiente: dejarlo vacío permite al user setearlo después
            last_name: "",
            role: "employee",
          }),
        });
        if (!res.ok) failed++;
      }
      if (failed > 0) toast.error(`${failed} invitaciones fallaron`);
      else toast.success(`${valid.length} invitaciones enviadas`);
    }
    await completeOnboarding();
  }

  return (
    <>
      <Stepper currentStep="team" />
      <div className="bg-white rounded-xl border border-slate-200 p-8 mb-12">
        <h1 className="text-2xl font-bold mb-2">Invita a tu equipo</h1>
        <p className="text-slate-600 mb-6">
          Opcional. Podés invitar managers o empleados ahora, o saltarlo y hacerlo después desde Empleados.
        </p>
        <Label className="block mb-2">Emails a invitar (uno por línea)</Label>
        <div className="space-y-2">
          {emails.map((e, i) => (
            <div key={i} className="flex gap-2">
              <Input
                type="email"
                value={e}
                onChange={(ev) => updateEmail(i, ev.target.value)}
                placeholder="manager@empresa.com"
              />
              {emails.length > 1 && (
                <Button variant="ghost" size="icon" onClick={() => removeEmail(i)}>
                  <X className="h-4 w-4" />
                </Button>
              )}
            </div>
          ))}
        </div>
        <Button variant="outline" size="sm" onClick={addEmail} className="mt-3">
          <Plus className="h-4 w-4 mr-1" /> Agregar email
        </Button>
        <div className="flex justify-between gap-2 pt-6 mt-6 border-t">
          <Button variant="outline" onClick={() => router.push("/onboarding/shifts")}>← Atrás</Button>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={completeOnboarding} disabled={submitting}>
              Saltar y terminar
            </Button>
            <Button onClick={handleContinue} disabled={submitting}>
              {submitting && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Invitar y terminar →
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}
```

- [ ] **Step 24.2: Build + commit**

```bash
npm run build
git add src/app/onboarding/team
git commit -m "feat(onboarding): step 6 /onboarding/team — invitar emails (skip-able)"
```

---

## Phase G: Verification + PR

### Task 25: End-to-end manual smoke test

- [ ] **Step 25.1: Build + tests finales**

```bash
npm run build
npm run test
```

Expected: `✓ Compiled successfully` + `Tests 327+ passed` (298 + 16 can-manage + 13 slug-validator + ~8 wizard-state).

- [ ] **Step 25.2: Push branch**

```bash
git push -u origin feature/sub-proyecto-4-onboarding
```

- [ ] **Step 25.3: Smoke test E2E (manual via Chrome DevTools MCP)**

Crear cuenta test:
1. Llenar `/demo-request` en landing con empresa `Smoke Test Empresa SAS`, sector `salud`.
2. Como suv411 super_admin, ir a `/admin/demo-requests` — debe aparecer el lead.
3. Click "Aprobar" → modal precompletado.
4. Verificar slug auto-generado = `smoke-test-empresa-sas`. Validador muestra ✓ available.
5. Click "Aprobar y crear".
6. Verificar org creada via Supabase MCP:
   ```sql
   SELECT id, slug, plan, status, trial_ends_at FROM organizations WHERE slug LIKE 'smoke-%';
   ```
7. Verificar email Welcome llega a inbox de test.
8. Click link Auth Invite → setea password → sesión activa.
9. Middleware redirige a `/onboarding/empresa`.
10. Completar wizard 6 steps.
11. Redirect a `/dashboard`.
12. Sidebar muestra navegación completa.

- [ ] **Step 25.4: Cleanup test data**

Via Supabase MCP execute_sql:

```sql
-- Borrar org test (cascada borra todo lo del wizard)
DELETE FROM organizations WHERE slug LIKE 'smoke-%';
DELETE FROM auth.users WHERE email LIKE 'smoke-%@test.com';
DELETE FROM demo_requests WHERE empresa LIKE 'Smoke Test%';
```

### Task 26: PR

- [ ] **Step 26.1: Crear PR**

```bash
gh pr create --base main \
  --title "feat: org onboarding (sub-proyecto 4)" \
  --body "$(cat <<'EOF'
## Summary

Sub-proyecto 4: flow completo de alta de clientes (lead → approval → wizard onboarding).

- **Task 0**: `canManage/canAdmin/isSuperAdmin` helpers + refactor 19 archivos (super_admin UI guards)
- **Migration 042**: `onboarding_*` columns + `approve_demo_request` RPC atómica
- **Pantalla /admin/demo-requests**: lista + modal approval (super_admin only)
- **API /api/admin/demo-requests/{approve,check-slug}**: validation + RPC + Resend welcome
- **Wizard /onboarding/[step]**: 6 pasos (empresa, sede, depts, positions, shifts, team)
- **Middleware**: redirect a wizard mientras `onboarding_completed_at IS NULL`
- **Email Resend Welcome** + Auth invite Supabase

## Test plan

- [x] Build + tests pasan localmente
- [x] SQL test 4/4 PASSED en prod
- [x] Smoke test E2E manual completo
- [x] Cleanup test data

Spec: `docs/superpowers/specs/2026-05-20-org-onboarding-design.md`

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 26.2: Mergear (interactivo)**

```bash
gh pr merge --merge
```

- [ ] **Step 26.3: Verificar deploy production**

Esperar build Vercel. Verificar `gh api repos/LesRaptors/app-horarios/commits/main/status -q .state` = `success`.

- [ ] **Step 26.4: Documentar en memory**

Crear `~/.claude/projects/-Users-usuario-App-Horarios/memory/project_status_2026_05_XX_subproy4_shipped.md` con HEAD final + PR URL.

---

## Self-Review Checklist (al finalizar)

- [ ] Build pasa
- [ ] Tests verdes
- [ ] SQL test approve_demo_request 4/4 PASSED
- [ ] Migration 042 aplicada a Supabase Cloud
- [ ] PR mergeado a main
- [ ] Deploy production READY
- [ ] Smoke test E2E completo
- [ ] Memory actualizado
- [ ] Cleanup data test eliminada

---

## Rollback (si algo sale mal post-merge)

- Migration 042 es aditiva. Rollback: `ALTER TABLE organizations DROP COLUMN onboarding_*, ...`.
- API routes nuevos: solo borrar (no afectan código existente).
- Middleware redirect: comentar el bloque del wizard si bugea.
- Wizard pages: si una org queda atascada en un step, marcar `UPDATE organizations SET onboarding_completed_at=now() WHERE id=...` para skipear.

---

## Notas para el ejecutor

1. Antes de cada Phase, **invocar `superpowers:subagent-driven-development`** para correr la fase con un subagente independiente con review checkpoints.
2. Antes de aplicar migración 042 (Task 6), no requiere checkpoint — user pre-autorizó cloud migrations cuando son aditivas.
3. **Email Resend en test environment**: usar un inbox real (suv411 o admin@apphorarios) para validar deliverability — no usar emails ficticios que no podés revisar.
4. **Modern-web-guidance**: invocar antes de cada nueva pantalla del wizard. Aplicar a11y (labels, focus, aria-current) y CWV.
5. **Tests de email**: NO se hacen automáticos. Inspección manual del email Welcome que llega.
6. Si encontrás algún bug del sub-proy 3 que bloquee (e.g. RLS de demo_requests no permite SELECT como super_admin), arreglarlo inline con mini PR antes de seguir.
