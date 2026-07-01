-- supabase/tests/profile_column_guard.sql
-- Verifica el guard de columnas. Patrón BEGIN ... ROLLBACK (seguro en prod).
BEGIN;

-- Setup mínimo: reutiliza una org existente y un contract_type de esa org.
DO $$
DECLARE
  v_org uuid;
  v_contract uuid;
  v_emp uuid := '11111111-1111-1111-1111-111111111111';
BEGIN
  SELECT id INTO v_org FROM public.organizations LIMIT 1;
  SELECT id INTO v_contract FROM public.contract_types WHERE organization_id = v_org LIMIT 1;

  INSERT INTO public.profiles (id, first_name, last_name, email, role,
                               is_active, is_demo, contract_type_id, is_terminated,
                               is_floater, organization_id, max_hours_per_week)
  VALUES (v_emp, 'Test', 'Empleado', 'test.guard@example.com', 'employee',
          true, false, v_contract, false, false, v_org, 44);
END $$;

-- Simular al empleado autenticado.
SELECT set_config('request.jwt.claims',
  json_build_object('sub', '11111111-1111-1111-1111-111111111111', 'role', 'authenticated')::text,
  true);
SET LOCAL role authenticated;

-- 1) Debe PERMITIR cambiar phone.
UPDATE public.profiles SET phone = '3001234567'
WHERE id = '11111111-1111-1111-1111-111111111111';

-- 2) Debe RECHAZAR escalar a admin.
DO $$
BEGIN
  BEGIN
    UPDATE public.profiles SET role = 'admin'
    WHERE id = '11111111-1111-1111-1111-111111111111';
    RAISE EXCEPTION 'FALLO: el guard permitió cambiar el role';
  EXCEPTION WHEN others THEN
    IF SQLERRM LIKE 'FALLO:%' THEN RAISE; END IF;
    -- El mensaje debe contener 'No puedes modificar'.
    IF SQLERRM NOT LIKE '%No puedes modificar%' THEN
      RAISE EXCEPTION 'FALLO: excepción inesperada: %', SQLERRM;
    END IF;
    RAISE NOTICE 'OK: guard bloqueó el cambio de role (%).', SQLERRM;
  END;
END $$;

-- 3) Debe PERMITIR cambiar first_name (columna en allowlist).
UPDATE public.profiles SET first_name = 'TestNuevo'
WHERE id = '11111111-1111-1111-1111-111111111111';

-- 4) Debe RECHAZAR cambiar organization_id (fuga de tenant).
DO $$
BEGIN
  BEGIN
    UPDATE public.profiles SET organization_id = gen_random_uuid()
    WHERE id = '11111111-1111-1111-1111-111111111111';
    RAISE EXCEPTION 'FALLO: el guard permitió cambiar organization_id';
  EXCEPTION WHEN others THEN
    IF SQLERRM LIKE 'FALLO:%' THEN RAISE; END IF;
    IF SQLERRM NOT LIKE '%No puedes modificar%' THEN
      RAISE EXCEPTION 'FALLO: excepción inesperada: %', SQLERRM;
    END IF;
    RAISE NOTICE 'OK: guard bloqueó el cambio de organization_id (%).', SQLERRM;
  END;
END $$;

RESET role;
ROLLBACK;
