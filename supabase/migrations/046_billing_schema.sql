-- Migration 046: Billing schema (sub-proyecto 6)
--
-- ¿Qué hace?
--   - Crea 6 tablas billing: plans, payment_methods, subscriptions, invoices,
--     payments, billing_providers.
--   - Agrega organizations.billing_exempt + organizations.current_plan_id.
--   - Seed 3 planes default (starter $99k, pro $249k, enterprise $999k).
--   - Marca Les Raptors como grandfathered (billing_exempt=true, plan=enterprise).
--   - Habilita RLS en las 6 tablas con policies admin-only scoped a organization_id
--     vía get_user_org_id() (super_admin bypass).
--
-- ¿Por qué?
--   Sub-proy 6 implementa el flow trial → active con Wompi (payment processor) +
--   DIAN multi-provider (factura electrónica). Schema es source of truth del
--   lifecycle de suscripción; Wompi solo procesa charges puntuales (estrategia
--   "vendor-light"). LR grandfathered → cron explícitamente skip.
--
-- Side effects:
--   - Regenerar src/lib/supabase/database.types.ts (vía /regen-types)
--   - Actualizar src/lib/types.ts con interfaces Plan, Subscription, Invoice,
--     Payment, PaymentMethod, BillingProviderConfig.

BEGIN;

-- ============================================================
-- 1. plans — configurable por super_admin sin redeploy
-- ============================================================
CREATE TABLE plans (
  id TEXT PRIMARY KEY,                    -- 'starter', 'pro', 'enterprise'
  name TEXT NOT NULL,
  display_order INT NOT NULL,
  price_cop INT NOT NULL,                 -- ej. 99000 = $99k COP/mes
  max_employees INT,                      -- NULL = ilimitado
  features JSONB DEFAULT '{}',
  is_active BOOLEAN DEFAULT true,
  contact_sales BOOLEAN DEFAULT false,    -- enterprise = true (no auto-checkout)
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- 2. payment_methods — tokens Wompi (PCI offload)
-- ============================================================
CREATE TABLE payment_methods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,                 -- 'wompi'
  provider_payment_source_id TEXT NOT NULL,  -- Wompi payment_source ID
  card_brand TEXT,                        -- 'VISA' | 'MASTERCARD' | ...
  card_last4 TEXT,
  card_exp_month INT CHECK (card_exp_month BETWEEN 1 AND 12),
  card_exp_year INT CHECK (card_exp_year >= 2026),
  is_default BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (organization_id, provider_payment_source_id)
);

-- ============================================================
-- 3. subscriptions — 1 por org
-- ============================================================
CREATE TABLE subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID UNIQUE NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  plan_id TEXT NOT NULL REFERENCES plans(id),
  status TEXT NOT NULL CHECK (status IN ('trialing','active','past_due','paused','canceled')),
  current_period_start TIMESTAMPTZ NOT NULL,
  current_period_end TIMESTAMPTZ NOT NULL,
  cancel_at_period_end BOOLEAN DEFAULT false,
  payment_method_id UUID REFERENCES payment_methods(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX subscriptions_status_idx ON subscriptions(status);
CREATE INDEX subscriptions_period_end_idx ON subscriptions(current_period_end);

-- ============================================================
-- 4. invoices — 1 por período facturado
-- ============================================================
CREATE TABLE invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  subscription_id UUID NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,
  plan_id TEXT NOT NULL REFERENCES plans(id),
  period_start TIMESTAMPTZ NOT NULL,
  period_end TIMESTAMPTZ NOT NULL,
  amount_cop INT NOT NULL,                -- precio sin IVA
  iva_cop INT NOT NULL DEFAULT 0,         -- 19% Col
  total_cop INT NOT NULL,                 -- amount + iva
  status TEXT NOT NULL CHECK (status IN ('draft','open','paid','failed','void')),
  due_date TIMESTAMPTZ NOT NULL,
  paid_at TIMESTAMPTZ,
  dian_provider TEXT,                     -- 'alegra'|'siigo'|'manual'|NULL
  dian_invoice_id TEXT,
  dian_pdf_url TEXT,
  dian_status TEXT CHECK (dian_status IN ('pending','accepted','rejected') OR dian_status IS NULL),
  retry_count INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX invoices_org_status_idx ON invoices(organization_id, status);
CREATE INDEX invoices_subscription_id_idx ON invoices(subscription_id);

-- ============================================================
-- 5. payments — intentos; 1 invoice puede tener N
-- ============================================================
CREATE TABLE payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  payment_method_id UUID REFERENCES payment_methods(id) ON DELETE SET NULL,
  provider TEXT NOT NULL,                 -- 'wompi'
  provider_transaction_id TEXT UNIQUE,    -- Wompi transaction ID (idempotencia webhook)
  amount_cop INT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending','approved','declined','error','refunded')),
  failure_reason TEXT,
  attempted_at TIMESTAMPTZ DEFAULT now(),
  completed_at TIMESTAMPTZ
);
CREATE INDEX payments_invoice_id_idx ON payments(invoice_id);
CREATE INDEX payment_methods_org_id_idx ON payment_methods(organization_id);

