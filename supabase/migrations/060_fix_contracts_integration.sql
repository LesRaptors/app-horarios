-- Migration 060: fixes de integración del lote de contratos (hallazgos code-review)
--
-- ¿Qué hace?
--   1. Backfill: siembra los 5 contratos base a organizaciones existentes que
--      quedaron sin ningún contract_type (creadas antes de la 058). Sin esto,
--      con el tipo de contrato obligatorio (Pieza 2), sus admins no pueden
--      crear/invitar empleados (el Select queda vacío).
--   2. handle_new_user asigna el "Sin definir" de la ORG del profile, en vez de
--      caer al DEFAULT de columna (UUID global de Les Raptors = cross-tenant).
--   3. Backfill: corrige profiles existentes cuyo contract_type_id apunta a un
--      contrato de OTRA org, reasignándoles el "Sin definir" de su propia org.
--
-- ¿Por qué?
--   La 058 solo sembraba vía trigger AFTER INSERT (orgs futuras); las orgs ya
--   existentes y los profiles ya creados quedaron inconsistentes.

BEGIN;

-- 1. Backfill de contratos a orgs sin ninguno
DO $$
DECLARE
  o RECORD;
BEGIN
  FOR o IN
    SELECT org.id
    FROM organizations org
    WHERE NOT EXISTS (
      SELECT 1 FROM contract_types ct WHERE ct.organization_id = org.id
    )
  LOOP
    PERFORM seed_default_contract_types(o.id);
  END LOOP;
END $$;

-- 2. handle_new_user resuelve el "Sin definir" de la org del profile
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $handle_new_user$
DECLARE
  meta_role TEXT;
  meta_org_id UUID;
  v_contract_id UUID;
BEGIN
  meta_role := COALESCE(NEW.raw_user_meta_data->>'role', 'employee');
  meta_org_id := (NEW.raw_user_meta_data->>'organization_id')::UUID;

  IF meta_role != 'super_admin' AND meta_org_id IS NULL THEN
    RAISE EXCEPTION 'organization_id is required in user_metadata for role %', meta_role;
  END IF;

  -- "Sin definir" de la org del profile; fallback al default global histórico.
  v_contract_id := COALESCE(
    (SELECT id FROM contract_types
       WHERE organization_id = meta_org_id AND name = 'Sin definir' LIMIT 1),
    '00000000-0000-0000-0000-000000000001'
  );

  INSERT INTO public.profiles
    (id, first_name, last_name, email, role, organization_id, contract_type_id)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'first_name', ''),
    COALESCE(NEW.raw_user_meta_data->>'last_name', ''),
    NEW.email,
    meta_role,
    meta_org_id,
    v_contract_id
  );

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE LOG 'handle_new_user failed for user %: %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$handle_new_user$;

-- 3. Backfill de profiles con contract_type_id cross-org
UPDATE profiles p
SET contract_type_id = (
  SELECT ct.id FROM contract_types ct
  WHERE ct.organization_id = p.organization_id AND ct.name = 'Sin definir'
  LIMIT 1
)
WHERE p.organization_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM contract_types ct
    WHERE ct.id = p.contract_type_id AND ct.organization_id = p.organization_id
  )
  AND EXISTS (
    SELECT 1 FROM contract_types ct
    WHERE ct.organization_id = p.organization_id AND ct.name = 'Sin definir'
  );

COMMIT;
