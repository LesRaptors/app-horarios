-- =============================================================================
-- Migration 039 — Multi-tenant data model
-- Spec: docs/superpowers/specs/2026-05-20-multi-tenant-data-model.md
-- Plan: docs/superpowers/plans/2026-05-20-multi-tenant-data-model.md
--
-- Convierte la app de single-tenant ("Les Raptors implícito") a multi-tenant.
-- - Crea tabla organizations + Les Raptors row con UUID fijo
-- - Helpers SQL: get_user_org_id, is_super_admin, slugify, suggest_unique_slug, set_updated_at
-- - Convierte profiles.role de ENUM (user_role) a TEXT con CHECK constraint
--     (necesario porque ALTER TYPE ADD VALUE no soporta uso del nuevo label
--      en la misma transacción — TEXT permite incluir 'super_admin' atómicamente)
-- - Recrea get_user_role() devolviendo TEXT
-- - Agrega organization_id NOT NULL a 27 tablas (FK ON DELETE RESTRICT)
--     Ajustes vs plan original (24 tablas):
--       Removidas: staffing_audit, salary_advances, salary_settlements (no existen)
--       Agregadas: salary_history, salary_adjustments, payroll_provisions,
--                  payroll_employer_cost, absence_records, tax_personal_deductions
-- - Reescribe ~100 RLS policies con patrón universal:
--     USING (is_super_admin() OR organization_id = get_user_org_id() [...])
-- - holidays.country TEXT NOT NULL DEFAULT 'CO' + RLS country-match (multi-país prep)
-- - Promueve suv411@hotmail.com a super_admin (organization_id NULL)
-- - Verificación inline con ASSERTs
-- =============================================================================

BEGIN;

-- =============================================================================
-- 1. Extensions (idempotente)
-- =============================================================================
CREATE EXTENSION IF NOT EXISTS unaccent;
-- pgcrypto ya está instalado para gen_random_uuid()


-- =============================================================================
-- 2. Tabla organizations + indexes + trigger updated_at
-- =============================================================================

-- set_updated_at helper (idempotente — usado por organizations y otras tablas)
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

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

CREATE TRIGGER organizations_set_updated_at
  BEFORE UPDATE ON organizations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- RLS se habilita aquí; policies se definen en sección 11
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;


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


-- =============================================================================
-- 4. Helpers SQL (get_user_org_id, is_super_admin, slugify, suggest_unique_slug)
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

-- Permisos: anon puede llamar suggest_unique_slug en sub-proy 4 (/signup)
GRANT EXECUTE ON FUNCTION public.suggest_unique_slug(TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_org_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_super_admin() TO authenticated;


-- =============================================================================
-- 5. Convertir profiles.role de ENUM (user_role) a TEXT + CHECK super_admin
-- =============================================================================
-- Contexto: profiles.role usa ENUM user_role (admin|manager|employee). El plan
-- usa CHECK constraint con 'super_admin'. ALTER TYPE ADD VALUE no permite usar
-- el nuevo label en la misma transacción, así que convertimos a TEXT.
-- get_user_role() depende del tipo ENUM, así que la dropeamos antes y la
-- recreamos al final con RETURNS TEXT.

-- Drop policies y funciones que dependen de role/user_role ANTES del cambio de tipo.
-- Las policies se recrean en sección 11.
DO $cleanup$
DECLARE
  pol RECORD;
  target_tables TEXT[] := ARRAY[
    'locations','departments','positions','profiles','shift_templates',
    'schedules','schedule_entries','staffing_requirements',
    'time_off_requests','shift_swap_requests','notifications',
    'app_settings','payroll_settings','contract_types','contract_rest_rules',
    'employee_rest_rules','payroll_periods','payroll_entries',
    'salary_history','salary_adjustments','payroll_provisions',
    'payroll_employer_cost','absence_records','tax_personal_deductions',
    'holidays','employee_equity_rollups','employee_secondary_positions',
    'organizations','demo_requests'
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
END $cleanup$;

-- Drop la función vieja (RETURNS user_role) — la recreamos abajo con RETURNS TEXT
DROP FUNCTION IF EXISTS public.get_user_role() CASCADE;

-- Recrear handle_new_user() ANTES del DROP TYPE user_role (tiene cast a ese tipo).
-- También se prepara para multi-tenant: lee organization_id de raw_user_meta_data
-- (consolidamos acá lo que el plan original hacía en migración 040).
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $handle_new_user$
DECLARE
  meta_role TEXT;
  meta_org_id UUID;
BEGIN
  meta_role := COALESCE(NEW.raw_user_meta_data->>'role', 'employee');
  meta_org_id := (NEW.raw_user_meta_data->>'organization_id')::UUID;

  -- Validación: si no es super_admin, organization_id es required (el CHECK
  -- profiles_org_required lo enforce, pero damos error claro acá).
  IF meta_role != 'super_admin' AND meta_org_id IS NULL THEN
    RAISE EXCEPTION 'organization_id is required in user_metadata for role %', meta_role;
  END IF;

  INSERT INTO public.profiles (id, first_name, last_name, email, role, organization_id)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'first_name', ''),
    COALESCE(NEW.raw_user_meta_data->>'last_name', ''),
    NEW.email,
    meta_role,
    meta_org_id
  );

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE LOG 'handle_new_user failed for user %: %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$handle_new_user$;

