# Spec — Sub-proyecto 3: Multi-tenant data model

**Fecha:** 2026-05-20
**Estado:** APROBADO — pendiente plan de implementación
**Branch base:** `main` (HEAD `bfe10ca`)
**Predecesores:** sub-proyecto 1 (email infra) + sub-proyecto 2 (landing) + polish modern-web-compliance
**Sucesores:** sub-proyecto 4 (signup público), sub-proyecto 5 (subdomain routing), sub-proyecto 6 (billing), sub-proyecto 7 (dashboard super-admin)

## 1. Contexto y motivación

App Horarios hoy es funcionalmente **single-tenant**: los datos en producción son de Les Raptors (tu propio equipo, sirve como caso de prueba real). El landing en `https://www.tushorarios.com` ya está capturando leads B2B. Para convertir al primer cliente externo necesitamos que la base de datos garantice aislamiento de datos entre clientes (multi-tenant).

**Riesgo si no se hace antes de signup público:** un bug de RLS o una API route mal escrita expone datos cross-tenant. Es el bug más caro que puede pasar en SaaS (pérdida de confianza, problemas legales LGPD/GDPR equivalentes locales).

**Por qué AHORA:** el landing ya está vivo. Cualquier lead que llegue mañana no tiene dónde aterrizar como cliente aislado.

## 2. Scope

### IN
- Tabla `organizations` (tenants)
- Columna `organization_id NOT NULL` en 24 tablas existentes
- Helpers SQL: `get_user_org_id()`, `is_super_admin()`
- Reescritura de TODAS las RLS policies con patrón universal
- Rol nuevo `super_admin` en `profiles.role`
- Helper TS `assertSameOrg()` para API routes
- Refactor de 5 API routes con service_role para validar org_id
- Bug fix: hardcoded URL en `/api/employees/invite`
- Migración atómica de Les Raptors como primer org
- SQL test de aislamiento cross-tenant
- Vitest para `assertSameOrg`

### OUT (próximos sub-proyectos)
- `/signup` público + onboarding wizard → **sub-proy 4**
- Subdomain routing `acme.tushorarios.com` → **sub-proy 5**
- Billing (Wompi/Bold/Stripe) → **sub-proy 6**
- Dashboard `/super-admin` con KPIs → **sub-proy 7**
- Branding aplicado en UI (logo_url, primary_color leídos en runtime) → **sub-proy 8**
- Cambios de UI en general

## 3. Decisiones tomadas en brainstorming

| # | Decisión | Elección | Razón |
|---|---|---|---|
| 1 | Profile model | **1:1** (`profiles.organization_id NOT NULL`) | ICP B2B colombiano gestiona UNA empresa. 99% del mercado. Migración a junction después es factible. |
| 2 | Estrategia de migración | **Big bang atómico** (BEGIN/COMMIT) | Solo-dev + Les Raptors = propio equipo. Downtime ~15min sin impacto. Atomicidad imposible de quebrar. |
| 3 | Singletons (`app_settings`, `payroll_settings`) | **Agregar `organization_id` a tablas existentes** | Mínimo cambio. Mismo código de R/W con filtro extra. |
| 4 | Super-admin | **Rol `super_admin` en profiles con bypass RLS** vía `is_super_admin()` | Trabajás dentro del mismo sistema. OR en cada policy. Dashboard se posterga a sub-proy 7. |
| 5 | Shape de `organizations` | Ver §4 | Campos cubren identidad + clasificación + lifecycle + branding. |
| 6 | Cross-tenant protection | **Híbrido (Opción C)** | RPCs SECURITY DEFINER para data ops, TS routes con `assertSameOrg` para Auth ops. |

## 4. Schema design

### 4.1 Tabla `organizations`

