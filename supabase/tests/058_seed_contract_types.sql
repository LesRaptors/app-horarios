-- Test 058: crear una org siembra 5 contratos base en español.
BEGIN;

INSERT INTO organizations (name, slug, plan, status, country)
VALUES ('Test Seed Org', 'test-seed-org-xyz', 'starter', 'trialing', 'CO');

DO $$
DECLARE
  v_org UUID;
  v_count INT;
BEGIN
  SELECT id INTO v_org FROM organizations WHERE slug = 'test-seed-org-xyz';

  SELECT count(*) INTO v_count FROM contract_types WHERE organization_id = v_org;
  ASSERT v_count = 5, format('Esperaba 5 contratos base, obtuve %s', v_count);

  ASSERT EXISTS (SELECT 1 FROM contract_types
    WHERE organization_id = v_org AND name = 'Tiempo completo'),
    'Falta Tiempo completo';
  ASSERT EXISTS (SELECT 1 FROM contract_types
    WHERE organization_id = v_org AND name = 'Fin de semana' AND available_nights = false),
    'Fin de semana debe tener available_nights = false';
END $$;

ROLLBACK;