-- Cambiar profiles.role de ENUM a TEXT
ALTER TABLE profiles ALTER COLUMN role DROP DEFAULT;
ALTER TABLE profiles ALTER COLUMN role TYPE TEXT USING role::TEXT;
ALTER TABLE profiles ALTER COLUMN role SET DEFAULT 'employee';

-- Agregar CHECK constraint extendido con super_admin
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE profiles ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('super_admin','admin','manager','employee'));

-- Dropear el tipo ENUM ahora que no lo usa nadie
DROP TYPE IF EXISTS public.user_role;

-- Recrear get_user_role() con RETURNS TEXT
CREATE OR REPLACE FUNCTION public.get_user_role()
RETURNS TEXT
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT role FROM profiles WHERE id = auth.uid()
$$;

GRANT EXECUTE ON FUNCTION public.get_user_role() TO authenticated;


-- =============================================================================
-- 6. ALTER las 27 tablas: ADD COLUMN organization_id UUID NULL
-- =============================================================================
ALTER TABLE locations                    ADD COLUMN organization_id UUID;
ALTER TABLE departments                  ADD COLUMN organization_id UUID;
ALTER TABLE positions                    ADD COLUMN organization_id UUID;
ALTER TABLE profiles                     ADD COLUMN organization_id UUID;
ALTER TABLE shift_templates              ADD COLUMN organization_id UUID;
ALTER TABLE schedules                    ADD COLUMN organization_id UUID;
ALTER TABLE schedule_entries             ADD COLUMN organization_id UUID;
ALTER TABLE staffing_requirements        ADD COLUMN organization_id UUID;
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
ALTER TABLE holidays                     ADD COLUMN organization_id UUID;
ALTER TABLE employee_equity_rollups      ADD COLUMN organization_id UUID;
ALTER TABLE employee_secondary_positions ADD COLUMN organization_id UUID;
-- Tablas nuevas no listadas en plan v1 pero existentes en prod:
ALTER TABLE salary_history               ADD COLUMN organization_id UUID;
ALTER TABLE salary_adjustments           ADD COLUMN organization_id UUID;
ALTER TABLE payroll_provisions           ADD COLUMN organization_id UUID;
ALTER TABLE payroll_employer_cost        ADD COLUMN organization_id UUID;
ALTER TABLE absence_records              ADD COLUMN organization_id UUID;
ALTER TABLE tax_personal_deductions      ADD COLUMN organization_id UUID;


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
UPDATE employee_equity_rollups      SET organization_id = '00000000-0000-0000-0000-000000000001';
UPDATE employee_secondary_positions SET organization_id = '00000000-0000-0000-0000-000000000001';
UPDATE salary_history               SET organization_id = '00000000-0000-0000-0000-000000000001';
UPDATE salary_adjustments           SET organization_id = '00000000-0000-0000-0000-000000000001';
UPDATE payroll_provisions           SET organization_id = '00000000-0000-0000-0000-000000000001';
UPDATE payroll_employer_cost        SET organization_id = '00000000-0000-0000-0000-000000000001';
UPDATE absence_records              SET organization_id = '00000000-0000-0000-0000-000000000001';
UPDATE tax_personal_deductions      SET organization_id = '00000000-0000-0000-0000-000000000001';