```sql
CREATE TABLE organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Identidad
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  legal_name TEXT,
  nit TEXT,

  -- Clasificación
  industry TEXT CHECK (industry IN ('salud','retail','hoteleria','vigilancia','otro')),
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
CREATE INDEX organizations_slug_idx ON organizations(slug);

-- Trigger updated_at
CREATE TRIGGER organizations_updated_at_trigger
  BEFORE UPDATE ON organizations
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
```

### 4.2 Estrategia de slug

- Auto-derivar del `name` con `slugify()`: lowercase, ASCII (sin tildes), kebab-case.
- Si colisiona, agregar sufijo numérico: `hospital-san-jose` → `hospital-san-jose-2`.
- Función SQL `slugify(text)` + RPC `suggest_unique_slug(name TEXT) RETURNS TEXT`.
- Sub-proy 4 (signup) usará esta RPC con preview en UI + opción de editar.
- En esta migración: Les Raptors → slug `les-raptors` hardcodeado.

### 4.3 Columnas `organization_id` en tablas existentes

**Las 24 tablas que reciben `organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT`:**

Core scheduling (9):
1. `locations`
2. `departments`
3. `positions`
4. `profiles`
5. `shift_templates`
6. `schedules`
7. `schedule_entries`
8. `staffing_requirements`
9. `staffing_audit`

Requests / workflow (3):
10. `time_off_requests`
11. `shift_swap_requests`
12. `notifications`

Configuración (5):
13. `app_settings`
14. `payroll_settings`
15. `contract_types`
16. `contract_rest_rules`
17. `employee_rest_rules`

Nómina (4):
18. `payroll_periods`
19. `payroll_entries`
20. `salary_advances`
21. `salary_settlements`

Equity / calendar (2):
22. `holidays` (las per-sede; nacionales se quedan con `organization_id IS NULL` — ver §4.4)
23. `employee_equity_rollups`

Junctions (1):
24. `employee_secondary_positions`

**Excepciones (NO reciben org_id):**

- `organizations` — es la tabla maestra de tenants, no se filtra a sí misma (sí tiene RLS, ver §6).
- `demo_requests` — leads del landing, viven a nivel SaaS para que vos como super_admin las gestiones. Mantienen RLS anon-INSERT + super_admin-SELECT.
- `auth.users` (managed by Supabase Auth) — el link a org es vía `profiles.organization_id`.
- `profiles.is_floater` es una **columna** en `profiles`, no una tabla — queda cubierto al agregar `org_id` a `profiles`.

> **Nota:** lista final exhaustiva se reconfirma al ejecutar el plan revisando `list_tables` vía Supabase MCP. Si aparece alguna tabla auxiliar olvidada, se agrega ahí.

### 4.4 Decisión: ¿holidays nacionales compartidos o per-org?

Los 60+ días festivos nacionales colombianos 2026-2028 que pre-cargaste podrían:

- **A)** Replicarse para cada org nueva al crearla (N orgs × 60 rows = duplicación, simple)
- **B)** Mantenerse con `organization_id = NULL` = "festivos globales que aplican a todos" (más limpio, requiere RLS especial)

**Decisión:** **B** — holidays nacionales tienen `organization_id IS NULL` + nueva columna `country TEXT` (default 'CO'). RLS los muestra a las orgs cuyo país coincide: `WHERE (organization_id IS NULL AND country = (SELECT country FROM organizations WHERE id = get_user_org_id())) OR organization_id = get_user_org_id()`. Los managers solo pueden INSERT/UPDATE/DELETE los suyos (per-sede, `organization_id = get_user_org_id()`).

**Preparación multi-país (sub-proy futuro):**

- Nueva columna `holidays.country TEXT NOT NULL DEFAULT 'CO'` (CHECK against ISO 3166-1 alpha-2: `'CO','MX','PE','AR','CL',...`).
- Cuando se cree una org con `country = 'MX'`, automáticamente ve los holidays con `country = 'MX'` (que habría que pre-cargar o sincronizar vía API).
- El día que onboardees un cliente mexicano, ya tenés el schema listo: solo agregás rows con `country='MX'` y `organization_id IS NULL`.

