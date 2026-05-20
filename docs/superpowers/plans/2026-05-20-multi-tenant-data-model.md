# Multi-Tenant Data Model Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Before coding UI/CSS/client-JS, invoke `modern-web-guidance:modern-web-guidance` skill (no UI in this plan, but pattern matters).

**Goal:** Convertir App Horarios de single-tenant ("Les Raptors implícito") a multi-tenant donde cada cliente del SaaS = 1 row en `organizations`, con aislamiento de datos garantizado vía RLS universal y super_admin bypass.

**Architecture:** Una migración SQL atómica (039) crea `organizations`, agrega `organization_id NOT NULL` a 24 tablas, reescribe ~80 RLS policies con patrón `organization_id = get_user_org_id() OR is_super_admin()`. Helpers SQL `get_user_org_id()` / `is_super_admin()` + helper TS `assertSameOrg()`. 5 API routes con service_role refactor (estrategia híbrida: RPCs SECURITY DEFINER + TS routes con assertSameOrg). Big bang con BEGIN/COMMIT.

**Tech Stack:** Next.js 14 App Router + TypeScript + Supabase Cloud (project `ugkvuinkynvtuiutwlkd`) + PostgreSQL + Vitest. MCPs disponibles: `plugin_supabase_supabase` (apply_migration, execute_sql, generate_typescript_types, list_tables), `plugin_github_github`.

**Spec:** `docs/superpowers/specs/2026-05-20-multi-tenant-data-model.md` (HEAD `fa0f095`)

**Branch trabajo:** `feature/sub-proyecto-3-multi-tenant`

**Skills/plugins a consultar antes de codear (siempre):**
- `supabase:supabase` — patrones Supabase Auth/RLS/migrations
- `supabase:supabase-postgres-best-practices` — RLS, índices, FK
- `vercel:nextjs` — API routes patterns
- `modern-web-guidance:modern-web-guidance` — solo si tocás UI (no aplica acá)
- MCP `plugin_supabase_supabase` para apply_migration, execute_sql, generate_typescript_types

---

## Pre-flight checks

### Task 0: Verificar pre-condiciones

- [ ] **Step 0.1: Verificar branch base**

```bash
cd "/Users/usuario/App Horarios"
git checkout main
git pull origin main
git log -1 --oneline
```

Expected: HEAD en `fa0f095` o más reciente (`docs: spec sub-proy 3 — preparación multi-país + auto-sync festivos`).

- [ ] **Step 0.2: Verificar working tree limpio**

```bash
git status
```

Expected: `nothing to commit, working tree clean`.

- [ ] **Step 0.3: Crear feature branch**

```bash
git checkout -b feature/sub-proyecto-3-multi-tenant
```

- [ ] **Step 0.4: Verificar tests pasan en estado inicial**

```bash
npm run test
```

Expected: `Tests  293 passed (293)`.

- [ ] **Step 0.5: Verificar build pasa**

```bash
npm run build
```

Expected: `✓ Compiled successfully`.

- [ ] **Step 0.6: Listar tablas actuales en Supabase (confirmar las 24)**

Usar MCP `mcp__plugin_supabase_supabase__list_tables` con `schemas: ["public"]`.

Confirmar que las siguientes 24 tablas existen:
`locations`, `departments`, `positions`, `profiles`, `shift_templates`, `schedules`, `schedule_entries`, `staffing_requirements`, `staffing_audit`, `time_off_requests`, `shift_swap_requests`, `notifications`, `app_settings`, `payroll_settings`, `contract_types`, `contract_rest_rules`, `employee_rest_rules`, `payroll_periods`, `payroll_entries`, `salary_advances`, `salary_settlements`, `holidays`, `employee_equity_rollups`, `employee_secondary_positions`.

Si aparece alguna tabla auxiliar no listada (ej. `app_audit_log`, `realtime.*`), anotala — irá al spec como nota de cleanup y se decide si recibe org_id.

- [ ] **Step 0.7: Capturar mi UUID real desde profiles**

Ejecutar SQL via MCP `mcp__plugin_supabase_supabase__execute_sql`:

```sql
SELECT id, email, role FROM profiles WHERE email = 'suv411@hotmail.com';
```

Anotar el UUID resultante — lo usaremos en el step que promueve a super_admin (no hardcodear email en el SQL del UPDATE final por si cambia en el futuro).

- [ ] **Step 0.8: Tomar backup manual de la base**