-- holidays: solo las per-sede van a Les Raptors. Las nacionales (location_id IS NULL)
-- se quedan con organization_id IS NULL.
UPDATE holidays SET organization_id = '00000000-0000-0000-0000-000000000001'
  WHERE location_id IS NOT NULL;


-- =============================================================================
-- 8. SET NOT NULL + FK constraints
-- =============================================================================

-- profiles excepción: super_admin tiene organization_id IS NULL → columna NULLABLE
-- con CHECK constraint que enforce semántica
ALTER TABLE profiles ADD CONSTRAINT profiles_org_required
  CHECK (
    (role = 'super_admin' AND organization_id IS NULL)
    OR
    (role != 'super_admin' AND organization_id IS NOT NULL)
  );
ALTER TABLE profiles ADD CONSTRAINT profiles_org_fk
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE RESTRICT;

-- Las otras 25 tablas tenant-scoped (excluye profiles y holidays): NOT NULL + FK
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
ALTER TABLE employee_equity_rollups      ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE employee_equity_rollups      ADD CONSTRAINT employee_equity_rollups_org_fk      FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE RESTRICT;
ALTER TABLE employee_secondary_positions ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE employee_secondary_positions ADD CONSTRAINT employee_secondary_positions_org_fk FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE RESTRICT;
-- Tablas nuevas (no estaban en plan v1)
ALTER TABLE salary_history               ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE salary_history               ADD CONSTRAINT salary_history_org_fk               FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE RESTRICT;
ALTER TABLE salary_adjustments           ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE salary_adjustments           ADD CONSTRAINT salary_adjustments_org_fk           FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE RESTRICT;
ALTER TABLE payroll_provisions           ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE payroll_provisions           ADD CONSTRAINT payroll_provisions_org_fk           FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE RESTRICT;
ALTER TABLE payroll_employer_cost        ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE payroll_employer_cost        ADD CONSTRAINT payroll_employer_cost_org_fk        FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE RESTRICT;
ALTER TABLE absence_records              ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE absence_records              ADD CONSTRAINT absence_records_org_fk              FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE RESTRICT;
ALTER TABLE tax_personal_deductions      ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE tax_personal_deductions      ADD CONSTRAINT tax_personal_deductions_org_fk      FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE RESTRICT;

-- holidays: NULLABLE (nacionales) — FK opcional
ALTER TABLE holidays ADD CONSTRAINT holidays_org_fk
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE RESTRICT;

-- Indexes en organization_id para performance (tablas de alto volumen)
CREATE INDEX schedule_entries_org_idx ON schedule_entries(organization_id);
CREATE INDEX notifications_org_idx ON notifications(organization_id);
CREATE INDEX employee_equity_rollups_org_idx ON employee_equity_rollups(organization_id);
CREATE INDEX payroll_entries_org_idx ON payroll_entries(organization_id);


-- =============================================================================
-- 8.5 Recrear RPCs que ahora deben escribir organization_id (NOT NULL)
-- =============================================================================
-- recompute_equity_rollup, approve_shift_swap, save_staffing_diff insertan en
-- tablas que ya tienen organization_id NOT NULL. Las recreamos derivando el org
-- desde el contexto (employee profile, swap.requester o location).

