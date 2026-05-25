-- =============================================================================
-- Test: plans seed data
-- Valida que los 3 planes default fueron seedeados con precios > 0 y que
-- 'enterprise' tiene contact_sales=true (no auto-checkout).
--
-- Ejecutar DESPUÉS de aplicar migration 046.
-- Pattern: BEGIN ... ROLLBACK (read-only, ROLLBACK por convención).
-- =============================================================================

BEGIN;

-- =============================================================================
-- Test 1: los 3 planes esperados existen
-- =============================================================================
DO $$
DECLARE v_count INT;
BEGIN
  SELECT COUNT(*) INTO v_count FROM plans
   WHERE id IN ('starter','pro','enterprise');
  IF v_count <> 3 THEN
    RAISE EXCEPTION 'FAIL test 1: % planes encontrados (esperado 3)', v_count;
  END IF;
  RAISE NOTICE 'PASS test 1: los 3 planes (starter, pro, enterprise) existen';
END $$;

-- =============================================================================
-- Test 2: los 3 planes tienen price_cop > 0
-- =============================================================================
DO $$
DECLARE bad_plan TEXT;
BEGIN
  SELECT id INTO bad_plan FROM plans
   WHERE id IN ('starter','pro','enterprise') AND price_cop <= 0
   LIMIT 1;
  IF bad_plan IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL test 2: plan "%" tiene price_cop <= 0', bad_plan;
  END IF;
  RAISE NOTICE 'PASS test 2: los 3 planes tienen price_cop > 0';
END $$;

-- =============================================================================
-- Test 3: 'enterprise' tiene contact_sales=true
-- =============================================================================
DO $$
DECLARE v_contact_sales BOOLEAN;
BEGIN
  SELECT contact_sales INTO v_contact_sales FROM plans WHERE id='enterprise';
  IF v_contact_sales IS NOT TRUE THEN
    RAISE EXCEPTION 'FAIL test 3: enterprise.contact_sales = % (esperado true)', v_contact_sales;
  END IF;
  RAISE NOTICE 'PASS test 3: enterprise.contact_sales = true';
END $$;

-- =============================================================================
-- Test 4: starter y pro tienen contact_sales=false (auto-checkout)
-- =============================================================================
DO $$
DECLARE
  v_starter_cs BOOLEAN;
  v_pro_cs BOOLEAN;
BEGIN
  SELECT contact_sales INTO v_starter_cs FROM plans WHERE id='starter';
  SELECT contact_sales INTO v_pro_cs FROM plans WHERE id='pro';

  IF v_starter_cs IS NOT FALSE THEN
    RAISE EXCEPTION 'FAIL test 4a: starter.contact_sales = % (esperado false)', v_starter_cs;
  END IF;
  IF v_pro_cs IS NOT FALSE THEN
    RAISE EXCEPTION 'FAIL test 4b: pro.contact_sales = % (esperado false)', v_pro_cs;
  END IF;

  RAISE NOTICE 'PASS test 4: starter y pro permiten auto-checkout (contact_sales=false)';
END $$;

-- =============================================================================
-- Test 5: display_order es único e incremental (1, 2, 3)
-- =============================================================================
DO $$
DECLARE
  v_starter_order INT;
  v_pro_order INT;
  v_enterprise_order INT;
BEGIN
  SELECT display_order INTO v_starter_order    FROM plans WHERE id='starter';
  SELECT display_order INTO v_pro_order        FROM plans WHERE id='pro';
  SELECT display_order INTO v_enterprise_order FROM plans WHERE id='enterprise';

  IF NOT (v_starter_order < v_pro_order AND v_pro_order < v_enterprise_order) THEN
    RAISE EXCEPTION 'FAIL test 5: display_order no es ascendente (starter=%, pro=%, enterprise=%)',
      v_starter_order, v_pro_order, v_enterprise_order;
  END IF;
  RAISE NOTICE 'PASS test 5: display_order ascendente (starter=%, pro=%, enterprise=%)',
    v_starter_order, v_pro_order, v_enterprise_order;
END $$;

-- =============================================================================
-- Test 6: max_employees consistente con tier (starter=30, pro=100, enterprise=NULL)
-- =============================================================================
DO $$
DECLARE
  v_starter_max INT;
  v_pro_max INT;
  v_enterprise_max INT;
BEGIN
  SELECT max_employees INTO v_starter_max    FROM plans WHERE id='starter';
  SELECT max_employees INTO v_pro_max        FROM plans WHERE id='pro';
  SELECT max_employees INTO v_enterprise_max FROM plans WHERE id='enterprise';

  IF v_starter_max <> 30 THEN
    RAISE EXCEPTION 'FAIL test 6a: starter.max_employees = % (esperado 30)', v_starter_max;
  END IF;
  IF v_pro_max <> 100 THEN
    RAISE EXCEPTION 'FAIL test 6b: pro.max_employees = % (esperado 100)', v_pro_max;
  END IF;
  IF v_enterprise_max IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL test 6c: enterprise.max_employees = % (esperado NULL=ilimitado)', v_enterprise_max;
  END IF;

  RAISE NOTICE 'PASS test 6: max_employees correcto (starter=30, pro=100, enterprise=NULL)';
END $$;

ROLLBACK;

SELECT 'All 6 billing_plans_seed tests PASSED' AS result;