-- ============================================================
-- 6. billing_providers — config DIAN por tenant
-- ============================================================
CREATE TABLE billing_providers (
  organization_id UUID PRIMARY KEY REFERENCES organizations(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (provider IN ('alegra','siigo','facturatech','manual')),
  config JSONB NOT NULL DEFAULT '{}',     -- cifrado at rest (AES-256-GCM, key en env BILLING_CREDS_ENC_KEY)
  is_active BOOLEAN DEFAULT true,
  configured_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- 7. Cambios al schema existente: organizations
-- ============================================================
ALTER TABLE organizations
  ADD COLUMN billing_exempt BOOLEAN DEFAULT false,
  ADD COLUMN current_plan_id TEXT REFERENCES plans(id);

-- ============================================================
-- 8. Seed 3 planes default (precios placeholder, super_admin ajusta)
-- ============================================================
INSERT INTO plans (id, name, display_order, price_cop, max_employees, contact_sales) VALUES
  ('starter',    'Starter',    1,  99000,   30, false),
  ('pro',        'Pro',        2, 249000,  100, false),
  ('enterprise', 'Enterprise', 3, 999000, NULL, true);

-- ============================================================
-- 9. LR grandfather (billing_exempt=true, plan=enterprise)
-- ============================================================
UPDATE organizations
   SET billing_exempt = true, current_plan_id = 'enterprise'
 WHERE id = '00000000-0000-0000-0000-000000000001';

-- ============================================================
-- 10. RLS — habilitar en las 6 tablas nuevas
-- ============================================================
ALTER TABLE plans              ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_methods    ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions      ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices           ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments           ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing_providers  ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 11. Policies
-- ============================================================

-- plans: SELECT público (cualquier authenticated puede ver el catálogo),
-- WRITE solo super_admin
CREATE POLICY plans_select_all ON plans FOR SELECT USING (true);
CREATE POLICY plans_modify_super_admin ON plans
  FOR ALL TO authenticated
  USING (is_super_admin()) WITH CHECK (is_super_admin());

-- payment_methods: super_admin OR org admin
CREATE POLICY pm_org_admin ON payment_methods FOR ALL TO authenticated
  USING (is_super_admin() OR (get_user_role() = 'admin' AND organization_id = get_user_org_id()))
  WITH CHECK (is_super_admin() OR (get_user_role() = 'admin' AND organization_id = get_user_org_id()));

-- subscriptions: super_admin OR org admin
CREATE POLICY subs_org_admin ON subscriptions FOR ALL TO authenticated
  USING (is_super_admin() OR (get_user_role() = 'admin' AND organization_id = get_user_org_id()))
  WITH CHECK (is_super_admin() OR (get_user_role() = 'admin' AND organization_id = get_user_org_id()));

-- invoices: solo SELECT desde cliente. WRITE solo via RPC SECURITY DEFINER
-- (cron + webhook handler usan service_role).
CREATE POLICY inv_org_admin ON invoices FOR SELECT TO authenticated
  USING (is_super_admin() OR (get_user_role() = 'admin' AND organization_id = get_user_org_id()));

-- payments: solo SELECT desde cliente (cascada por invoice). WRITE solo service_role.
CREATE POLICY pay_org_admin ON payments FOR SELECT TO authenticated
  USING (is_super_admin() OR (
    get_user_role() = 'admin'
    AND EXISTS (SELECT 1 FROM invoices i WHERE i.id = payments.invoice_id AND i.organization_id = get_user_org_id())
  ));

-- billing_providers: super_admin OR org admin (config DIAN)
CREATE POLICY bp_org_admin ON billing_providers FOR ALL TO authenticated
  USING (is_super_admin() OR (get_user_role() = 'admin' AND organization_id = get_user_org_id()))
  WITH CHECK (is_super_admin() OR (get_user_role() = 'admin' AND organization_id = get_user_org_id()));

-- ============================================================
-- 12. Triggers updated_at (función set_updated_at definida en migración 039)
-- ============================================================
CREATE TRIGGER subscriptions_set_updated_at
  BEFORE UPDATE ON subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER invoices_set_updated_at
  BEFORE UPDATE ON invoices
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER plans_set_updated_at
  BEFORE UPDATE ON plans
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER billing_providers_set_updated_at
  BEFORE UPDATE ON billing_providers
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

COMMIT;