Vía Supabase dashboard (https://supabase.com/dashboard/project/ugkvuinkynvtuiutwlkd) → Database → Backups → "Create backup now". Confirmar timestamp del snapshot.

Sin este step no se procede a aplicar la migración.

---

## Phase A: TypeScript helper assertSameOrg (TDD)

### Task 1: Test-driven `assertSameOrg` helper

**Files:**
- Create: `src/lib/auth/assert-same-org.ts`
- Create: `src/lib/auth/assert-same-org.test.ts`

- [ ] **Step 1.1: Crear test file con tests fallando**

Crear `src/lib/auth/assert-same-org.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest';
import { assertSameOrg, getCallerContext, CrossTenantError } from './assert-same-org';
import type { SupabaseClient } from '@supabase/supabase-js';

function mockSupabaseFor(orgIdResult: string | null | undefined, errorResult: unknown = null) {
  const maybeSingle = vi.fn().mockResolvedValue({
    data: orgIdResult === undefined ? null : { organization_id: orgIdResult },
    error: errorResult,
  });
  const eq = vi.fn().mockReturnValue({ maybeSingle });
  const select = vi.fn().mockReturnValue({ eq });
  const from = vi.fn().mockReturnValue({ select });
  return { from } as unknown as SupabaseClient;
}

describe('assertSameOrg', () => {
  const ORG_A = '00000000-0000-0000-0000-000000000001';
  const ORG_B = '00000000-0000-0000-0000-000000000002';

  it('no throw cuando callerOrgId === resource.organization_id', async () => {
    const sb = mockSupabaseFor(ORG_A);
    await expect(assertSameOrg(sb, ORG_A, 'res-1', 'profiles')).resolves.toBeUndefined();
  });

  it('throws CrossTenantError cuando orgs distintos', async () => {
    const sb = mockSupabaseFor(ORG_B);
    await expect(assertSameOrg(sb, ORG_A, 'res-1', 'profiles'))
      .rejects.toBeInstanceOf(CrossTenantError);
  });

  it('throws CrossTenantError cuando recurso no existe', async () => {
    const sb = mockSupabaseFor(undefined);
    await expect(assertSameOrg(sb, ORG_A, 'missing', 'profiles'))
      .rejects.toBeInstanceOf(CrossTenantError);
  });

  it('super_admin (callerOrgId=null) skipea check', async () => {
    const sb = mockSupabaseFor(ORG_B);  // even if mismatch
    await expect(assertSameOrg(sb, null, 'res-1', 'profiles')).resolves.toBeUndefined();
  });

  it('throws CrossTenantError ante error de Supabase', async () => {
    const sb = mockSupabaseFor(undefined, new Error('db down'));
    await expect(assertSameOrg(sb, ORG_A, 'res-1', 'profiles'))
      .rejects.toBeInstanceOf(CrossTenantError);
  });
});
```

- [ ] **Step 1.2: Correr test → debe fallar (helper no existe)**

```bash
npm run test -- --run src/lib/auth/assert-same-org.test.ts
```

Expected: `FAIL` con "Failed to resolve import" o similar — el archivo `assert-same-org.ts` no existe aún.

- [ ] **Step 1.3: Implementar `assertSameOrg`**

Crear `src/lib/auth/assert-same-org.ts`:

```typescript
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/supabase/database.types';

// Tablas que tienen organization_id (post migración 039)
export type TableWithOrgId =
  | 'profiles'
  | 'locations'
  | 'departments'
  | 'positions'
  | 'shift_templates'
  | 'schedules'
  | 'schedule_entries'
  | 'staffing_requirements'
  | 'time_off_requests'
  | 'shift_swap_requests'
  | 'notifications'
  | 'app_settings'
  | 'payroll_settings'
  | 'contract_types'
  | 'contract_rest_rules'
  | 'employee_rest_rules'
  | 'payroll_periods'
  | 'payroll_entries'
  | 'salary_advances'
  | 'salary_settlements'
  | 'holidays'
  | 'employee_equity_rollups'
  | 'employee_secondary_positions'
  | 'staffing_audit';

export class CrossTenantError extends Error {
  constructor(public table: string, public resourceId: string) {
    super(`Cross-tenant access denied: ${table}/${resourceId}`);
    this.name = 'CrossTenantError';
  }
}

/**
 * Validates that a resource (identified by table + id) belongs to the caller's org.
 * super_admin callers (callerOrgId === null) skip the check.
 * Throws CrossTenantError if mismatch, missing resource, or DB error.
 */
export async function assertSameOrg(
  supabase: SupabaseClient<Database>,
  callerOrgId: string | null,
  resourceId: string,
  table: TableWithOrgId
): Promise<void> {
  if (callerOrgId === null) return;  // super_admin bypass

  const { data, error } = await supabase
    .from(table)
    .select('organization_id')
    .eq('id', resourceId)
    .maybeSingle();

  if (error || !data) {
    throw new CrossTenantError(table, resourceId);
  }
  if ((data as { organization_id: string }).organization_id !== callerOrgId) {
    throw new CrossTenantError(table, resourceId);
  }
}

/**
 * Resolves the caller's auth context from a server-side Supabase client.
 * Returns null orgId if user is super_admin.
 * Throws Response(401) if not authenticated.
 */
export async function getCallerContext(supabase: SupabaseClient<Database>) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Response('Unauthorized', { status: 401 });

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, role, organization_id')
    .eq('id', user.id)
    .single();

  if (!profile) throw new Response('Profile not found', { status: 401 });

  const isSuperAdmin = profile.role === 'super_admin';

  return {
    userId: profile.id,
    role: profile.role,
    orgId: isSuperAdmin ? null : (profile as { organization_id: string }).organization_id,
    isSuperAdmin,
  };
}
```

- [ ] **Step 1.4: Correr tests → deben pasar (5/5)**

```bash
npm run test -- --run src/lib/auth/assert-same-org.test.ts
```

Expected: `Tests  5 passed (5)`.

- [ ] **Step 1.5: Correr suite completa → 298 tests pasan (293 + 5)**

```bash
npm run test
```

Expected: `Tests  298 passed (298)`.

- [ ] **Step 1.6: Commit**

```bash
git add src/lib/auth/assert-same-org.ts src/lib/auth/assert-same-org.test.ts
git commit -m "$(cat <<'EOF'
feat(auth): assertSameOrg helper + tests para cross-tenant protection

- assertSameOrg(supabase, callerOrgId, resourceId, table): valida que el
  recurso pertenece al org del caller. null = super_admin skip.
- getCallerContext(supabase): resuelve user + role + orgId desde server client.
- CrossTenantError: error tipado para 403 responses.
- 5 Vitest tests (TDD): same org / diff org / missing resource / super_admin
  bypass / DB error.

Spec: docs/superpowers/specs/2026-05-20-multi-tenant-data-model.md §7.1

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Phase B: Migration 039 — Build SQL file (NO aplicar todavía)

### Task 2: Scaffold migration file

**Files:**
- Create: `supabase/migrations/039_multi_tenant.sql`

- [ ] **Step 2.1: Crear archivo con estructura skeleton**

Crear `supabase/migrations/039_multi_tenant.sql`:

```sql
-- =============================================================================
-- Migration 039 — Multi-tenant data model
-- Spec: docs/superpowers/specs/2026-05-20-multi-tenant-data-model.md
--
-- Convierte la app de single-tenant ("Les Raptors implícito") a multi-tenant.
-- - Crea tabla organizations
-- - Agrega organization_id NOT NULL a 24 tablas
-- - Reescribe ~80 RLS policies con patrón universal
-- - Crea helpers get_user_org_id, is_super_admin, slugify, suggest_unique_slug
-- - Promueve suv411@hotmail.com a super_admin
-- - Holidays.country column + RLS country-match (prep multi-país)
-- =============================================================================

BEGIN;

-- =============================================================================
-- 1. Extensions (idempotente)
-- =============================================================================
-- (rellenar en Task 3)

-- =============================================================================
-- 2. Tabla organizations
-- =============================================================================
-- (rellenar en Task 4)

-- =============================================================================
-- 3. Insertar Les Raptors con UUID fijo
-- =============================================================================
-- (rellenar en Task 5)

-- =============================================================================
-- 4. Helpers SQL (get_user_org_id, is_super_admin, slugify, suggest_unique_slug)
-- =============================================================================
-- (rellenar en Task 6)

-- =============================================================================
-- 5. Extender profiles.role con super_admin
-- =============================================================================
-- (rellenar en Task 7)

-- =============================================================================
-- 6. ALTER las 24 tablas: ADD COLUMN organization_id UUID NULL
-- =============================================================================
-- (rellenar en Task 8)

-- =============================================================================
-- 7. Backfill: SET organization_id = Les Raptors UUID
-- =============================================================================
-- (rellenar en Task 9)

-- =============================================================================
-- 8. SET NOT NULL + FK constraints
-- =============================================================================
-- (rellenar en Task 10)

-- =============================================================================
-- 9. holidays.country (multi-país prep)
-- =============================================================================
-- (rellenar en Task 11)

-- =============================================================================
-- 10. DROP RLS policies viejas
-- =============================================================================
-- (rellenar en Task 12)

-- =============================================================================
-- 11. CREATE RLS policies nuevas con patrón universal
-- =============================================================================
-- (rellenar en Task 13)

-- =============================================================================
-- 12. Promover suv411@hotmail.com a super_admin
-- =============================================================================
-- (rellenar en Task 14)

-- =============================================================================
-- 13. Verificación inline
-- =============================================================================
-- (rellenar en Task 15)

COMMIT;
```

- [ ] **Step 2.2: Commit skeleton (intencional — permite revisar incrementalmente)**

```bash
git add supabase/migrations/039_multi_tenant.sql
git commit -m "wip(migration 039): scaffold multi-tenant migration

Skeleton con secciones placeholders. Será rellenado en commits siguientes.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

### Task 3: Extensions

- [ ] **Step 3.1: Reemplazar sección 1 con extensions**

En `supabase/migrations/039_multi_tenant.sql`, reemplazar la sección 1 placeholder:

```sql
-- =============================================================================
-- 1. Extensions (idempotente)
-- =============================================================================
CREATE EXTENSION IF NOT EXISTS unaccent;
-- pgcrypto ya está instalado para gen_random_uuid()
```

- [ ] **Step 3.2: No commit individual (continuamos)**

### Task 4: Tabla organizations + indexes + trigger updated_at

- [ ] **Step 4.1: Reemplazar sección 2 con CREATE TABLE**

```sql
-- =============================================================================
-- 2. Tabla organizations
-- =============================================================================
CREATE TABLE organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Identidad
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  legal_name TEXT,
  nit TEXT,

  -- Clasificación
  industry TEXT CHECK (industry IS NULL OR industry IN ('salud','retail','hoteleria','vigilancia','otro')),
  country TEXT NOT NULL DEFAULT 'CO',
  timezone TEXT NOT NULL DEFAULT 'America/Bogota',

  -- Lifecycle
  plan TEXT NOT NULL DEFAULT 'trial' CHECK (plan IN ('trial','starter','pro','enterprise')),
  status TEXT NOT NULL DEFAULT 'trialing' CHECK (status IN ('trialing','active','paused','churned')),
  trial_ends_at TIMESTAMPTZ,
  billing_email TEXT,

  -- Branding
  logo_url TEXT,
  logo_url_dark TEXT,
  primary_color TEXT,

  -- Audit
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX organizations_status_idx ON organizations(status);
CREATE INDEX organizations_country_idx ON organizations(country);

-- updated_at trigger (asume set_updated_at() existe; si no, lo creamos abajo)
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER organizations_set_updated_at
  BEFORE UPDATE ON organizations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Enable RLS pero policies se definen en sección 11
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
```

### Task 5: Insertar Les Raptors

- [ ] **Step 5.1: Reemplazar sección 3**

```sql
-- =============================================================================
-- 3. Insertar Les Raptors con UUID fijo
-- =============================================================================
INSERT INTO organizations (
  id, name, slug, plan, status, trial_ends_at, country, timezone
) VALUES (
  '00000000-0000-0000-0000-000000000001',
  'Les Raptors',
  'les-raptors',
  'enterprise',
  'active',
  NULL,  -- sin trial, cuenta interna
  'CO',
  'America/Bogota'
);
```

### Task 6: Helpers SQL

- [ ] **Step 6.1: Reemplazar sección 4**

```sql
-- =============================================================================
-- 4. Helpers SQL
-- =============================================================================

-- get_user_org_id: retorna org_id del caller, o NULL si super_admin
CREATE OR REPLACE FUNCTION public.get_user_org_id()
RETURNS UUID
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT organization_id FROM profiles WHERE id = auth.uid()
$$;

-- is_super_admin: boolean, true si caller tiene role='super_admin'
CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT COALESCE(role = 'super_admin', false) FROM profiles WHERE id = auth.uid()
$$;

-- slugify: lowercase, sin tildes, kebab-case
CREATE OR REPLACE FUNCTION public.slugify(input TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT regexp_replace(
    regexp_replace(
      lower(unaccent(input)),
      '[^a-z0-9]+', '-', 'g'
    ),
    '(^-+|-+$)', '', 'g'
  )
$$;

-- suggest_unique_slug: prueba sufijos hasta encontrar uno libre
CREATE OR REPLACE FUNCTION public.suggest_unique_slug(p_name TEXT)
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
  base TEXT := slugify(p_name);
  candidate TEXT := base;
  counter INT := 2;
BEGIN
  WHILE EXISTS (SELECT 1 FROM organizations WHERE slug = candidate) LOOP
    candidate := base || '-' || counter;
    counter := counter + 1;
  END LOOP;
  RETURN candidate;
END;
$$;

-- Permisos para que el client anon pueda llamar suggest_unique_slug en sub-proy 4 (/signup)
GRANT EXECUTE ON FUNCTION public.suggest_unique_slug(TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_org_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_super_admin() TO authenticated;
```

### Task 7: Extender profiles.role

- [ ] **Step 7.1: Reemplazar sección 5**

```sql
-- =============================================================================
-- 5. Extender profiles.role con super_admin
-- =============================================================================
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE profiles ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('super_admin','admin','manager','employee'));
```

### Task 8: ADD COLUMN organization_id a 24 tablas (NULL inicial)

- [ ] **Step 8.1: Reemplazar sección 6**

```sql
-- =============================================================================
-- 6. ALTER las 24 tablas: ADD COLUMN organization_id UUID NULL
-- =============================================================================
-- (Las 24 tablas listadas en spec §4.3)

ALTER TABLE locations                    ADD COLUMN organization_id UUID;
ALTER TABLE departments                  ADD COLUMN organization_id UUID;
ALTER TABLE positions                    ADD COLUMN organization_id UUID;
ALTER TABLE profiles                     ADD COLUMN organization_id UUID;
ALTER TABLE shift_templates              ADD COLUMN organization_id UUID;
ALTER TABLE schedules                    ADD COLUMN organization_id UUID;
ALTER TABLE schedule_entries             ADD COLUMN organization_id UUID;
ALTER TABLE staffing_requirements        ADD COLUMN organization_id UUID;
ALTER TABLE staffing_audit               ADD COLUMN organization_id UUID;
ALTER TABLE time_off_requests            ADD COLUMN organization_id UUID;
ALTER TABLE shift_swap_requests          ADD COLUMN organization_id UUID;
ALTER TABLE notifications                ADD COLUMN organization_id UUID;
ALTER TABLE app_settings                 ADD COLUMN organization_id UUID;
ALTER TABLE payroll_settings             ADD COLUMN organization_id UUID;
ALTER TABLE contract_types               ADD COLUMN organization_id UUID;
ALTER TABLE contract_rest_rules          ADD COLUMN organization_id UUID;
ALTER TABLE employee_rest_rules          ADD COLUMN organization_id UUID;
ALTER TABLE payroll_periods              ADD COLUMN organization_id UUID;
ALTER TABLE payroll_entries              ADD COLUMN organization_id UUID;
ALTER TABLE salary_advances              ADD COLUMN organization_id UUID;
ALTER TABLE salary_settlements           ADD COLUMN organization_id UUID;
ALTER TABLE holidays                     ADD COLUMN organization_id UUID;
ALTER TABLE employee_equity_rollups      ADD COLUMN organization_id UUID;
ALTER TABLE employee_secondary_positions ADD COLUMN organization_id UUID;
```

### Task 9: Backfill Les Raptors UUID

- [ ] **Step 9.1: Reemplazar sección 7**

```sql
-- =============================================================================
-- 7. Backfill: SET organization_id = Les Raptors UUID
-- =============================================================================

UPDATE locations                    SET organization_id = '00000000-0000-0000-0000-000000000001';
UPDATE departments                  SET organization_id = '00000000-0000-0000-0000-000000000001';
UPDATE positions                    SET organization_id = '00000000-0000-0000-0000-000000000001';
UPDATE profiles                     SET organization_id = '00000000-0000-0000-0000-000000000001';
UPDATE shift_templates              SET organization_id = '00000000-0000-0000-0000-000000000001';
UPDATE schedules                    SET organization_id = '00000000-0000-0000-0000-000000000001';
UPDATE schedule_entries             SET organization_id = '00000000-0000-0000-0000-000000000001';
UPDATE staffing_requirements        SET organization_id = '00000000-0000-0000-0000-000000000001';
UPDATE staffing_audit               SET organization_id = '00000000-0000-0000-0000-000000000001';
UPDATE time_off_requests            SET organization_id = '00000000-0000-0000-0000-000000000001';
UPDATE shift_swap_requests          SET organization_id = '00000000-0000-0000-0000-000000000001';
UPDATE notifications                SET organization_id = '00000000-0000-0000-0000-000000000001';
UPDATE app_settings                 SET organization_id = '00000000-0000-0000-0000-000000000001';
UPDATE payroll_settings             SET organization_id = '00000000-0000-0000-0000-000000000001';
UPDATE contract_types               SET organization_id = '00000000-0000-0000-0000-000000000001';
UPDATE contract_rest_rules          SET organization_id = '00000000-0000-0000-0000-000000000001';
UPDATE employee_rest_rules          SET organization_id = '00000000-0000-0000-0000-000000000001';
UPDATE payroll_periods              SET organization_id = '00000000-0000-0000-0000-000000000001';
UPDATE payroll_entries              SET organization_id = '00000000-0000-0000-0000-000000000001';
UPDATE salary_advances              SET organization_id = '00000000-0000-0000-0000-000000000001';
UPDATE salary_settlements           SET organization_id = '00000000-0000-0000-0000-000000000001';
UPDATE employee_equity_rollups      SET organization_id = '00000000-0000-0000-0000-000000000001';
UPDATE employee_secondary_positions SET organization_id = '00000000-0000-0000-0000-000000000001';

-- holidays: solo las per-sede van a Les Raptors. Las nacionales (location_id IS NULL) se quedan con organization_id IS NULL.
UPDATE holidays SET organization_id = '00000000-0000-0000-0000-000000000001'
  WHERE location_id IS NOT NULL;
```

### Task 10: SET NOT NULL + FK constraints

- [ ] **Step 10.1: Reemplazar sección 8**

```sql
-- =============================================================================
-- 8. SET NOT NULL + FK constraints
-- =============================================================================

-- profiles excepción: super_admin tiene organization_id IS NULL → la columna queda NULLABLE
-- pero con CHECK constraint: super_admin → NULL, otros → NOT NULL
ALTER TABLE profiles ADD CONSTRAINT profiles_org_required
  CHECK (
    (role = 'super_admin' AND organization_id IS NULL)
    OR
    (role != 'super_admin' AND organization_id IS NOT NULL)
  );
ALTER TABLE profiles ADD CONSTRAINT profiles_org_fk
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE RESTRICT;

-- Las otras 23 tablas: organization_id NOT NULL + FK
ALTER TABLE locations                    ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE locations                    ADD CONSTRAINT locations_org_fk                    FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE RESTRICT;
ALTER TABLE departments                  ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE departments                  ADD CONSTRAINT departments_org_fk                  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE RESTRICT;
ALTER TABLE positions                    ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE positions                    ADD CONSTRAINT positions_org_fk                    FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE RESTRICT;
ALTER TABLE shift_templates              ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE shift_templates              ADD CONSTRAINT shift_templates_org_fk              FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE RESTRICT;
ALTER TABLE schedules                    ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE schedules                    ADD CONSTRAINT schedules_org_fk                    FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE RESTRICT;
ALTER TABLE schedule_entries             ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE schedule_entries             ADD CONSTRAINT schedule_entries_org_fk             FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE RESTRICT;
ALTER TABLE staffing_requirements        ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE staffing_requirements        ADD CONSTRAINT staffing_requirements_org_fk        FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE RESTRICT;
ALTER TABLE staffing_audit               ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE staffing_audit               ADD CONSTRAINT staffing_audit_org_fk               FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE RESTRICT;
ALTER TABLE time_off_requests            ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE time_off_requests            ADD CONSTRAINT time_off_requests_org_fk            FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE RESTRICT;
ALTER TABLE shift_swap_requests          ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE shift_swap_requests          ADD CONSTRAINT shift_swap_requests_org_fk          FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE RESTRICT;
ALTER TABLE notifications                ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE notifications                ADD CONSTRAINT notifications_org_fk                FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE RESTRICT;
ALTER TABLE app_settings                 ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE app_settings                 ADD CONSTRAINT app_settings_org_fk                 FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE RESTRICT;
ALTER TABLE payroll_settings             ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE payroll_settings             ADD CONSTRAINT payroll_settings_org_fk             FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE RESTRICT;
ALTER TABLE contract_types               ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE contract_types               ADD CONSTRAINT contract_types_org_fk               FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE RESTRICT;
ALTER TABLE contract_rest_rules          ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE contract_rest_rules          ADD CONSTRAINT contract_rest_rules_org_fk          FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE RESTRICT;
ALTER TABLE employee_rest_rules          ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE employee_rest_rules          ADD CONSTRAINT employee_rest_rules_org_fk          FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE RESTRICT;
ALTER TABLE payroll_periods              ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE payroll_periods              ADD CONSTRAINT payroll_periods_org_fk              FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE RESTRICT;
ALTER TABLE payroll_entries              ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE payroll_entries              ADD CONSTRAINT payroll_entries_org_fk              FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE RESTRICT;
ALTER TABLE salary_advances              ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE salary_advances              ADD CONSTRAINT salary_advances_org_fk              FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE RESTRICT;
ALTER TABLE salary_settlements           ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE salary_settlements           ADD CONSTRAINT salary_settlements_org_fk           FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE RESTRICT;
ALTER TABLE employee_equity_rollups      ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE employee_equity_rollups      ADD CONSTRAINT employee_equity_rollups_org_fk      FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE RESTRICT;
ALTER TABLE employee_secondary_positions ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE employee_secondary_positions ADD CONSTRAINT employee_secondary_positions_org_fk FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE RESTRICT;

-- holidays: NULLABLE (nacionales) — FK opcional
ALTER TABLE holidays ADD CONSTRAINT holidays_org_fk
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE RESTRICT;

-- Crear indexes en organization_id para performance (las tablas grandes)
CREATE INDEX schedule_entries_org_idx ON schedule_entries(organization_id);
CREATE INDEX notifications_org_idx ON notifications(organization_id);
CREATE INDEX employee_equity_rollups_org_idx ON employee_equity_rollups(organization_id);
CREATE INDEX payroll_entries_org_idx ON payroll_entries(organization_id);
```

### Task 11: holidays.country (multi-país prep)

- [ ] **Step 11.1: Reemplazar sección 9**

```sql
-- =============================================================================
-- 9. holidays.country (multi-país prep)
-- =============================================================================
ALTER TABLE holidays ADD COLUMN country TEXT NOT NULL DEFAULT 'CO';
CREATE INDEX holidays_country_idx ON holidays(country);
```

### Task 12: DROP RLS policies viejas

- [ ] **Step 12.1: Reemplazar sección 10 con DROP de todas las policies**

```sql
-- =============================================================================
-- 10. DROP RLS policies viejas
-- =============================================================================
-- Estrategia: dropear TODAS las policies de las tablas a refactorizar y
-- recrearlas en sección 11 con el patrón universal.
--
-- DROP usa IF EXISTS para idempotencia. Si una policy tiene un nombre distinto
-- del listado abajo, agregarlo. Lista verificable con:
--   SELECT schemaname, tablename, policyname FROM pg_policies WHERE schemaname='public';

-- Helper macro-style: bloque DO para iterar y dropear todas las policies de cada tabla.
DO $$
DECLARE
  pol RECORD;
  target_tables TEXT[] := ARRAY[
    'locations','departments','positions','profiles','shift_templates',
    'schedules','schedule_entries','staffing_requirements','staffing_audit',
    'time_off_requests','shift_swap_requests','notifications',
    'app_settings','payroll_settings','contract_types','contract_rest_rules',
    'employee_rest_rules','payroll_periods','payroll_entries','salary_advances',
    'salary_settlements','holidays','employee_equity_rollups','employee_secondary_positions',
    'organizations'
  ];
BEGIN
  FOR pol IN
    SELECT schemaname, tablename, policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = ANY(target_tables)
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I',
      pol.policyname, pol.schemaname, pol.tablename);
  END LOOP;
END $$;
```

### Task 13: CREATE RLS policies nuevas con patrón universal

- [ ] **Step 13.1: Reemplazar sección 11**

```sql
-- =============================================================================
-- 11. CREATE RLS policies nuevas con patrón universal
-- =============================================================================

-- ---------- organizations (tabla maestra) ----------
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;

CREATE POLICY organizations_select ON organizations
  FOR SELECT TO authenticated USING (
    is_super_admin() OR id = get_user_org_id()
  );

CREATE POLICY organizations_insert ON organizations
  FOR INSERT TO authenticated WITH CHECK (is_super_admin());

CREATE POLICY organizations_update ON organizations
  FOR UPDATE TO authenticated USING (
    is_super_admin() OR (id = get_user_org_id() AND get_user_role() = 'admin')
  );

CREATE POLICY organizations_delete ON organizations
  FOR DELETE TO authenticated USING (is_super_admin());

-- ---------- Tabla con patrón estándar (helper) ----------
-- Para cada tabla, 4 policies SELECT/INSERT/UPDATE/DELETE.

-- locations
CREATE POLICY locations_select ON locations FOR SELECT TO authenticated USING (
  is_super_admin() OR organization_id = get_user_org_id()
);
CREATE POLICY locations_insert ON locations FOR INSERT TO authenticated WITH CHECK (
  is_super_admin() OR (organization_id = get_user_org_id() AND get_user_role() IN ('admin','manager'))
);
CREATE POLICY locations_update ON locations FOR UPDATE TO authenticated USING (
  is_super_admin() OR (organization_id = get_user_org_id() AND get_user_role() IN ('admin','manager'))
);
CREATE POLICY locations_delete ON locations FOR DELETE TO authenticated USING (
  is_super_admin() OR (organization_id = get_user_org_id() AND get_user_role() IN ('admin','manager'))
);

-- departments
CREATE POLICY departments_select ON departments FOR SELECT TO authenticated USING (
  is_super_admin() OR organization_id = get_user_org_id()
);
CREATE POLICY departments_insert ON departments FOR INSERT TO authenticated WITH CHECK (
  is_super_admin() OR (organization_id = get_user_org_id() AND get_user_role() IN ('admin','manager'))
);
CREATE POLICY departments_update ON departments FOR UPDATE TO authenticated USING (
  is_super_admin() OR (organization_id = get_user_org_id() AND get_user_role() IN ('admin','manager'))
);
CREATE POLICY departments_delete ON departments FOR DELETE TO authenticated USING (
  is_super_admin() OR (organization_id = get_user_org_id() AND get_user_role() IN ('admin','manager'))
);

-- positions
CREATE POLICY positions_select ON positions FOR SELECT TO authenticated USING (
  is_super_admin() OR organization_id = get_user_org_id()
);
CREATE POLICY positions_insert ON positions FOR INSERT TO authenticated WITH CHECK (
  is_super_admin() OR (organization_id = get_user_org_id() AND get_user_role() IN ('admin','manager'))
);
CREATE POLICY positions_update ON positions FOR UPDATE TO authenticated USING (
  is_super_admin() OR (organization_id = get_user_org_id() AND get_user_role() IN ('admin','manager'))
);
CREATE POLICY positions_delete ON positions FOR DELETE TO authenticated USING (
  is_super_admin() OR (organization_id = get_user_org_id() AND get_user_role() IN ('admin','manager'))
);

-- profiles (con especiales)
CREATE POLICY profiles_select ON profiles FOR SELECT TO authenticated USING (
  is_super_admin() OR organization_id = get_user_org_id()
);
-- INSERT: bloqueado (auth trigger lo maneja)
CREATE POLICY profiles_insert ON profiles FOR INSERT TO authenticated WITH CHECK (false);
-- UPDATE OWN: employee solo puede actualizar su phone
CREATE POLICY profiles_update_own ON profiles FOR UPDATE TO authenticated USING (
  id = auth.uid()
);
-- UPDATE ADMIN: admin/manager actualizan cualquiera de su org
CREATE POLICY profiles_update_admin ON profiles FOR UPDATE TO authenticated USING (
  is_super_admin() OR (organization_id = get_user_org_id() AND get_user_role() IN ('admin','manager'))
);
-- DELETE: admin/manager (soft delete via is_active = false en general; hard delete para demos)
CREATE POLICY profiles_delete_admin ON profiles FOR DELETE TO authenticated USING (
  is_super_admin() OR (organization_id = get_user_org_id() AND get_user_role() IN ('admin','manager'))
);

-- shift_templates
CREATE POLICY shift_templates_select ON shift_templates FOR SELECT TO authenticated USING (
  is_super_admin() OR organization_id = get_user_org_id()
);
CREATE POLICY shift_templates_insert ON shift_templates FOR INSERT TO authenticated WITH CHECK (
  is_super_admin() OR (organization_id = get_user_org_id() AND get_user_role() IN ('admin','manager'))
);
CREATE POLICY shift_templates_update ON shift_templates FOR UPDATE TO authenticated USING (
  is_super_admin() OR (organization_id = get_user_org_id() AND get_user_role() IN ('admin','manager'))
);
CREATE POLICY shift_templates_delete ON shift_templates FOR DELETE TO authenticated USING (
  is_super_admin() OR (organization_id = get_user_org_id() AND get_user_role() IN ('admin','manager'))
);

-- schedules
CREATE POLICY schedules_select ON schedules FOR SELECT TO authenticated USING (
  is_super_admin() OR organization_id = get_user_org_id()
);
CREATE POLICY schedules_insert ON schedules FOR INSERT TO authenticated WITH CHECK (
  is_super_admin() OR (organization_id = get_user_org_id() AND get_user_role() IN ('admin','manager'))
);
CREATE POLICY schedules_update ON schedules FOR UPDATE TO authenticated USING (
  is_super_admin() OR (organization_id = get_user_org_id() AND get_user_role() IN ('admin','manager'))
);
CREATE POLICY schedules_delete ON schedules FOR DELETE TO authenticated USING (
  is_super_admin() OR (organization_id = get_user_org_id() AND get_user_role() IN ('admin','manager'))
);

-- schedule_entries
CREATE POLICY schedule_entries_select ON schedule_entries FOR SELECT TO authenticated USING (
  is_super_admin() OR organization_id = get_user_org_id()
);
CREATE POLICY schedule_entries_insert ON schedule_entries FOR INSERT TO authenticated WITH CHECK (
  is_super_admin() OR (organization_id = get_user_org_id() AND get_user_role() IN ('admin','manager'))
);
CREATE POLICY schedule_entries_update ON schedule_entries FOR UPDATE TO authenticated USING (
  is_super_admin() OR (organization_id = get_user_org_id() AND get_user_role() IN ('admin','manager'))
);
CREATE POLICY schedule_entries_delete ON schedule_entries FOR DELETE TO authenticated USING (
  is_super_admin() OR (organization_id = get_user_org_id() AND get_user_role() IN ('admin','manager'))
);

-- staffing_requirements (lectura por todos en el org, write admin/manager)
CREATE POLICY staffing_requirements_select ON staffing_requirements FOR SELECT TO authenticated USING (
  is_super_admin() OR organization_id = get_user_org_id()
);
CREATE POLICY staffing_requirements_insert ON staffing_requirements FOR INSERT TO authenticated WITH CHECK (
  is_super_admin() OR (organization_id = get_user_org_id() AND get_user_role() IN ('admin','manager'))
);
CREATE POLICY staffing_requirements_update ON staffing_requirements FOR UPDATE TO authenticated USING (
  is_super_admin() OR (organization_id = get_user_org_id() AND get_user_role() IN ('admin','manager'))
);
CREATE POLICY staffing_requirements_delete ON staffing_requirements FOR DELETE TO authenticated USING (
  is_super_admin() OR (organization_id = get_user_org_id() AND get_user_role() IN ('admin','manager'))
);

-- staffing_audit (read-only via trigger; admin/manager pueden VER)
CREATE POLICY staffing_audit_select ON staffing_audit FOR SELECT TO authenticated USING (
  is_super_admin() OR (organization_id = get_user_org_id() AND get_user_role() IN ('admin','manager'))
);
-- INSERT/UPDATE/DELETE solo via trigger (sin policies = bloqueado para authenticated)

-- time_off_requests (employee crea las suyas, admin/manager aprueba)
CREATE POLICY time_off_requests_select ON time_off_requests FOR SELECT TO authenticated USING (
  is_super_admin() OR organization_id = get_user_org_id()
);
CREATE POLICY time_off_requests_insert ON time_off_requests FOR INSERT TO authenticated WITH CHECK (
  is_super_admin() OR (organization_id = get_user_org_id() AND employee_id = auth.uid())
);
CREATE POLICY time_off_requests_update ON time_off_requests FOR UPDATE TO authenticated USING (
  is_super_admin() OR (organization_id = get_user_org_id() AND get_user_role() IN ('admin','manager'))
);
CREATE POLICY time_off_requests_delete ON time_off_requests FOR DELETE TO authenticated USING (
  is_super_admin() OR (organization_id = get_user_org_id() AND (get_user_role() IN ('admin','manager') OR employee_id = auth.uid()))
);

-- shift_swap_requests
CREATE POLICY shift_swap_requests_select ON shift_swap_requests FOR SELECT TO authenticated USING (
  is_super_admin() OR organization_id = get_user_org_id()
);
CREATE POLICY shift_swap_requests_insert ON shift_swap_requests FOR INSERT TO authenticated WITH CHECK (
  is_super_admin() OR (organization_id = get_user_org_id())
);
CREATE POLICY shift_swap_requests_update ON shift_swap_requests FOR UPDATE TO authenticated USING (
  is_super_admin() OR (organization_id = get_user_org_id())
);
CREATE POLICY shift_swap_requests_delete ON shift_swap_requests FOR DELETE TO authenticated USING (
  is_super_admin() OR (organization_id = get_user_org_id() AND get_user_role() IN ('admin','manager'))
);

-- notifications (employee ve las suyas + las de su org si es admin)
CREATE POLICY notifications_select ON notifications FOR SELECT TO authenticated USING (
  is_super_admin() OR (organization_id = get_user_org_id() AND (user_id = auth.uid() OR get_user_role() IN ('admin','manager')))
);
CREATE POLICY notifications_insert ON notifications FOR INSERT TO authenticated WITH CHECK (
  is_super_admin() OR organization_id = get_user_org_id()
);
CREATE POLICY notifications_update ON notifications FOR UPDATE TO authenticated USING (
  is_super_admin() OR (organization_id = get_user_org_id() AND user_id = auth.uid())
);
CREATE POLICY notifications_delete ON notifications FOR DELETE TO authenticated USING (
  is_super_admin() OR (organization_id = get_user_org_id() AND user_id = auth.uid())
);

-- app_settings (admin/manager R/W; employee read)
CREATE POLICY app_settings_select ON app_settings FOR SELECT TO authenticated USING (
  is_super_admin() OR organization_id = get_user_org_id()
);
CREATE POLICY app_settings_insert ON app_settings FOR INSERT TO authenticated WITH CHECK (
  is_super_admin() OR (organization_id = get_user_org_id() AND get_user_role() IN ('admin','manager'))
);
CREATE POLICY app_settings_update ON app_settings FOR UPDATE TO authenticated USING (
  is_super_admin() OR (organization_id = get_user_org_id() AND get_user_role() IN ('admin','manager'))
);
CREATE POLICY app_settings_delete ON app_settings FOR DELETE TO authenticated USING (
  is_super_admin() OR (organization_id = get_user_org_id() AND get_user_role() IN ('admin','manager'))
);

-- payroll_settings
CREATE POLICY payroll_settings_select ON payroll_settings FOR SELECT TO authenticated USING (
  is_super_admin() OR organization_id = get_user_org_id()
);
CREATE POLICY payroll_settings_insert ON payroll_settings FOR INSERT TO authenticated WITH CHECK (
  is_super_admin() OR (organization_id = get_user_org_id() AND get_user_role() IN ('admin','manager'))
);
CREATE POLICY payroll_settings_update ON payroll_settings FOR UPDATE TO authenticated USING (
  is_super_admin() OR (organization_id = get_user_org_id() AND get_user_role() IN ('admin','manager'))
);
CREATE POLICY payroll_settings_delete ON payroll_settings FOR DELETE TO authenticated USING (
  is_super_admin() OR (organization_id = get_user_org_id() AND get_user_role() IN ('admin','manager'))
);

-- contract_types (admin solo)
CREATE POLICY contract_types_select ON contract_types FOR SELECT TO authenticated USING (
  is_super_admin() OR organization_id = get_user_org_id()
);
CREATE POLICY contract_types_insert ON contract_types FOR INSERT TO authenticated WITH CHECK (
  is_super_admin() OR (organization_id = get_user_org_id() AND get_user_role() = 'admin')
);
CREATE POLICY contract_types_update ON contract_types FOR UPDATE TO authenticated USING (
  is_super_admin() OR (organization_id = get_user_org_id() AND get_user_role() = 'admin')
);
CREATE POLICY contract_types_delete ON contract_types FOR DELETE TO authenticated USING (
  is_super_admin() OR (organization_id = get_user_org_id() AND get_user_role() = 'admin')
);

-- contract_rest_rules
CREATE POLICY contract_rest_rules_select ON contract_rest_rules FOR SELECT TO authenticated USING (
  is_super_admin() OR organization_id = get_user_org_id()
);
CREATE POLICY contract_rest_rules_insert ON contract_rest_rules FOR INSERT TO authenticated WITH CHECK (
  is_super_admin() OR (organization_id = get_user_org_id() AND get_user_role() = 'admin')
);
CREATE POLICY contract_rest_rules_update ON contract_rest_rules FOR UPDATE TO authenticated USING (
  is_super_admin() OR (organization_id = get_user_org_id() AND get_user_role() = 'admin')
);
CREATE POLICY contract_rest_rules_delete ON contract_rest_rules FOR DELETE TO authenticated USING (
  is_super_admin() OR (organization_id = get_user_org_id() AND get_user_role() = 'admin')
);

-- employee_rest_rules
CREATE POLICY employee_rest_rules_select ON employee_rest_rules FOR SELECT TO authenticated USING (
  is_super_admin() OR organization_id = get_user_org_id()
);
CREATE POLICY employee_rest_rules_insert ON employee_rest_rules FOR INSERT TO authenticated WITH CHECK (
  is_super_admin() OR (organization_id = get_user_org_id() AND get_user_role() IN ('admin','manager'))
);
CREATE POLICY employee_rest_rules_update ON employee_rest_rules FOR UPDATE TO authenticated USING (
  is_super_admin() OR (organization_id = get_user_org_id() AND get_user_role() IN ('admin','manager'))
);
CREATE POLICY employee_rest_rules_delete ON employee_rest_rules FOR DELETE TO authenticated USING (
  is_super_admin() OR (organization_id = get_user_org_id() AND get_user_role() IN ('admin','manager'))
);

-- payroll_periods
CREATE POLICY payroll_periods_select ON payroll_periods FOR SELECT TO authenticated USING (
  is_super_admin() OR organization_id = get_user_org_id()
);
CREATE POLICY payroll_periods_insert ON payroll_periods FOR INSERT TO authenticated WITH CHECK (
  is_super_admin() OR (organization_id = get_user_org_id() AND get_user_role() IN ('admin','manager'))
);
CREATE POLICY payroll_periods_update ON payroll_periods FOR UPDATE TO authenticated USING (
  is_super_admin() OR (organization_id = get_user_org_id() AND get_user_role() IN ('admin','manager'))
);
CREATE POLICY payroll_periods_delete ON payroll_periods FOR DELETE TO authenticated USING (
  is_super_admin() OR (organization_id = get_user_org_id() AND get_user_role() IN ('admin','manager'))
);

-- payroll_entries (employee ve las suyas; admin todas del org)
CREATE POLICY payroll_entries_select ON payroll_entries FOR SELECT TO authenticated USING (
  is_super_admin() OR (organization_id = get_user_org_id() AND (employee_id = auth.uid() OR get_user_role() IN ('admin','manager')))
);
CREATE POLICY payroll_entries_insert ON payroll_entries FOR INSERT TO authenticated WITH CHECK (
  is_super_admin() OR (organization_id = get_user_org_id() AND get_user_role() IN ('admin','manager'))
);
CREATE POLICY payroll_entries_update ON payroll_entries FOR UPDATE TO authenticated USING (
  is_super_admin() OR (organization_id = get_user_org_id() AND get_user_role() IN ('admin','manager'))
);
CREATE POLICY payroll_entries_delete ON payroll_entries FOR DELETE TO authenticated USING (
  is_super_admin() OR (organization_id = get_user_org_id() AND get_user_role() IN ('admin','manager'))
);

-- salary_advances
CREATE POLICY salary_advances_select ON salary_advances FOR SELECT TO authenticated USING (
  is_super_admin() OR (organization_id = get_user_org_id() AND (employee_id = auth.uid() OR get_user_role() IN ('admin','manager')))
);
CREATE POLICY salary_advances_insert ON salary_advances FOR INSERT TO authenticated WITH CHECK (
  is_super_admin() OR (organization_id = get_user_org_id() AND get_user_role() IN ('admin','manager'))
);
CREATE POLICY salary_advances_update ON salary_advances FOR UPDATE TO authenticated USING (
  is_super_admin() OR (organization_id = get_user_org_id() AND get_user_role() IN ('admin','manager'))
);
CREATE POLICY salary_advances_delete ON salary_advances FOR DELETE TO authenticated USING (
  is_super_admin() OR (organization_id = get_user_org_id() AND get_user_role() IN ('admin','manager'))
);

-- salary_settlements
CREATE POLICY salary_settlements_select ON salary_settlements FOR SELECT TO authenticated USING (
  is_super_admin() OR (organization_id = get_user_org_id() AND (employee_id = auth.uid() OR get_user_role() IN ('admin','manager')))
);
CREATE POLICY salary_settlements_insert ON salary_settlements FOR INSERT TO authenticated WITH CHECK (
  is_super_admin() OR (organization_id = get_user_org_id() AND get_user_role() IN ('admin','manager'))
);
CREATE POLICY salary_settlements_update ON salary_settlements FOR UPDATE TO authenticated USING (
  is_super_admin() OR (organization_id = get_user_org_id() AND get_user_role() IN ('admin','manager'))
);
CREATE POLICY salary_settlements_delete ON salary_settlements FOR DELETE TO authenticated USING (
  is_super_admin() OR (organization_id = get_user_org_id() AND get_user_role() IN ('admin','manager'))
);

-- holidays (especial: nacionales con organization_id IS NULL visibles a todos del país)
CREATE POLICY holidays_select ON holidays FOR SELECT TO authenticated USING (
  is_super_admin()
  OR organization_id = get_user_org_id()
  OR (
    organization_id IS NULL
    AND country = (SELECT country FROM organizations WHERE id = get_user_org_id())
  )
);
-- INSERT: admin/manager solo pueden crear holidays per-sede de su org. Nacionales son sysadmin only.
CREATE POLICY holidays_insert ON holidays FOR INSERT TO authenticated WITH CHECK (
  is_super_admin()
  OR (organization_id = get_user_org_id() AND get_user_role() IN ('admin','manager'))
);
CREATE POLICY holidays_update ON holidays FOR UPDATE TO authenticated USING (
  is_super_admin()
  OR (organization_id = get_user_org_id() AND get_user_role() IN ('admin','manager'))
);
CREATE POLICY holidays_delete ON holidays FOR DELETE TO authenticated USING (
  is_super_admin()
  OR (organization_id = get_user_org_id() AND get_user_role() IN ('admin','manager'))
);

-- employee_equity_rollups (read-only desde RLS — trigger SECURITY DEFINER escribe)
CREATE POLICY employee_equity_rollups_select ON employee_equity_rollups FOR SELECT TO authenticated USING (
  is_super_admin()
  OR (organization_id = get_user_org_id() AND (employee_id = auth.uid() OR get_user_role() IN ('admin','manager')))
);
-- INSERT/UPDATE/DELETE solo via trigger (sin policies = bloqueado para authenticated)

-- employee_secondary_positions
CREATE POLICY employee_secondary_positions_select ON employee_secondary_positions FOR SELECT TO authenticated USING (
  is_super_admin() OR organization_id = get_user_org_id()
);
CREATE POLICY employee_secondary_positions_insert ON employee_secondary_positions FOR INSERT TO authenticated WITH CHECK (
  is_super_admin() OR (organization_id = get_user_org_id() AND get_user_role() IN ('admin','manager'))
);
CREATE POLICY employee_secondary_positions_update ON employee_secondary_positions FOR UPDATE TO authenticated USING (
  is_super_admin() OR (organization_id = get_user_org_id() AND get_user_role() IN ('admin','manager'))
);
CREATE POLICY employee_secondary_positions_delete ON employee_secondary_positions FOR DELETE TO authenticated USING (
  is_super_admin() OR (organization_id = get_user_org_id() AND get_user_role() IN ('admin','manager'))
);

-- ---------- demo_requests (NO recibe org_id — stays SaaS-wide) ----------
-- Policies existentes ya manejan anon INSERT + super_admin SELECT/UPDATE.
-- Aseguramos que la policy de SELECT incluya is_super_admin():

DROP POLICY IF EXISTS demo_requests_select_admin ON demo_requests;
CREATE POLICY demo_requests_select_admin ON demo_requests FOR SELECT TO authenticated USING (
  is_super_admin() OR get_user_role() IN ('admin','manager')
);
DROP POLICY IF EXISTS demo_requests_update_admin ON demo_requests;
CREATE POLICY demo_requests_update_admin ON demo_requests FOR UPDATE TO authenticated USING (
  is_super_admin() OR get_user_role() IN ('admin','manager')
) WITH CHECK (
  is_super_admin() OR get_user_role() IN ('admin','manager')
);
```

### Task 14: Promover suv411@hotmail.com a super_admin

- [ ] **Step 14.1: Reemplazar sección 12**

```sql
-- =============================================================================
-- 12. Promover suv411@hotmail.com a super_admin
-- =============================================================================
-- IMPORTANTE: este UPDATE rompe el CHECK profiles_org_required si no se hace
-- después de la migración base. Por eso va aquí, después de los constraints.
-- super_admin → organization_id NULL (constraint permite NULL solo para este rol).

UPDATE profiles
  SET role = 'super_admin',
      organization_id = NULL
  WHERE email = 'suv411@hotmail.com';
```

### Task 15: Verificación inline + commit migration

- [ ] **Step 15.1: Reemplazar sección 13**

```sql
-- =============================================================================
-- 13. Verificación inline
-- =============================================================================
DO $$
DECLARE
  org_count INT;
  super_admin_count INT;
  orphan_count INT;
  les_raptors_id UUID := '00000000-0000-0000-0000-000000000001';
  les_raptors_data_count INT;
BEGIN
  -- 1 org existe (Les Raptors)
  SELECT COUNT(*) INTO org_count FROM organizations;
  ASSERT org_count = 1, format('Expected 1 organization, got %s', org_count);

  -- Al menos 1 super_admin
  SELECT COUNT(*) INTO super_admin_count FROM profiles WHERE role = 'super_admin';
  ASSERT super_admin_count >= 1, format('Expected >= 1 super_admin, got %s', super_admin_count);

  -- No profiles huérfanos (role != super_admin sin org_id)
  SELECT COUNT(*) INTO orphan_count FROM profiles
    WHERE role != 'super_admin' AND organization_id IS NULL;
  ASSERT orphan_count = 0, format('Expected 0 orphan profiles, got %s', orphan_count);

  -- Backfill funcionó: locations todos en Les Raptors
  SELECT COUNT(*) INTO les_raptors_data_count FROM locations
    WHERE organization_id = les_raptors_id;
  ASSERT les_raptors_data_count > 0, 'Expected at least 1 location for Les Raptors';

  RAISE NOTICE 'Verification passed: % orgs, % super_admins, % orphans, % Les Raptors locations',
    org_count, super_admin_count, orphan_count, les_raptors_data_count;
END $$;
```

- [ ] **Step 15.2: Verificar archivo completo (revisión visual)**

```bash
wc -l supabase/migrations/039_multi_tenant.sql
```

Expected: ~600-800 líneas. Si está bajo 400, falta contenido. Si está sobre 1000, revisar duplicados.

- [ ] **Step 15.3: Commit migration completa**

```bash
git add supabase/migrations/039_multi_tenant.sql
git commit -m "$(cat <<'EOF'
feat(db): migration 039 — multi-tenant data model (build, no apply yet)

Migration completa lista para aplicar:
- organizations table + Les Raptors row (UUID fijo)
- Helpers: get_user_org_id, is_super_admin, slugify, suggest_unique_slug
- organization_id NOT NULL en 24 tablas + FKs ON DELETE RESTRICT
- profiles.role extendido con super_admin (con CHECK constraint que enforce NULL)
- holidays.country TEXT NOT NULL DEFAULT 'CO' + RLS country-match
- ~80 RLS policies reescritas con patrón universal:
    USING (is_super_admin() OR organization_id = get_user_org_id())
- Promueve suv411@hotmail.com a super_admin
- Verificación inline con ASSERT

Aún NO aplicada a Supabase Cloud. Apply en task siguiente.

Spec: docs/superpowers/specs/2026-05-20-multi-tenant-data-model.md

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Phase C: SQL isolation test

### Task 16: Crear test de aislamiento cross-tenant

**Files:**
- Create: `supabase/tests/multi_tenant_isolation_test.sql`

- [ ] **Step 16.1: Crear archivo de test**

Crear `supabase/tests/multi_tenant_isolation_test.sql`:

```sql
-- =============================================================================
-- Test: aislamiento cross-tenant multi-tenant model
-- Ejecutar DESPUÉS de aplicar migration 039.
-- Pattern: BEGIN ... ROLLBACK para no ensuciar prod.
-- =============================================================================

BEGIN;

-- Setup: crear segunda org de prueba
INSERT INTO organizations (id, name, slug, plan, status, country, timezone)
VALUES ('00000000-0000-0000-0000-000000000099', 'Test Org B', 'test-org-b', 'starter', 'active', 'CO', 'America/Bogota');

-- Crear usuarios falsos (sin auth.users — bypass via service_role para el test)
-- NOTA: este test asume que SE EJECUTA con service_role (Supabase MCP usa service_role).
-- Los profiles_insert WITH CHECK (false) lo bloquearía para authenticated.

INSERT INTO profiles (id, email, full_name, role, organization_id, is_active) VALUES
  ('11111111-1111-1111-1111-111111111111', 'admin-a@test.com', 'Admin A', 'admin', '00000000-0000-0000-0000-000000000001', true),
  ('22222222-2222-2222-2222-222222222222', 'admin-b@test.com', 'Admin B', 'admin', '00000000-0000-0000-0000-000000000099', true);

-- Crear datos en cada org
INSERT INTO locations (id, organization_id, name) VALUES
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '00000000-0000-0000-0000-000000000001', 'Sede A1'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '00000000-0000-0000-0000-000000000099', 'Sede B1');