CREATE OR REPLACE FUNCTION public.recompute_equity_rollup(
  p_employee_id UUID, p_year INTEGER, p_month INTEGER
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $recompute$
DECLARE
  emp_org UUID;
BEGIN
  SELECT organization_id INTO emp_org FROM profiles WHERE id = p_employee_id;
  IF emp_org IS NULL THEN
    RETURN;  -- empleado no existe o super_admin (no aplica)
  END IF;

  INSERT INTO employee_equity_rollups (
    employee_id, organization_id, year, month,
    sundays_worked, saturdays_worked, nights_worked, holidays_worked, total_hours
  )
  SELECT
    p_employee_id, emp_org, p_year, p_month,
    COUNT(*) FILTER (WHERE EXTRACT(DOW FROM se.date) = 0)::INT,
    COUNT(*) FILTER (WHERE EXTRACT(DOW FROM se.date) = 6)::INT,
    COUNT(*) FILTER (WHERE st.is_night = true)::INT,
    COUNT(*) FILTER (WHERE EXISTS (
      SELECT 1 FROM holidays h
      WHERE h.date = se.date
        AND (h.location_id IS NULL OR h.location_id = (
          SELECT s.location_id FROM schedules s WHERE s.id = se.schedule_id
        ))
    ))::INT,
    COALESCE(SUM(
      EXTRACT(EPOCH FROM (
        (se.date + se.end_time) +
          CASE WHEN se.end_time < se.start_time THEN INTERVAL '1 day' ELSE INTERVAL '0' END
        - (se.date + se.start_time)
      )) / 3600
    ), 0)::NUMERIC(6,2)
  FROM schedule_entries se
  LEFT JOIN shift_templates st ON st.id = se.shift_template_id
  WHERE se.employee_id = p_employee_id
    AND EXTRACT(YEAR FROM se.date) = p_year
    AND EXTRACT(MONTH FROM se.date) = p_month
  ON CONFLICT (employee_id, year, month) DO UPDATE SET
    sundays_worked   = EXCLUDED.sundays_worked,
    saturdays_worked = EXCLUDED.saturdays_worked,
    nights_worked    = EXCLUDED.nights_worked,
    holidays_worked  = EXCLUDED.holidays_worked,
    total_hours      = EXCLUDED.total_hours,
    updated_at       = now();
END;
$recompute$;

CREATE OR REPLACE FUNCTION public.approve_shift_swap(p_swap_id UUID, p_reviewer_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $approve$
DECLARE
  v_swap RECORD;
BEGIN
  SELECT * INTO v_swap FROM shift_swap_requests WHERE id = p_swap_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Solicitud de intercambio no encontrada', 'code', 'NOT_FOUND');
  END IF;
  IF v_swap.status != 'accepted' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Solo se pueden aprobar intercambios aceptados', 'code', 'INVALID_STATUS');
  END IF;

  UPDATE schedule_entries SET employee_id = v_swap.target_id    WHERE id = v_swap.requester_entry_id;
  UPDATE schedule_entries SET employee_id = v_swap.requester_id WHERE id = v_swap.target_entry_id;

  UPDATE shift_swap_requests
     SET status = 'approved', reviewed_by = p_reviewer_id
   WHERE id = p_swap_id;

  INSERT INTO notifications (user_id, organization_id, title, message, type, link)
  VALUES
    (v_swap.requester_id, v_swap.organization_id, 'Intercambio aprobado',
     'Tu solicitud de intercambio de turno ha sido aprobada.', 'swap_request', '/requests'),
    (v_swap.target_id, v_swap.organization_id, 'Intercambio aprobado',
     'El intercambio de turno ha sido aprobado por el manager.', 'swap_request', '/requests');

  RETURN jsonb_build_object('success', true);
END;
$approve$;

-- create_notification: helper RPC ahora requiere organization_id explícito.
CREATE OR REPLACE FUNCTION public.create_notification(
  p_user_id UUID,
  p_organization_id UUID,
  p_title TEXT,
  p_message TEXT,
  p_type notification_type DEFAULT 'general'::notification_type,
  p_link TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $create_notif$
DECLARE
  v_id UUID;
BEGIN
  INSERT INTO notifications (user_id, organization_id, title, message, type, link)
  VALUES (p_user_id, p_organization_id, p_title, p_message, p_type, p_link)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$create_notif$;

-- Triggers que insertan notifications: ahora propagan organization_id desde NEW.
CREATE OR REPLACE FUNCTION public.notify_employees_on_period_approval()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $notif_period$
DECLARE
  emp_id UUID;
  month_label TEXT;
  month_names TEXT[] := ARRAY[
    'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
    'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'
  ];
BEGIN
  IF NOT (OLD.status = 'draft' AND NEW.status = 'approved') THEN
    RETURN NEW;
  END IF;

  month_label := initcap(month_names[EXTRACT(MONTH FROM NEW.period_start)::int])
                 || ' ' || EXTRACT(YEAR FROM NEW.period_start)::text;

  FOR emp_id IN
    SELECT DISTINCT employee_id FROM payroll_entries
    WHERE payroll_period_id = NEW.id
  LOOP
    INSERT INTO notifications (user_id, organization_id, type, title, message, link)
    VALUES (
      emp_id, NEW.organization_id, 'general',
      'Tu pago de ' || month_label || ' está disponible',
      'Ya podés ver el detalle de tu liquidación en Mi Pago.',
      '/mi-pago?period=' || NEW.id::text
    );
  END LOOP;

  RETURN NEW;
END;
$notif_period$;

CREATE OR REPLACE FUNCTION public.notify_schedule_published()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $notif_schedule$
BEGIN
  IF NEW.status = 'published' AND (OLD.status IS NULL OR OLD.status != 'published') THEN
    INSERT INTO notifications (user_id, organization_id, title, message, type, link)
    SELECT DISTINCT
      se.employee_id,
      NEW.organization_id,
      'Horario publicado',
      'Se ha publicado el horario de ' ||
        CASE NEW.month
          WHEN 1 THEN 'Enero' WHEN 2 THEN 'Febrero' WHEN 3 THEN 'Marzo'
          WHEN 4 THEN 'Abril' WHEN 5 THEN 'Mayo' WHEN 6 THEN 'Junio'
          WHEN 7 THEN 'Julio' WHEN 8 THEN 'Agosto' WHEN 9 THEN 'Septiembre'
          WHEN 10 THEN 'Octubre' WHEN 11 THEN 'Noviembre' WHEN 12 THEN 'Diciembre'
        END || ' ' || NEW.year,
      'schedule_published'::notification_type,
      '/schedule'
    FROM schedule_entries se
    WHERE se.schedule_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$notif_schedule$;

CREATE OR REPLACE FUNCTION public.notify_swap_request()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $notif_swap$
DECLARE
  v_requester_name TEXT;
BEGIN
  SELECT first_name || ' ' || last_name INTO v_requester_name
  FROM profiles WHERE id = NEW.requester_id;

  INSERT INTO notifications (user_id, organization_id, title, message, type, link)
  VALUES (
    NEW.target_id, NEW.organization_id,
    'Solicitud de intercambio',
    v_requester_name || ' quiere intercambiar un turno contigo.',
    'swap_request'::notification_type,
    '/requests'
  );

  RETURN NEW;
END;
$notif_swap$;

CREATE OR REPLACE FUNCTION public.notify_time_off_reviewed()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $notif_timeoff$
BEGIN
  IF NEW.status != OLD.status AND NEW.status IN ('approved', 'rejected') THEN
    INSERT INTO notifications (user_id, organization_id, title, message, type, link)
    VALUES (
      NEW.employee_id, NEW.organization_id,
      CASE NEW.status
        WHEN 'approved' THEN 'Solicitud aprobada'
        WHEN 'rejected' THEN 'Solicitud rechazada'
      END,
      'Tu solicitud de días libres del ' || NEW.start_date || ' al ' || NEW.end_date ||
      ' ha sido ' ||
      CASE NEW.status
        WHEN 'approved' THEN 'aprobada'
        WHEN 'rejected' THEN 'rechazada'
      END,
      'request_update'::notification_type,
      '/requests'
    );
  END IF;
  RETURN NEW;
END;
$notif_timeoff$;

CREATE OR REPLACE FUNCTION public.save_staffing_diff(p_location_id UUID, p_rows JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $staffing$
DECLARE
  inserted_count INT := 0;
  updated_count INT := 0;
  deleted_count INT := 0;
  user_id UUID := auth.uid();
  loc_org UUID;
BEGIN
  IF NOT (
    get_user_role() = 'admin' OR
    (get_user_role() = 'manager' AND get_user_location_id() = p_location_id)
  ) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT organization_id INTO loc_org FROM locations WHERE id = p_location_id;
  IF loc_org IS NULL THEN
    RAISE EXCEPTION 'location not found';
  END IF;

  CREATE TEMP TABLE _desired ON COMMIT DROP AS
  SELECT
    (r->>'position_id')::UUID AS position_id,
    (r->>'shift_template_id')::UUID AS shift_template_id,
    (r->>'day_of_week')::INT AS day_of_week,
    (r->>'required_count')::INT AS required_count
  FROM jsonb_array_elements(p_rows) r;

  WITH del AS (
    DELETE FROM staffing_requirements sr
     WHERE sr.location_id = p_location_id
       AND NOT EXISTS (
         SELECT 1 FROM _desired d
          WHERE d.position_id = sr.position_id
            AND d.shift_template_id = sr.shift_template_id
            AND d.day_of_week = sr.day_of_week
            AND d.required_count > 0
       )
     RETURNING 1
  ) SELECT count(*) INTO deleted_count FROM del;

  WITH ups AS (
    INSERT INTO staffing_requirements
      (location_id, organization_id, position_id, shift_template_id, day_of_week, required_count, updated_by)
    SELECT p_location_id, loc_org, position_id, shift_template_id, day_of_week, required_count, user_id
      FROM _desired WHERE required_count > 0
    ON CONFLICT (location_id, position_id, shift_template_id, day_of_week)
    DO UPDATE SET
      required_count = EXCLUDED.required_count,
      updated_by = user_id
    RETURNING (xmax = 0) AS was_insert
  )
  SELECT
    count(*) FILTER (WHERE was_insert),
    count(*) FILTER (WHERE NOT was_insert)
  INTO inserted_count, updated_count
  FROM ups;

  RETURN jsonb_build_object('inserted', inserted_count, 'updated', updated_count, 'deleted', deleted_count);
END;
$staffing$;


-- =============================================================================
-- 9. holidays.country (multi-país prep)
-- =============================================================================
ALTER TABLE holidays ADD COLUMN country TEXT NOT NULL DEFAULT 'CO';
CREATE INDEX holidays_country_idx ON holidays(country);


-- =============================================================================
-- 10. DROP RLS policies viejas
-- =============================================================================
-- Ya se hicieron en sección 5 (necesario hacerlo antes del cambio de tipo de role).
-- Sección reservada por trazabilidad con plan original.


-- =============================================================================
-- 11. CREATE RLS policies nuevas con patrón universal
-- =============================================================================

-- ---------- organizations (tabla maestra) ----------
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

-- ---------- locations ----------
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

-- ---------- departments ----------
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

-- ---------- positions ----------
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

-- ---------- profiles (con especiales) ----------
CREATE POLICY profiles_select ON profiles FOR SELECT TO authenticated USING (
  is_super_admin() OR organization_id = get_user_org_id()
);
-- INSERT: bloqueado (auth trigger lo maneja)
CREATE POLICY profiles_insert ON profiles FOR INSERT TO authenticated WITH CHECK (false);
-- UPDATE OWN: empleado solo puede actualizar su propia fila
CREATE POLICY profiles_update_own ON profiles FOR UPDATE TO authenticated USING (
  id = auth.uid()
);
-- UPDATE ADMIN: admin/manager actualizan cualquier fila de su org
CREATE POLICY profiles_update_admin ON profiles FOR UPDATE TO authenticated USING (
  is_super_admin() OR (organization_id = get_user_org_id() AND get_user_role() IN ('admin','manager'))
);
-- DELETE: admin/manager (soft delete via is_active = false en general; hard delete para demos)
CREATE POLICY profiles_delete_admin ON profiles FOR DELETE TO authenticated USING (
  is_super_admin() OR (organization_id = get_user_org_id() AND get_user_role() IN ('admin','manager'))
);

-- ---------- shift_templates ----------
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

-- ---------- schedules ----------
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

-- ---------- schedule_entries ----------
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

-- ---------- staffing_requirements ----------
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

-- ---------- time_off_requests (employee crea, admin/manager aprueba) ----------
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

-- ---------- shift_swap_requests ----------
CREATE POLICY shift_swap_requests_select ON shift_swap_requests FOR SELECT TO authenticated USING (
  is_super_admin() OR organization_id = get_user_org_id()
);
CREATE POLICY shift_swap_requests_insert ON shift_swap_requests FOR INSERT TO authenticated WITH CHECK (
  is_super_admin() OR organization_id = get_user_org_id()
);
CREATE POLICY shift_swap_requests_update ON shift_swap_requests FOR UPDATE TO authenticated USING (
  is_super_admin() OR organization_id = get_user_org_id()
);
CREATE POLICY shift_swap_requests_delete ON shift_swap_requests FOR DELETE TO authenticated USING (
  is_super_admin() OR (organization_id = get_user_org_id() AND get_user_role() IN ('admin','manager'))
);

-- ---------- notifications (employee ve las suyas + admin/manager ve todas) ----------
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

-- ---------- app_settings ----------
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

-- ---------- payroll_settings ----------
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

-- ---------- contract_types (admin solo) ----------
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

-- ---------- contract_rest_rules ----------
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

-- ---------- employee_rest_rules ----------
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

-- ---------- payroll_periods ----------
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

-- ---------- payroll_entries (employee ve las suyas; admin/manager todas del org) ----------
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

-- ---------- salary_history (espejo de payroll_entries — employee personal) ----------
CREATE POLICY salary_history_select ON salary_history FOR SELECT TO authenticated USING (
  is_super_admin() OR (organization_id = get_user_org_id() AND (employee_id = auth.uid() OR get_user_role() IN ('admin','manager')))
);
CREATE POLICY salary_history_insert ON salary_history FOR INSERT TO authenticated WITH CHECK (
  is_super_admin() OR (organization_id = get_user_org_id() AND get_user_role() IN ('admin','manager'))
);
CREATE POLICY salary_history_update ON salary_history FOR UPDATE TO authenticated USING (
  is_super_admin() OR (organization_id = get_user_org_id() AND get_user_role() IN ('admin','manager'))
);
CREATE POLICY salary_history_delete ON salary_history FOR DELETE TO authenticated USING (
  is_super_admin() OR (organization_id = get_user_org_id() AND get_user_role() IN ('admin','manager'))
);

-- ---------- salary_adjustments (employee personal) ----------
CREATE POLICY salary_adjustments_select ON salary_adjustments FOR SELECT TO authenticated USING (
  is_super_admin() OR (organization_id = get_user_org_id() AND (employee_id = auth.uid() OR get_user_role() IN ('admin','manager')))
);
CREATE POLICY salary_adjustments_insert ON salary_adjustments FOR INSERT TO authenticated WITH CHECK (
  is_super_admin() OR (organization_id = get_user_org_id() AND get_user_role() IN ('admin','manager'))
);
CREATE POLICY salary_adjustments_update ON salary_adjustments FOR UPDATE TO authenticated USING (
  is_super_admin() OR (organization_id = get_user_org_id() AND get_user_role() IN ('admin','manager'))
);
CREATE POLICY salary_adjustments_delete ON salary_adjustments FOR DELETE TO authenticated USING (
  is_super_admin() OR (organization_id = get_user_org_id() AND get_user_role() IN ('admin','manager'))
);

-- ---------- payroll_provisions (employee personal) ----------
CREATE POLICY payroll_provisions_select ON payroll_provisions FOR SELECT TO authenticated USING (
  is_super_admin() OR (organization_id = get_user_org_id() AND (employee_id = auth.uid() OR get_user_role() IN ('admin','manager')))
);
CREATE POLICY payroll_provisions_insert ON payroll_provisions FOR INSERT TO authenticated WITH CHECK (
  is_super_admin() OR (organization_id = get_user_org_id() AND get_user_role() IN ('admin','manager'))
);
CREATE POLICY payroll_provisions_update ON payroll_provisions FOR UPDATE TO authenticated USING (
  is_super_admin() OR (organization_id = get_user_org_id() AND get_user_role() IN ('admin','manager'))
);
CREATE POLICY payroll_provisions_delete ON payroll_provisions FOR DELETE TO authenticated USING (
  is_super_admin() OR (organization_id = get_user_org_id() AND get_user_role() IN ('admin','manager'))
);

-- ---------- payroll_employer_cost (costo empleador — admin/manager only en SELECT,
--           el empleado no ve el costo patronal) ----------
CREATE POLICY payroll_employer_cost_select ON payroll_employer_cost FOR SELECT TO authenticated USING (
  is_super_admin() OR (organization_id = get_user_org_id() AND get_user_role() IN ('admin','manager'))
);
CREATE POLICY payroll_employer_cost_insert ON payroll_employer_cost FOR INSERT TO authenticated WITH CHECK (
  is_super_admin() OR (organization_id = get_user_org_id() AND get_user_role() IN ('admin','manager'))
);
CREATE POLICY payroll_employer_cost_update ON payroll_employer_cost FOR UPDATE TO authenticated USING (
  is_super_admin() OR (organization_id = get_user_org_id() AND get_user_role() IN ('admin','manager'))
);
CREATE POLICY payroll_employer_cost_delete ON payroll_employer_cost FOR DELETE TO authenticated USING (
  is_super_admin() OR (organization_id = get_user_org_id() AND get_user_role() IN ('admin','manager'))
);

-- ---------- absence_records (employee ve las suyas; admin/manager todas) ----------
CREATE POLICY absence_records_select ON absence_records FOR SELECT TO authenticated USING (
  is_super_admin() OR (organization_id = get_user_org_id() AND (employee_id = auth.uid() OR get_user_role() IN ('admin','manager')))
);
CREATE POLICY absence_records_insert ON absence_records FOR INSERT TO authenticated WITH CHECK (
  is_super_admin() OR (organization_id = get_user_org_id() AND get_user_role() IN ('admin','manager'))
);
CREATE POLICY absence_records_update ON absence_records FOR UPDATE TO authenticated USING (
  is_super_admin() OR (organization_id = get_user_org_id() AND get_user_role() IN ('admin','manager'))
);
CREATE POLICY absence_records_delete ON absence_records FOR DELETE TO authenticated USING (
  is_super_admin() OR (organization_id = get_user_org_id() AND get_user_role() IN ('admin','manager'))
);

-- ---------- tax_personal_deductions (employee ve las suyas — son sus deducciones tributarias) ----------
CREATE POLICY tax_personal_deductions_select ON tax_personal_deductions FOR SELECT TO authenticated USING (
  is_super_admin() OR (organization_id = get_user_org_id() AND (employee_id = auth.uid() OR get_user_role() IN ('admin','manager')))
);
CREATE POLICY tax_personal_deductions_insert ON tax_personal_deductions FOR INSERT TO authenticated WITH CHECK (
  is_super_admin() OR (organization_id = get_user_org_id() AND get_user_role() IN ('admin','manager'))
);
CREATE POLICY tax_personal_deductions_update ON tax_personal_deductions FOR UPDATE TO authenticated USING (
  is_super_admin() OR (organization_id = get_user_org_id() AND get_user_role() IN ('admin','manager'))
);
CREATE POLICY tax_personal_deductions_delete ON tax_personal_deductions FOR DELETE TO authenticated USING (
  is_super_admin() OR (organization_id = get_user_org_id() AND get_user_role() IN ('admin','manager'))
);

-- ---------- holidays (especial: nacionales con org_id NULL visibles a todos del país) ----------
CREATE POLICY holidays_select ON holidays FOR SELECT TO authenticated USING (
  is_super_admin()
  OR organization_id = get_user_org_id()
  OR (
    organization_id IS NULL
    AND country = (SELECT country FROM organizations WHERE id = get_user_org_id())
  )
);
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

-- ---------- employee_equity_rollups (read-only via RLS; trigger SECURITY DEFINER escribe) ----------
CREATE POLICY employee_equity_rollups_select ON employee_equity_rollups FOR SELECT TO authenticated USING (
  is_super_admin()
  OR (organization_id = get_user_org_id() AND (employee_id = auth.uid() OR get_user_role() IN ('admin','manager')))
);
-- INSERT/UPDATE/DELETE sin policies = bloqueado para authenticated (solo trigger SECURITY DEFINER)

-- ---------- employee_secondary_positions ----------
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

-- ---------- demo_requests (SaaS-wide, sin org_id) ----------
-- INSERT anon (mantener el flow público de /demo-request)
CREATE POLICY demo_requests_insert_public ON demo_requests FOR INSERT TO anon WITH CHECK (true);
-- SELECT/UPDATE: super_admin + admin/manager (cualquier org, son leads SaaS)
CREATE POLICY demo_requests_select_admin ON demo_requests FOR SELECT TO authenticated USING (
  is_super_admin() OR get_user_role() IN ('admin','manager')
);
CREATE POLICY demo_requests_update_admin ON demo_requests FOR UPDATE TO authenticated USING (
  is_super_admin() OR get_user_role() IN ('admin','manager')
) WITH CHECK (
  is_super_admin() OR get_user_role() IN ('admin','manager')
);


-- =============================================================================
-- 12. Promover suv411@hotmail.com a super_admin
-- =============================================================================
-- IMPORTANTE: este UPDATE va DESPUÉS del CHECK profiles_org_required.
-- super_admin → organization_id NULL (constraint permite NULL solo para este rol).
-- También reactivamos is_active porque la cuenta estaba marcada inactiva.
-- admin@apphorarios.com NO se toca: queda como admin de Les Raptors.
UPDATE profiles
  SET role = 'super_admin',
      organization_id = NULL,
      is_active = true
  WHERE email = 'suv411@hotmail.com';


-- =============================================================================
-- 13. Verificación inline
-- =============================================================================
DO $verify$
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
END $verify$;

COMMIT;
