-- Migration 058: contract_types per-org + seed automático en orgs nuevas
--
-- ¿Qué hace?
--   - Cambia UNIQUE(name) global -> UNIQUE(organization_id, name).
--   - Crea seed_default_contract_types(org) que siembra 5 tipos base en español.
--   - Trigger AFTER INSERT ON organizations que llama al seed para toda org nueva.
--
-- ¿Por qué?
--   Hoy las orgs nuevas nacen sin ningún tipo de contrato; el UNIQUE global
--   impedía que dos orgs tuvieran el mismo nombre.

BEGIN;

-- 1. UNIQUE per-org
ALTER TABLE contract_types DROP CONSTRAINT IF EXISTS contract_types_name_key;
ALTER TABLE contract_types
  ADD CONSTRAINT contract_types_org_name_key UNIQUE (organization_id, name);

-- 2. Función de seed (idempotente)
CREATE OR REPLACE FUNCTION seed_default_contract_types(p_org_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO contract_types
    (name, description, weekly_hours_mode, weekly_hours, is_healthcare,
     available_sundays, available_holidays, available_nights, organization_id)
  VALUES
    ('Sin definir', 'Tipo por defecto. El admin debe asignar un tipo real.',
       'full', NULL, false, true, true, true, p_org_id),
    ('Tiempo completo', 'Jornada completa (44h Ley 2101).',
       'full', NULL, false, true, true, true, p_org_id),
    ('Medio tiempo', 'Jornada parcial.',
       'partial', 24, false, true, true, true, p_org_id),
    ('Fin de semana', 'Cubre sábados y domingos.',
       'partial', 24, false, true, true, false, p_org_id),
    ('Asistencial tiempo completo', 'Personal sanitario, 12h/día.',
       'full', NULL, true, true, true, true, p_org_id)
  ON CONFLICT (organization_id, name) DO NOTHING;
END;
$$;

-- 3. Trigger: sembrar al crear una org
CREATE OR REPLACE FUNCTION trg_seed_contract_types_fn()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM seed_default_contract_types(NEW.id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_seed_contract_types ON organizations;
CREATE TRIGGER trg_seed_contract_types
  AFTER INSERT ON organizations
  FOR EACH ROW EXECUTE FUNCTION trg_seed_contract_types_fn();

COMMIT;