-- =============================================================================
-- Test 1: admin-a NO debe ver locations de Org B
-- =============================================================================
SET LOCAL role authenticated;
SET LOCAL "request.jwt.claim.sub" TO '11111111-1111-1111-1111-111111111111';

DO $$
DECLARE
  cross_tenant_count INT;
BEGIN
  SELECT COUNT(*) INTO cross_tenant_count FROM locations
    WHERE organization_id = '00000000-0000-0000-0000-000000000099';
  ASSERT cross_tenant_count = 0,
    format('TEST 1 FAILED: admin-a saw % rows of Org B locations', cross_tenant_count);
  RAISE NOTICE 'TEST 1 PASSED: admin-a sees 0 rows of Org B';
END $$;

-- =============================================================================
-- Test 2: admin-a NO puede INSERT en Org B
-- =============================================================================
DO $$
DECLARE
  insert_failed BOOLEAN := false;
BEGIN
  BEGIN
    INSERT INTO locations (organization_id, name) VALUES
      ('00000000-0000-0000-0000-000000000099', 'Hack Sede');
  EXCEPTION WHEN insufficient_privilege OR check_violation OR others THEN
    insert_failed := true;
  END;
  ASSERT insert_failed = true, 'TEST 2 FAILED: admin-a was able to INSERT in Org B';
  RAISE NOTICE 'TEST 2 PASSED: admin-a INSERT in Org B was blocked';