**Auto-sync de festivos nacionales (sub-proy futuro, ver §15):**

API recomendada: **Nager.Date** (https://date.nager.at) — gratis, sin auth, soporta 100+ países incluyendo CO/MX/PE/AR/CL.
Endpoint: `GET https://date.nager.at/api/v3/PublicHolidays/{year}/{countryCode}`. Devuelve JSON con date, localName, name, fixed, global, types.

Implementación futura (NO en este sub-proyecto):
1. Edge function de Supabase `sync-national-holidays` corre via `pg_cron` daily (o weekly).
2. Para cada país soportado (lista en `app_settings.supported_countries`), fetch del año actual + siguiente.
3. Upsert en `holidays` con `organization_id IS NULL`, `country = '<CC>'`, `auto_synced_at = now()`.
4. Manual overrides (festivos regionales, puentes locales) marcan `auto_synced = false` y nunca se sobreescriben.

### 4.5 Rol super_admin

```sql
-- Extender CHECK constraint actual
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE profiles ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('super_admin','admin','manager','employee'));
```

`super_admin` siempre tiene `organization_id IS NULL` (no pertenece a tenant).

**Invisibilidad en UI:** todos los queries que listan empleados/profiles agregan `WHERE role != 'super_admin'`. Esto se aplica en ~8 lugares (employees page, schedule grid, swaps, etc.). Lista exhaustiva en el plan de implementación.

## 5. Helpers SQL

```sql
-- Reemplaza al actual get_user_role (mantenemos también ese, no se pisan)
CREATE OR REPLACE FUNCTION public.get_user_org_id()
RETURNS UUID
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT organization_id FROM profiles WHERE id = auth.uid()
$$;

CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT COALESCE(role = 'super_admin', false) FROM profiles WHERE id = auth.uid()
$$;

-- Slug helpers
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
-- Requiere extension unaccent (probablemente ya instalada; si no, CREATE EXTENSION en la migración)

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
```

## 6. Patrón RLS universal

Todas las tablas con `organization_id` reciben el siguiente patrón:

```sql
-- SELECT
CREATE POLICY "<tabla>_select" ON <tabla>
  FOR SELECT TO authenticated USING (
    is_super_admin() OR organization_id = get_user_org_id()
  );

-- INSERT (típicamente admin/manager)
CREATE POLICY "<tabla>_insert" ON <tabla>
  FOR INSERT TO authenticated WITH CHECK (
    is_super_admin() OR (
      organization_id = get_user_org_id()
      AND get_user_role() IN ('admin','manager')
    )
  );

-- UPDATE (análogo)
CREATE POLICY "<tabla>_update" ON <tabla>
  FOR UPDATE TO authenticated USING (
    is_super_admin() OR (
      organization_id = get_user_org_id()
      AND get_user_role() IN ('admin','manager')
    )
  );

-- DELETE (análogo)
CREATE POLICY "<tabla>_delete" ON <tabla>
  FOR DELETE TO authenticated USING (
    is_super_admin() OR (
      organization_id = get_user_org_id()
      AND get_user_role() IN ('admin','manager')
    )
  );
```

**Policies especiales que se preservan con filtro adicional de org:**

- `profiles_update_own` (employee solo actualiza su `phone`): agregar `AND organization_id = get_user_org_id()` redundante (ya implícito por `id = auth.uid()`).
- `profiles_insert WITH CHECK (false)`: se mantiene, todas las inserciones vienen del auth trigger o service_role.
- `holidays_select`: special case (ver §4.4) — `organization_id IS NULL OR organization_id = get_user_org_id() OR is_super_admin()`.
- `demo_requests`: no cambia (anon INSERT, super_admin SELECT/UPDATE).

## 7. API routes — protección cross-tenant

### 7.1 Helper `assertSameOrg`

`src/lib/auth/assert-same-org.ts`:

```typescript
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/supabase/database.types';

type TableWithOrgId =
  | 'profiles' | 'schedule_entries' | 'shift_swap_requests'
  | 'time_off_requests' | 'locations' | 'departments' | 'positions'
  | 'shift_templates' | 'schedules' | 'staffing_requirements';
  // Lista completa derivada de Database['public']['Tables']

export class CrossTenantError extends Error {
  constructor(public table: string, public resourceId: string) {
    super(`Cross-tenant access denied: ${table}/${resourceId}`);
  }
}

export async function assertSameOrg(
  supabase: SupabaseClient<Database>,
  callerOrgId: string | null,  // null = super_admin (skip check)
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
  if (data.organization_id !== callerOrgId) {
    throw new CrossTenantError(table, resourceId);
  }
}

// Helper para resolver caller en API routes
export async function getCallerContext(supabase: SupabaseClient<Database>) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Response('Unauthorized', { status: 401 });

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, role, organization_id')
    .eq('id', user.id)
    .single();

  if (!profile) throw new Response('Profile not found', { status: 401 });

  return {
    userId: profile.id,
    role: profile.role,
    orgId: profile.role === 'super_admin' ? null : profile.organization_id,
    isSuperAdmin: profile.role === 'super_admin',
  };
}
```

### 7.2 Refactor de las 5 API routes

| Route | Estrategia | Notas |
|---|---|---|
| `/api/swaps/approve` | RPC `approve_shift_swap` — agregar check interno `IF swap.organization_id != get_user_org_id() AND NOT is_super_admin() THEN RAISE EXCEPTION` | Ya es RPC. Solo agregar guard. |
| `/api/employees/invite` | TS route + `assertSameOrg` antes de Auth.admin.invite. Pasar `organization_id` en `user_metadata` para que el auth trigger lo escriba en profile | Bug fix incluido: hardcoded URL → `process.env.NEXT_PUBLIC_SITE_URL` |
| `/api/employees/demo` | TS route + `assertSameOrg` (verificar contract_type, position, location pertenecen al caller org) | Inyectar `organization_id` en el insert |
| `/api/employees/demo/convert` | RPC `convert_demo_to_real` — agregar check interno | Ya es RPC |
| `/api/employees/demo/transfer` | TS route con `assertSameOrg` para origen y destino | Ambos deben ser del mismo org |

### 7.3 Auth trigger para auto-asignar org en signup

El trigger actual en `auth.users` AFTER INSERT crea el row en `profiles`. Modificarlo para leer `user_metadata.organization_id` y `user_metadata.role`:

```sql
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, role, organization_id)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    COALESCE(NEW.raw_user_meta_data->>'role', 'employee'),
    (NEW.raw_user_meta_data->>'organization_id')::UUID
  );
  RETURN NEW;
END;
$$;
```

Para la migración inicial de Les Raptors: el trigger no aplica a profiles preexistentes. Los backfillea el UPDATE masivo de la migración.

## 8. Plan de migración Les Raptors → primer org

**Archivo:** `supabase/migrations/039_multi_tenant.sql`

Estructura:

```sql
BEGIN;

-- ============================================================
-- 1. Crear tabla organizations + indexes + trigger
-- ============================================================
CREATE TABLE organizations (...);
CREATE INDEX ...;
CREATE TRIGGER ...;

-- ============================================================
-- 2. Insertar Les Raptors con UUID fijo
-- ============================================================
INSERT INTO organizations (id, name, slug, plan, status, trial_ends_at, country, timezone)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  'Les Raptors',
  'les-raptors',
  'enterprise',
  'active',
  NULL,
  'CO',
  'America/Bogota'
);

-- ============================================================
-- 3. Helpers SQL (get_user_org_id, is_super_admin, slugify, suggest_unique_slug)
-- ============================================================
-- (definidos en §5)

-- ============================================================
-- 4. Extender profiles.role con super_admin
-- ============================================================
ALTER TABLE profiles DROP CONSTRAINT profiles_role_check;
ALTER TABLE profiles ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('super_admin','admin','manager','employee'));

-- ============================================================
-- 5. ALTER TABLE en bulk: agregar organization_id UUID NULL
-- ============================================================
ALTER TABLE locations ADD COLUMN organization_id UUID;
ALTER TABLE departments ADD COLUMN organization_id UUID;
-- ... (las 24 tablas listadas en §4.3)

-- ============================================================
-- 6. Backfill: SET organization_id = Les Raptors UUID
-- ============================================================
UPDATE locations SET organization_id = '00000000-0000-0000-0000-000000000001';
UPDATE departments SET organization_id = '00000000-0000-0000-0000-000000000001';
-- ... (las 24 tablas listadas en §4.3)

-- Excepción: holidays nacionales (organization_id IS NULL para "globales")
UPDATE holidays SET organization_id = '00000000-0000-0000-0000-000000000001'
  WHERE location_id IS NOT NULL;  -- Solo per-sede; nacionales se quedan NULL

-- ============================================================
-- 7. SET NOT NULL + FK constraint
-- ============================================================
ALTER TABLE locations ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE locations ADD CONSTRAINT locations_org_fk
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE RESTRICT;
-- ... (las 24 tablas listadas en §4.3)

-- ============================================================
-- 8. DROP todas las RLS policies viejas
-- ============================================================
DROP POLICY IF EXISTS "locations_select" ON locations;
-- ... (~80 policies a dropear, lista exhaustiva en el plan)

-- ============================================================
-- 9. CREATE policies nuevas con patrón universal
-- ============================================================
-- (lista exhaustiva en el plan)

-- ============================================================
-- 10. Promover mi cuenta a super_admin
-- ============================================================
UPDATE profiles
  SET role = 'super_admin', organization_id = NULL
  WHERE email = 'suv411@hotmail.com';

-- ============================================================
-- 11. Verificación inline
-- ============================================================
DO $$
DECLARE
  org_count INT;
  super_admin_count INT;
  orphan_count INT;
BEGIN
  SELECT COUNT(*) INTO org_count FROM organizations;
  ASSERT org_count = 1, 'Expected exactly 1 organization';

  SELECT COUNT(*) INTO super_admin_count FROM profiles WHERE role = 'super_admin';
  ASSERT super_admin_count >= 1, 'Expected at least 1 super_admin';

  SELECT COUNT(*) INTO orphan_count FROM profiles
    WHERE role != 'super_admin' AND organization_id IS NULL;
  ASSERT orphan_count = 0, 'Found profiles without organization_id';
END $$;

COMMIT;
```

**Pre-migration:** backup automático de Supabase (Daily Backups en Pro plan o snapshot manual).

**Post-migration:** `npm run build` + smoke test E2E manual.

## 9. Testing

### 9.1 SQL test `supabase/tests/multi_tenant_isolation_test.sql`

```sql
BEGIN;

-- Setup: crear segunda org de prueba
INSERT INTO organizations (id, name, slug, plan, status)
VALUES ('00000000-0000-0000-0000-000000000002', 'Test Org B', 'test-org-b', 'starter', 'active');

-- Crear usuarios falsos
INSERT INTO profiles (id, email, role, organization_id) VALUES
  ('11111111-1111-1111-1111-111111111111', 'admin@a.com', 'admin', '00000000-0000-0000-0000-000000000001'),
  ('22222222-2222-2222-2222-222222222222', 'admin@b.com', 'admin', '00000000-0000-0000-0000-000000000002');

-- Test 1: usuario A no debe ver datos de org B
SET LOCAL role authenticated;
SET LOCAL "request.jwt.claim.sub" TO '11111111-1111-1111-1111-111111111111';
SELECT COUNT(*) FROM locations WHERE organization_id = '00000000-0000-0000-0000-000000000002';
-- Expected: 0

-- Test 2: usuario A no puede INSERT en org B
SET LOCAL "request.jwt.claim.sub" TO '11111111-1111-1111-1111-111111111111';
INSERT INTO locations (organization_id, name) VALUES ('00000000-0000-0000-0000-000000000002', 'Hack');
-- Expected: ERROR (policy violation)

-- Test 3: super_admin VE TODO
INSERT INTO profiles (id, email, role, organization_id) VALUES
  ('33333333-3333-3333-3333-333333333333', 'super@saas.com', 'super_admin', NULL);
SET LOCAL "request.jwt.claim.sub" TO '33333333-3333-3333-3333-333333333333';
SELECT COUNT(DISTINCT organization_id) FROM locations;
-- Expected: 2

-- Test 4: super_admin puede UPDATE cross-tenant
SET LOCAL "request.jwt.claim.sub" TO '33333333-3333-3333-3333-333333333333';
UPDATE locations SET name = name || ' (updated)';
-- Expected: success

-- Test 5: holidays nacionales se ven desde cualquier org
SET LOCAL "request.jwt.claim.sub" TO '11111111-1111-1111-1111-111111111111';
SELECT COUNT(*) FROM holidays WHERE organization_id IS NULL;
-- Expected: > 0 (los nacionales pre-cargados)

-- Test 6: usuario A NO puede modificar holidays nacionales
UPDATE holidays SET name = 'Hack' WHERE organization_id IS NULL;
-- Expected: ERROR

ROLLBACK;
```

### 9.2 Vitest `src/lib/auth/assert-same-org.test.ts`

Casos:
- Same org → no throw
- Diff org → CrossTenantError
- Resource doesn't exist → CrossTenantError
- callerOrgId === null (super_admin) → no throw (skip)
- Error de Supabase → CrossTenantError

### 9.3 Vitest preexistentes (293)

Siguen verdes. `equity-helpers`, `schedule-generator`, `schedule-health`, `payroll-engine` son pure-logic y no tocan RLS. Validar antes de aplicar 039.

### 9.4 Manual E2E

Después de aplicar 039 a prod:
1. Login como admin Les Raptors (cuenta existente) → dashboard carga
2. Schedule → ver borrador del mes actual → editar una celda → save OK
3. Employees → crear demo employee → OK
4. Requests → aprobar una ausencia → OK
5. Notifications → recibe notif en realtime (subscription filter por org_id)
6. Logout
7. Login como super_admin (yo) → ver que TODO sigue accesible
8. SQL query manual: `SELECT * FROM locations` → debe retornar locations de TODAS las orgs (hoy solo Les Raptors)

## 10. Rollback plan

### Caso 1: la migración 039 falla a mitad → `ROLLBACK` automático

Es la primera línea de defensa. Si cualquier statement falla dentro del BEGIN, todo se revierte y la base queda intacta.

### Caso 2: la migración 039 COMMITeó pero descubrimos bug en runtime

Plan:
1. Supabase dashboard → restore desde backup automático más reciente (anterior a 039)
2. Investigar bug en local con `supabase db reset` + replay migration
3. Fix → nueva migration 040 que corrige

### Caso 3: bug menor que no requiere rollback total

Patch via migration 040+. Las RLS policies pueden DROP/CREATE en una migración pequeña.

## 11. Cleanup pendiente (no parte de esta spec, recordatorio)

- `src/lib/contract-types.ts`: columnas DEPRECATED (`max_sundays_per_quarter`, etc.) sería buen momento para borrarlas — pero **NO** lo hacemos aquí. Lo hacemos en una migración separada después de verificar 039 estable.

## 12. Anexo — KPIs para dashboard super-admin (sub-proy 7)

Cuando llegue el momento de construir `/super-admin`, las métricas a implementar:

### Capa 1 — MVP
- 4 hero stats: Orgs activas, Orgs en trial, Leads pendientes (`demo_requests`), Orgs en riesgo (sin actividad 14d)
- Tabla principal "Todas las orgs" con filtros (status, plan, búsqueda)
- Pipeline leads: `demo_requests` con estados pending → contacted → qualified → converted
- Vista detalle por org: usuarios, datos (# sedes/depts/positions/employees), actividad (sparkline 30d), notificaciones log, acciones (pause/extend trial/impersonate read-only)

### Capa 2 — Cuando llegue billing
- MRR, ARR, MRR growth m/m
- Churn rate, ARPU, Trial→Paid conversion
- Línea de tiempo MRR (Recharts)
- Cohort retention heatmap
- Funnel conversión

### Capa 3 — Post-PMF
- Mapa de Colombia con pins por sede
- Heat map uso semanal
- Alertas operativas en tiempo real
- Comparativa entre orgs (percentiles)
- Benchmark sectorial

### Stack
- `/super-admin/*` con middleware que verifica `role = 'super_admin'`
- Sidebar separado
- Recharts (lightweight, viene con shadcn)
- Sin Realtime (refresh on load suficiente)
- Impersonate: cookie `super_admin_viewing_as=<org_id>` + filtro read-only

## 13. Estimación

| Tarea | Horas |
|---|---|
| Migration 039 (~400 líneas SQL) | 5 |
| SQL test isolation (~150 líneas) | 1 |
| Helper `assertSameOrg` + Vitest | 1.5 |
| Refactor 5 API routes | 2 |
| Verificación manual E2E | 2 |
| Auth trigger update + smoke | 1 |
| Buffer / ajustes / debugging | 4 |
| **Total** | **~17 horas (2-3 días full, 4-5 días horarios partidos)** |

## 15. Preparación para expansión multi-país (futuro)

El usuario explicitó: "a futuro incursionamos en otro país, que todo esté preparado (las bases)". Lo que SÍ se hace en este sub-proyecto para dejar el camino:

### Ya incluido en sub-proy 3
- `organizations.country` con default `'CO'` (CHECK constraint ISO 3166-1 alpha-2 puede agregarse después si se quiere)
- `organizations.timezone` con default `'America/Bogota'`
- `holidays.country TEXT NOT NULL DEFAULT 'CO'` (ver §4.4)
- RLS de `holidays` ya filtra por country match — un cliente de MX no verá holidays de CO

### Lo que queda para sub-proyectos posteriores (NO acá)
- Edge function `sync-national-holidays` con pg_cron diario → upsert vía Nager.Date API
- Selector de país en `/signup` (sub-proy 4) — default CO, con dropdown CO/MX/PE/AR/CL
- Configuración de moneda por país en `organizations.currency` (sub-proy 6 billing)
- Traducción de UI (i18n) cuando llegue primer cliente no-hispano (sub-proy avanzado; ES-CO vs ES-MX vs ES-AR son variantes mínimas que se manejan con copy condicional sin i18n full)
- Reglas laborales país-específicas: hoy `contract_types` + `contract_rest_rules` están hardcoded a CST (Código Sustantivo del Trabajo Colombia). Para MX se necesita LFT (Ley Federal del Trabajo), para AR LCT, etc. Una tabla `country_labor_rules` con presets podría existir, pero es trabajo de sub-proy 9+ cuando llegue el primer cliente real.

### Riesgo bajo
Estas decisiones futuras NO requieren migración de schema adicional gracias a las preparaciones del sub-proy 3. Solo nuevas tablas/columnas opcionales que no rompen lo existente.

## 14. Referencias

- Modern web compliance polish: `docs/superpowers/plans/2026-05-20-modern-web-compliance.md`
- Landing B2B: `docs/superpowers/plans/2026-05-20-landing-page.md`
- Equity model (último refactor grande): `docs/superpowers/plans/2026-04-22-schedule-equity-model.md`
- Project memory: `~/.claude/projects/-Users-usuario-App-Horarios/memory/project_status_2026_05_20_polish.md`