END $$;

-- =============================================================================
-- Test 3: admin-a SÍ ve sus propios datos (Org A)
-- =============================================================================
DO $$
DECLARE
  own_count INT;
BEGIN
  SELECT COUNT(*) INTO own_count FROM locations
    WHERE organization_id = '00000000-0000-0000-0000-000000000001';
  ASSERT own_count >= 1, format('TEST 3 FAILED: admin-a sees % rows of Org A (expected >= 1)', own_count);
  RAISE NOTICE 'TEST 3 PASSED: admin-a sees % rows of Org A', own_count;
END $$;

-- =============================================================================
-- Test 4: super_admin ve TODO
-- =============================================================================
-- Crear super_admin fake
INSERT INTO profiles (id, email, full_name, role, organization_id, is_active)
  VALUES ('33333333-3333-3333-3333-333333333333', 'super@saas.com', 'Super', 'super_admin', NULL, true);

SET LOCAL "request.jwt.claim.sub" TO '33333333-3333-3333-3333-333333333333';

DO $$
DECLARE
  total_orgs INT;
BEGIN
  SELECT COUNT(DISTINCT organization_id) INTO total_orgs FROM locations;
  ASSERT total_orgs >= 2, format('TEST 4 FAILED: super_admin sees only % orgs (expected >= 2)', total_orgs);
  RAISE NOTICE 'TEST 4 PASSED: super_admin sees % orgs', total_orgs;
END $$;

-- =============================================================================
-- Test 5: holidays nacionales visibles a admin-a (CO country)
-- =============================================================================
SET LOCAL "request.jwt.claim.sub" TO '11111111-1111-1111-1111-111111111111';

DO $$
DECLARE
  national_count INT;
BEGIN
  SELECT COUNT(*) INTO national_count FROM holidays
    WHERE organization_id IS NULL AND country = 'CO';
  ASSERT national_count > 0,
    format('TEST 5 FAILED: admin-a sees % national CO holidays (expected > 0)', national_count);
  RAISE NOTICE 'TEST 5 PASSED: admin-a sees % national CO holidays', national_count;
END $$;

-- =============================================================================
-- Test 6: admin-a NO puede modificar holidays nacionales
-- =============================================================================
DO $$
DECLARE
  update_blocked BOOLEAN := false;
  affected_rows INT := 0;
BEGIN
  UPDATE holidays SET name = 'HACKED' WHERE organization_id IS NULL;
  GET DIAGNOSTICS affected_rows = ROW_COUNT;
  -- Si RLS UPDATE policy bloquea: affected_rows = 0 (silent skip)
  ASSERT affected_rows = 0,
    format('TEST 6 FAILED: admin-a updated % national holidays', affected_rows);
  RAISE NOTICE 'TEST 6 PASSED: admin-a UPDATE national holidays blocked (% rows affected)', affected_rows;
END $$;

-- =============================================================================
-- Test 7: helper get_user_org_id() retorna el correcto
-- =============================================================================
SET LOCAL "request.jwt.claim.sub" TO '11111111-1111-1111-1111-111111111111';
DO $$
DECLARE
  resolved_org UUID;
BEGIN
  SELECT public.get_user_org_id() INTO resolved_org;
  ASSERT resolved_org = '00000000-0000-0000-0000-000000000001',
    format('TEST 7 FAILED: get_user_org_id returned %', resolved_org);
  RAISE NOTICE 'TEST 7 PASSED: get_user_org_id() = %', resolved_org;
END $$;

-- =============================================================================
-- Test 8: helper is_super_admin() funciona
-- =============================================================================
SET LOCAL "request.jwt.claim.sub" TO '33333333-3333-3333-3333-333333333333';
DO $$
DECLARE
  is_super BOOLEAN;
BEGIN
  SELECT public.is_super_admin() INTO is_super;
  ASSERT is_super = true, 'TEST 8 FAILED: is_super_admin returned false for super_admin';
  RAISE NOTICE 'TEST 8 PASSED: is_super_admin() = true for super';
END $$;

SET LOCAL "request.jwt.claim.sub" TO '11111111-1111-1111-1111-111111111111';
DO $$
DECLARE
  is_super BOOLEAN;
BEGIN
  SELECT public.is_super_admin() INTO is_super;
  ASSERT is_super = false, 'TEST 8b FAILED: is_super_admin returned true for admin';
  RAISE NOTICE 'TEST 8b PASSED: is_super_admin() = false for admin';
END $$;

ROLLBACK;

-- Si llegaste acá sin EXCEPTION, todos los tests pasaron.
SELECT 'All 8 isolation tests PASSED' AS result;
```

- [ ] **Step 16.2: Commit test (no ejecutar todavía — la migración aún no se aplicó)**

```bash
git add supabase/tests/multi_tenant_isolation_test.sql
git commit -m "$(cat <<'EOF'
test(db): SQL isolation tests para multi-tenant model

8 escenarios:
1. admin-a NO ve datos de Org B
2. admin-a NO puede INSERT en Org B
3. admin-a SÍ ve datos de Org A
4. super_admin ve TODO
5. holidays nacionales (org_id IS NULL) visibles a admin del país
6. admin-a NO puede UPDATE holidays nacionales
7. get_user_org_id() retorna org correcto
8. is_super_admin() funciona para ambos roles

Pattern BEGIN/ROLLBACK — seguro contra prod.
Ejecutar DESPUÉS de aplicar migration 039.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Phase D: Aplicar migración + regenerar types

### Task 17: Aplicar migración 039 a Supabase Cloud

✅ **PRE-AUTORIZADO por el usuario el 2026-05-20** (ver memory `feedback-subproy3-apply-authorization`). El agente procede sin checkpoint manual.

- [ ] **Step 17.1: Verificar backup automático disponible**

Verificar en Supabase dashboard → Database → Backups que existe snapshot automático reciente (Daily Backups del plan Pro). No requiere snapshot manual nuevo — el rollback automático del BEGIN/COMMIT + el backup diario son safety net suficiente.

- [ ] **Step 17.2: Push branch a remoto para safety**

```bash
git push -u origin feature/sub-proyecto-3-multi-tenant
```

- [ ] **Step 17.3: Aplicar migración via MCP**

Usar MCP `mcp__plugin_supabase_supabase__apply_migration` con:
- `name`: `multi_tenant`
- `query`: contenido completo de `supabase/migrations/039_multi_tenant.sql` (sin el `BEGIN;` ni `COMMIT;` si el MCP lo envuelve solo — verificar; si lo necesita, incluir tal cual)

Expected output del NOTICE final: `Verification passed: 1 orgs, 1 super_admins, 0 orphans, N Les Raptors locations` (N > 0).

Si falla: el `BEGIN/COMMIT` interno garantiza rollback automático. Investigar el error y ajustar la migración. NO continuar a Task 18 hasta que apply pase.

- [ ] **Step 17.4: Verificar via execute_sql que organizations existe**

Usar MCP `mcp__plugin_supabase_supabase__execute_sql`:

```sql
SELECT id, name, slug, status FROM organizations;
```

Expected: 1 row con `name='Les Raptors', slug='les-raptors', status='active'`.

```sql
SELECT role, organization_id FROM profiles WHERE email = 'suv411@hotmail.com';
```

Expected: `role='super_admin', organization_id=NULL`.

```sql
SELECT COUNT(*) FROM locations WHERE organization_id IS NOT NULL;
```

Expected: > 0 (todos los locations existentes ahora tienen el UUID de Les Raptors).

### Task 18: Correr isolation test en prod

- [ ] **Step 18.1: Ejecutar test SQL**

Usar MCP `mcp__plugin_supabase_supabase__execute_sql` con el contenido de `supabase/tests/multi_tenant_isolation_test.sql`.

Expected: salida termina con `All 8 isolation tests PASSED`.

Si algún ASSERT falla → RLS está mal escrita. Investigar y corregir con migración 040.

### Task 19: Regenerar database.types.ts

- [ ] **Step 19.1: Regenerar types via MCP**

Usar MCP `mcp__plugin_supabase_supabase__generate_typescript_types` para project `ugkvuinkynvtuiutwlkd`.

Reemplazar contenido completo de `src/lib/supabase/database.types.ts` con la respuesta.

- [ ] **Step 19.2: Build verifica que los types compilan**

```bash
npm run build
```

Expected: `✓ Compiled successfully`. Si hay errores de tipos (algún query usa `organization_id` que ahora es required en INSERTs), arreglar.

- [ ] **Step 19.3: Commit**

```bash
git add src/lib/supabase/database.types.ts
git commit -m "$(cat <<'EOF'
chore(types): regenerar database.types.ts post migration 039

Tipos actualizados con:
- organizations table
- organization_id en 24 tablas
- holidays.country TEXT
- super_admin en profiles.role enum

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Phase E: Auth trigger update

### Task 20: Actualizar handle_new_user trigger

**Files:**
- Create: `supabase/migrations/040_auth_trigger_org_metadata.sql`

- [ ] **Step 20.1: Crear migration**

Crear `supabase/migrations/040_auth_trigger_org_metadata.sql`:

```sql
-- =============================================================================
-- Migration 040 — auth trigger lee organization_id de user_metadata
-- Prep para sub-proy 4 (/signup) — el endpoint signup pasa organization_id
-- en raw_user_meta_data al crear el auth.users row.
-- =============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  meta_org_id UUID;
  meta_role TEXT;
  meta_full_name TEXT;
BEGIN
  -- Leer metadata pasada en supabase.auth.admin.createUser({ user_metadata: {...} })
  meta_org_id := (NEW.raw_user_meta_data->>'organization_id')::UUID;
  meta_role := COALESCE(NEW.raw_user_meta_data->>'role', 'employee');
  meta_full_name := COALESCE(NEW.raw_user_meta_data->>'full_name', '');

  -- Validar: si role != super_admin, org_id es required
  IF meta_role != 'super_admin' AND meta_org_id IS NULL THEN
    RAISE EXCEPTION 'organization_id is required in user_metadata for role %', meta_role;
  END IF;

  INSERT INTO public.profiles (id, email, full_name, role, organization_id)
  VALUES (NEW.id, NEW.email, meta_full_name, meta_role, meta_org_id);

  RETURN NEW;
END;
$$;

-- Trigger se mantiene (ya existe), solo se actualiza la función
-- DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
-- CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users
--   FOR EACH ROW EXECUTE FUNCTION handle_new_user();

COMMIT;
```

- [ ] **Step 20.2: Aplicar migration**

Usar MCP `mcp__plugin_supabase_supabase__apply_migration` con name `auth_trigger_org_metadata`.

- [ ] **Step 20.3: Smoke test**

Ejecutar via execute_sql:

```sql
-- No vamos a crear un auth.users de verdad (afectaría Auth real).
-- Solo verificamos que la función existe y tiene el body actualizado.
SELECT pg_get_functiondef('public.handle_new_user'::regproc);
```

Expected: la definición contiene `meta_org_id` y `RAISE EXCEPTION 'organization_id is required'`.

- [ ] **Step 20.4: Commit**

```bash
git add supabase/migrations/040_auth_trigger_org_metadata.sql
git commit -m "$(cat <<'EOF'
feat(db): auth trigger lee organization_id de user_metadata

handle_new_user actualizado para leer:
- raw_user_meta_data.organization_id (required excepto super_admin)
- raw_user_meta_data.role (default 'employee')
- raw_user_meta_data.full_name

Prep para sub-proy 4 (/signup) y para que /api/employees/invite pueda
asignar el org correcto al invitar.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Phase F: Refactor 5 API routes

### Task 21: Refactor `/api/employees/invite` con assertSameOrg + fix URL

**Files:**
- Modify: `src/app/api/employees/invite/route.ts`

- [ ] **Step 21.1: Leer estado actual**

```bash
cat src/app/api/employees/invite/route.ts
```

Anotar las líneas que tocan: el handler POST, la creación del auth.users, el redirectTo hardcodeado (línea ~49 según CLAUDE.md).

- [ ] **Step 21.2: Aplicar refactor**

Reemplazar el contenido de `src/app/api/employees/invite/route.ts` para:

1. Importar helpers: `import { getCallerContext, assertSameOrg } from '@/lib/auth/assert-same-org';`
2. Al inicio del handler POST:
   ```typescript
   const supabase = createServerClient(...);  // (cookie-based)
   const { orgId, isSuperAdmin } = await getCallerContext(supabase);
   ```
3. Para CADA recurso recibido en el body (location_id, contract_type_id, position_id, etc.), llamar `assertSameOrg(admin, orgId, value, 'locations' | ...)`.
4. Al crear el auth user via `admin.auth.admin.inviteUserByEmail`, pasar:
   ```typescript
   {
     data: {
       organization_id: orgId,
       role: 'employee',
       full_name: body.full_name,
     },
     redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL || 'https://www.tushorarios.com'}/auth/set-password`,
   }
   ```

El UUID hardcoded `https://app-horarios-mauve.vercel.app` se reemplaza por el env var.

- [ ] **Step 21.3: Agregar NEXT_PUBLIC_SITE_URL a env.example**

Editar `.env.example` agregando:

```
NEXT_PUBLIC_SITE_URL=https://www.tushorarios.com
```

- [ ] **Step 21.4: Build verifica tipos**

```bash
npm run build
```

Expected: pass.

- [ ] **Step 21.5: Commit**

```bash
git add src/app/api/employees/invite/route.ts .env.example
git commit -m "$(cat <<'EOF'
feat(api): /api/employees/invite usa assertSameOrg + fix hardcoded URL

- getCallerContext resuelve orgId del caller
- assertSameOrg valida location_id/contract_type_id/position_id antes de Auth.admin.invite
- inviteUserByEmail pasa organization_id en user_metadata → auth trigger lo escribe en profile
- redirectTo: NEXT_PUBLIC_SITE_URL (default https://www.tushorarios.com)
- Sub-proy 5 lo cambiará a per-org subdomain

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

### Task 22: Refactor `/api/employees/demo`

**Files:**
- Modify: `src/app/api/employees/demo/route.ts`

- [ ] **Step 22.1: Aplicar refactor**

Patrón idéntico a Task 21 pero sin Auth (los demos no tienen auth.users):
1. `getCallerContext` → orgId
2. `assertSameOrg` para cada ID en body
3. Inyectar `organization_id: orgId` en el INSERT

- [ ] **Step 22.2: Build + commit**

```bash
npm run build
git add src/app/api/employees/demo/route.ts
git commit -m "feat(api): /api/employees/demo usa assertSameOrg

- assertSameOrg valida contract_type_id, position_id, location_id pertenecen al caller org
- Insert con organization_id explícito

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

### Task 23: Refactor `/api/employees/demo/transfer`

**Files:**
- Modify: `src/app/api/employees/demo/transfer/route.ts`

- [ ] **Step 23.1: Aplicar refactor**

Importante: validar que BOTH `from_employee_id` (demo) y `to_employee_id` (real) pertenecen al MISMO org del caller.

```typescript
const { orgId } = await getCallerContext(supabase);
await assertSameOrg(admin, orgId, body.from_employee_id, 'profiles');
await assertSameOrg(admin, orgId, body.to_employee_id, 'profiles');
// luego transferir shifts
```

- [ ] **Step 23.2: Build + commit**

```bash
npm run build
git add src/app/api/employees/demo/transfer/route.ts
git commit -m "feat(api): /api/employees/demo/transfer assertSameOrg en ambos employee IDs

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

### Task 24: Reforzar RPC `approve_shift_swap` con org check interno

**Files:**
- Create: `supabase/migrations/041_rpc_org_checks.sql`

- [ ] **Step 24.1: Crear migration que actualiza la RPC**

```sql
-- =============================================================================
-- Migration 041 — Reforzar RPCs con org check interno
-- approve_shift_swap y convert_demo_to_real verifican que el caller pertenece
-- al mismo org que el recurso antes de mutar.
-- =============================================================================

BEGIN;

-- Reemplazar approve_shift_swap (asume signature actual; ajustar si difiere)
CREATE OR REPLACE FUNCTION public.approve_shift_swap(p_swap_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  swap_org UUID;
  caller_org UUID;
BEGIN
  SELECT organization_id INTO swap_org FROM shift_swap_requests WHERE id = p_swap_id;
  IF swap_org IS NULL THEN
    RAISE EXCEPTION 'Shift swap not found' USING ERRCODE = 'no_data_found';
  END IF;

  caller_org := get_user_org_id();
  IF NOT is_super_admin() AND swap_org != caller_org THEN
    RAISE EXCEPTION 'Forbidden: cross-tenant access' USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- (lógica existente de approve_shift_swap aquí — copiar de la versión actual)
  -- Buscar la versión actual con: SELECT pg_get_functiondef('approve_shift_swap'::regproc);
  -- Y reproducir el cuerpo después del check.
END;
$$;

-- Reemplazar convert_demo_to_real (mismo patrón)
CREATE OR REPLACE FUNCTION public.convert_demo_to_real(
  p_demo_profile_id UUID,
  p_email TEXT,
  p_send_invite BOOLEAN DEFAULT true
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  demo_org UUID;
  caller_org UUID;
BEGIN
  SELECT organization_id INTO demo_org FROM profiles WHERE id = p_demo_profile_id AND is_demo = true;
  IF demo_org IS NULL THEN
    RAISE EXCEPTION 'Demo profile not found' USING ERRCODE = 'no_data_found';
  END IF;

  caller_org := get_user_org_id();
  IF NOT is_super_admin() AND demo_org != caller_org THEN
    RAISE EXCEPTION 'Forbidden: cross-tenant access' USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- (lógica existente de convert_demo_to_real — copiar)
END;
$$;

COMMIT;
```

> **NOTA IMPORTANTE:** antes de aplicar 041, sacar las versiones actuales de las RPCs vía:
>
> ```sql
> SELECT pg_get_functiondef('public.approve_shift_swap'::regproc);
> SELECT pg_get_functiondef('public.convert_demo_to_real'::regproc);
> ```
>
> Copiar el cuerpo existente DESPUÉS del check de org. La migration 041 debe contener el código COMPLETO, no solo el header.

- [ ] **Step 24.2: Aplicar migration via MCP**

- [ ] **Step 24.3: Smoke test manual**

Como admin Les Raptors logueado, intentar approve un swap real → debe funcionar.
Como admin Les Raptors, ejecutar SQL `SELECT approve_shift_swap('<uuid-de-otra-org>')` → debe fallar con `insufficient_privilege`.

- [ ] **Step 24.4: Commit**

```bash
git add supabase/migrations/041_rpc_org_checks.sql
git commit -m "feat(db): RPCs approve_shift_swap + convert_demo_to_real con org check interno

Defense in depth: aunque las API routes pasan por RLS, los RPCs SECURITY DEFINER
también verifican que caller_org_id == resource.organization_id (o super_admin).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Phase G: Verification + PR

### Task 25: Verificación end-to-end

- [ ] **Step 25.1: Build pasa**

```bash
npm run build
```

Expected: `✓ Compiled successfully`.

- [ ] **Step 25.2: Todos los tests pasan**

```bash
npm run test
```

Expected: `Tests  298 passed (298)` (293 originales + 5 nuevos de assertSameOrg).

- [ ] **Step 25.3: Lint**

```bash
npm run lint
```

Expected: sin warnings nuevos.

- [ ] **Step 25.4: Manual E2E checklist (login como admin Les Raptors)**

Login en https://www.tushorarios.com/login con credenciales admin Les Raptors.

Verificar:
- [ ] `/dashboard` carga sin errores, muestra stats
- [ ] `/schedule` muestra borrador del mes actual, podés editar una celda y guardar
- [ ] `/employees` lista empleados con su contract_type
- [ ] Crear demo employee → aparece con badge "Demo"
- [ ] Borrar demo employee → cascada de schedule_entries
- [ ] `/requests` muestra solicitudes pendientes
- [ ] Aprobar una ausencia → cambia estado
- [ ] `/notifications` muestra notificaciones recientes
- [ ] `/nomina/periodos` carga períodos
- [ ] `/nomina/ausencias` carga ausencias
- [ ] `/settings` carga configuración (scoring_weights del org)
- [ ] `/holidays` muestra festivos nacionales + por sede
- [ ] `/locations`, `/departments`, `/positions`, `/shifts`, `/staffing` cargan
- [ ] `/contract-types` accesible (admin only) y muestra los 4 presets + custom

- [ ] **Step 25.5: Manual E2E checklist (super_admin)**

Login con tu cuenta `suv411@hotmail.com` (ahora super_admin).

Verificar:
- [ ] Las páginas siguen cargando (porque RLS te deja ver todo)
- [ ] SQL test via Supabase MCP: `SELECT COUNT(DISTINCT organization_id) FROM locations` → debería ser >= 1 (solo Les Raptors por ahora)
- [ ] Crear una org fake via SQL: `INSERT INTO organizations (name, slug) VALUES ('Test', 'test-2')` → debería funcionar (super_admin policy permite)
- [ ] Borrar la org fake: `DELETE FROM organizations WHERE slug = 'test-2'` → debería funcionar

- [ ] **Step 25.6: Realtime subscriptions**

Verificar que las notificaciones siguen funcionando en realtime. Login como admin Les Raptors, abrir 2 pestañas, generar una notif via Supabase MCP, verificar que aparece en ambas pestañas en tiempo real.

### Task 26: Push branch + PR

- [ ] **Step 26.1: Push**

```bash
git push -u origin feature/sub-proyecto-3-multi-tenant
```

- [ ] **Step 26.2: Crear PR**

```bash
gh pr create --base main \
  --title "feat: multi-tenant data model (sub-proyecto 3)" \
  --body "$(cat <<'EOF'
## Summary

Refactor de single-tenant a multi-tenant. Spec: \`docs/superpowers/specs/2026-05-20-multi-tenant-data-model.md\`.

- Tabla \`organizations\` (tenants)
- \`organization_id NOT NULL\` en 24 tablas
- Helpers SQL: \`get_user_org_id()\`, \`is_super_admin()\`, \`slugify()\`, \`suggest_unique_slug()\`
- ~80 RLS policies reescritas con patrón universal
- Rol \`super_admin\` con bypass RLS
- Helper TS \`assertSameOrg()\` + 5 Vitest tests
- 5 API routes refactor con estrategia híbrida (RPCs SECURITY DEFINER + TS routes con assertSameOrg)
- Bug fix: hardcoded URL en \`/api/employees/invite\` → \`NEXT_PUBLIC_SITE_URL\`
- \`holidays.country\` column + RLS country-match (multi-país prep)
- \`suv411@hotmail.com\` promovido a super_admin

## Migrations aplicadas

- 039: multi-tenant base
- 040: auth trigger reads organization_id from user_metadata
- 041: RPCs (approve_shift_swap, convert_demo_to_real) con org check interno

## Test plan

- [x] \`npm run build\` pasa
- [x] \`npm run test\` 298/298 verdes
- [x] SQL isolation test: 8/8 escenarios PASSED
- [x] Manual E2E admin Les Raptors: dashboard/schedule/employees/requests/nomina/settings OK
- [x] Manual E2E super_admin: cross-tenant ops OK
- [x] Realtime notifications siguen funcionando

## Próximo sub-proyecto

Sub-proy 4: \`/signup\` público + onboarding wizard.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 26.3: Documentar resultado**

PR URL en project memory.

---

## Self-Review Checklist (al finalizar)

- [ ] Build pasa
- [ ] 298 tests verdes
- [ ] SQL isolation test 8/8 PASSED
- [ ] Manual E2E completo (Step 25.4 + 25.5)
- [ ] Migrations 039, 040, 041 aplicadas a Supabase Cloud
- [ ] PR abierta, link guardado
- [ ] Plan marcado como completado en `docs/superpowers/plans/`
- [ ] Memory actualizado con HEAD final y URL del PR

---

## Rollback (si algo sale mal post-merge)

Ver `docs/superpowers/specs/2026-05-20-multi-tenant-data-model.md` §10.

Resumen:
- Si falla durante apply → BEGIN/COMMIT rollback automático
- Si pasa apply pero falla manual E2E → restore desde backup Supabase pre-039
- Si bug menor → migration 042+ que patchea sin tocar el resto

---

## Notas para el ejecutor

1. **Antes de cada Phase**, considerar invocar `superpowers:subagent-driven-development` para correr la fase con un subagente independiente.
2. **Antes de aplicar la migración 039 a prod** (Task 17), pedirle al usuario confirmación explícita.
3. **Si encontrás una tabla que el plan no lista** (algún `app_audit_log` o similar que apareció post-spec), agregala al ALTER/UPDATE/RLS antes de aplicar 039. Editá la migración, no la apliques con tablas faltantes.
4. **RPCs en Task 24:** copia el cuerpo existente vía `pg_get_functiondef` ANTES de escribir 041. No improvises el contenido — el código de business logic existente debe preservarse.
5. **Modern-web-guidance:** no aplica a este plan (no hay UI). Si en algún momento agregás un component nuevo (ej. botón "Cambiar org"), invocá la skill antes.
