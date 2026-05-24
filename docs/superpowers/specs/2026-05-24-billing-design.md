# Sub-proyecto 6 — Billing: Spec & Design

**Fecha:** 2026-05-24
**Autor:** Simon Urrego (con Claude Opus 4.7)
**Estado:** Spec draft → user review pending → plan

---

## 1. Contexto y objetivo

Tus Horarios es un SaaS multi-tenant para programación de turnos (Colombia). Hoy hay 1 organización (Les Raptors, "LR") en producción con plan `enterprise` y status `active` (grandfathered, sin tarjeta). Sub-proyectos 1-5 implementaron infraestructura email, landing B2B, multi-tenancy, onboarding wizard, subdomain routing. Sub-proyecto 4 dejó el flow de aprobación demo-request → org en trial 30 días, pero el trial **no tiene salida**: no existe forma de convertir trial → active vía pago.

**Objetivo sub-proy 6:** implementar el flow end-to-end `trial → active`, con:
- Integración Wompi como payment processor (PCI offload, recurring vía COF)
- Suscripciones mensuales con planes tier-based configurables en DB
- Manejo de payment failures con grace period 7 días → pause
- Framework multi-provider para factura electrónica DIAN (Alegra MVP + Manual, otros futuros)
- UI admin-only `/facturacion` con tabs Plan, Método de pago, DIAN, Historial
- LR sigue grandfathered (`billing_exempt=true`), no se ve afectada

**Out of scope explícito:**
- Self-serve refunds (V1: super_admin manual)
- Múltiples monedas (solo COP)
- Anual billing (solo monthly)
- Per-seat usage tracking, coupons, descuentos
- Dashboard super_admin de revenue (deferred a sub-proy 7)
- Migración a otro processor (Bold/Stripe) — abstracción facilita pero no se ejecuta
- Múltiples DIAN providers por factura simultánea

---

## 2. Decisiones de diseño (con razones)

| # | Decisión | Razón |
|---|----------|-------|
| D1 | **Self-serve recurring** (no manual invoicing) | SMB Col target; reduce fricción operacional para super_admin |
| D2 | **Wompi** como único processor V1 | Bancolombia ownership, mercado Col, COP nativo, soporta cards + PSE + Nequi (V1 solo cards), fees ~3.49% |
| D3 | **Tiered fixed pricing** (3 planes) | Predecible. Schema ya soporta `starter/pro/enterprise`. Per-employee descartado por complejidad |
| D4 | **Planes en tabla DB configurable** | Edita precios sin redeploy; A/B test pricing post-launch |
| D5 | **Camino B Wompi** (Widget + recurrent flag) | Wompi widget para 1er charge captura tarjeta y devuelve `payment_source_id`. PCI offload total. Charges siguientes via `POST /v1/transactions` con `recurrent: true` |
| D6 | **Grace 7 días** trial-vencido y past-due | Standard SaaS, balanceado. Banner + email reminders. T+7 → status='paused' |
| D7 | **DIAN multi-provider con abstracción** | Cada tenant elige (Alegra/Siigo/FacturaTech/Manual). MVP ships Alegra + Manual. Futuros suman adapters |
| D8 | **Admin-only billing access** | RLS: `is_super_admin() OR (role='admin' AND organization_id matches)`. No nuevo rol `billing_admin` |
| D9 | **LR grandfather con `billing_exempt`** | Mantener LR como está; cron explícitamente skip |
| D10 | **Nuevo sidebar item "Facturación"** | Más prominente que sub-item de Configuración. Icon `CreditCard` |
| D11 | **Híbrida (no Wompi Subscriptions API)** | Vendor-light. Subscription lifecycle es nuestro source of truth; Wompi solo procesa charges puntuales |
| D12 | **Cobro inmediato al agregar tarjeta** (no al `trial_end`) | Elimina edge case "metió tarjeta pero olvidamos cobrarle al fin del trial". Cliente paga "1 mes desde hoy" |

---

## 3. Schema y migraciones

### Migración 046 — `billing_schema.sql`

```sql
-- Plans (configurable por super_admin sin redeploy)
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

-- Payment methods tokenizados (Wompi payment_source_id)
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

-- Subscriptions (1 por org)
CREATE TABLE subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID UNIQUE NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  plan_id TEXT NOT NULL REFERENCES plans(id),
  status TEXT NOT NULL CHECK (status IN ('trialing','active','past_due','paused','canceled')),
  current_period_start TIMESTAMPTZ NOT NULL,
  current_period_end TIMESTAMPTZ NOT NULL,
  cancel_at_period_end BOOLEAN DEFAULT false,
  payment_method_id UUID REFERENCES payment_methods(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX subscriptions_status_idx ON subscriptions(status);
CREATE INDEX subscriptions_period_end_idx ON subscriptions(current_period_end);

-- Invoices (1 por período facturado)
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

-- Payments (intentos; 1 invoice puede tener N)
CREATE TABLE payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  payment_method_id UUID REFERENCES payment_methods(id),
  provider TEXT NOT NULL,                 -- 'wompi'
  provider_transaction_id TEXT UNIQUE,    -- Wompi transaction ID (idempotencia webhook)
  amount_cop INT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending','approved','declined','error','refunded')),
  failure_reason TEXT,
  attempted_at TIMESTAMPTZ DEFAULT now(),
  completed_at TIMESTAMPTZ
);

-- Config DIAN por tenant
CREATE TABLE billing_providers (
  organization_id UUID PRIMARY KEY REFERENCES organizations(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (provider IN ('alegra','siigo','facturatech','manual')),
  config JSONB NOT NULL DEFAULT '{}',     -- cifrado at rest (AES-256-GCM, key en env BILLING_CREDS_ENC_KEY)
  is_active BOOLEAN DEFAULT true,
  configured_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Cambios al schema existente
ALTER TABLE organizations
  ADD COLUMN billing_exempt BOOLEAN DEFAULT false,
  ADD COLUMN current_plan_id TEXT REFERENCES plans(id);

-- Seed 3 planes default (precios placeholder, super_admin ajusta)
INSERT INTO plans (id, name, display_order, price_cop, max_employees, contact_sales) VALUES
  ('starter',    'Starter',    1,  99000,   30, false),
  ('pro',        'Pro',        2, 249000,  100, false),
  ('enterprise', 'Enterprise', 3, 999000, NULL, true);

-- LR grandfather
UPDATE organizations
   SET billing_exempt = true, current_plan_id = 'enterprise'
 WHERE id = '00000000-0000-0000-0000-000000000001';

-- RLS
ALTER TABLE plans              ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_methods    ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions      ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices           ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments           ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing_providers  ENABLE ROW LEVEL SECURITY;

-- plans: SELECT público, WRITE super_admin
CREATE POLICY plans_select_all ON plans FOR SELECT USING (true);
CREATE POLICY plans_modify_super_admin ON plans
  FOR ALL TO authenticated
  USING (is_super_admin()) WITH CHECK (is_super_admin());

-- billing tables: super_admin OR org admin
CREATE POLICY pm_org_admin ON payment_methods FOR ALL TO authenticated
  USING (is_super_admin() OR (get_user_role() = 'admin' AND organization_id = get_user_org_id()))
  WITH CHECK (is_super_admin() OR (get_user_role() = 'admin' AND organization_id = get_user_org_id()));
CREATE POLICY subs_org_admin ON subscriptions FOR ALL TO authenticated
  USING (is_super_admin() OR (get_user_role() = 'admin' AND organization_id = get_user_org_id()))
  WITH CHECK (is_super_admin() OR (get_user_role() = 'admin' AND organization_id = get_user_org_id()));
CREATE POLICY inv_org_admin ON invoices FOR SELECT TO authenticated
  USING (is_super_admin() OR (get_user_role() = 'admin' AND organization_id = get_user_org_id()));
-- invoices WRITE solo via RPC SECURITY DEFINER (cron + webhook handler)
CREATE POLICY pay_org_admin ON payments FOR SELECT TO authenticated
  USING (is_super_admin() OR (
    get_user_role() = 'admin'
    AND EXISTS (SELECT 1 FROM invoices i WHERE i.id = payments.invoice_id AND i.organization_id = get_user_org_id())
  ));
CREATE POLICY bp_org_admin ON billing_providers FOR ALL TO authenticated
  USING (is_super_admin() OR (get_user_role() = 'admin' AND organization_id = get_user_org_id()))
  WITH CHECK (is_super_admin() OR (get_user_role() = 'admin' AND organization_id = get_user_org_id()));
```

**Nota crítica RLS:** `billing_providers.config` JSONB cifrado at rest. La columna SE puede leer (RLS lo permite a admin), pero los valores están cifrados con AES-256-GCM. El descifrado pasa solo server-side en API routes que necesitan la credencial real (ej. emitir factura).

### Regen de types

Después de aplicar la migración:
```bash
# (skill regen-types, project ugkvuinkynvtuiutwlkd)
```

---

## 4. Wompi integration

### 4.1 Tokens de aceptación (Habeas Data Colombia)

**Endpoint:** `GET https://production.wompi.co/v1/merchants/{NEXT_PUBLIC_WOMPI_PUBLIC_KEY}`

Devuelve 2 JWT con `exp`:
- `presigned_acceptance.acceptance_token` + permalink al PDF términos
- `presigned_personal_data_auth.acceptance_token` + permalink PDF datos personales

**Implementación:**
- Endpoint server-side `GET /api/billing/wompi/acceptance`
- Cachea response en memoria del proceso por 50 min (más conservador que `exp` real)
- Devuelve `{ acceptance_token, accept_personal_auth, terms_url, privacy_url }`
- Frontend lo invoca antes de abrir el widget + muestra checkbox obligatorio con links

### 4.2 Widget Wompi para primer charge

**Trigger:** admin va a `/facturacion`, click "Suscribirse al plan Pro", abre dialog con:
- Resumen del plan + precio
- Checkbox "Acepto [términos] y [política]"
- Botón "Pagar y suscribirse"

Al click abre el Widget Wompi configurado con:
```js
{
  publicKey: NEXT_PUBLIC_WOMPI_PUBLIC_KEY,
  currency: 'COP',
  amountInCents: plan.price_cop * 100,
  reference: invoice.id,                     // nuestra invoice
  signatureIntegrity: <hash SHA256 server-side>,
  customerData: { email: admin.email },
  acceptance_token, accept_personal_auth
}
```

**Integrity hash** computado server-side:
```ts
sha256(`${reference}${amountInCents}COP${WOMPI_INTEGRITY_SECRET}`)
```

Endpoint `POST /api/billing/wompi/prepare-checkout` devuelve config completa al frontend.

### 4.3 Webhook handler

**Endpoint:** `POST /api/webhooks/wompi`

Pasos:
1. Lee body raw + header `X-Event-Checksum`
2. Computa HMAC-SHA256 esperado:
   - Concatena valores de campos en `signature.properties` (orden importa)
   - Agrega `timestamp` del payload
   - Agrega `WOMPI_EVENTS_SECRET`
   - Hash SHA256
3. Compara constant-time. Si difiere → 401
4. Parse evento. Solo procesamos `event=transaction.updated`
5. Match payment by `data.transaction.id`
6. UPDATE payments.status. Lógica:
   - **APPROVED**: marcar invoice paid, subscription.current_period_end += 1 mes, encolar emitDianInvoice job, enviar email "Pago confirmado", extraer `payment_source_id` del response y guardar en payment_methods (solo en primer charge)
   - **DECLINED**: payments.failure_reason, invoice.retry_count++, dunning engine decide próximo retry
   - **VOIDED/ERROR**: similar a DECLINED
7. Responder 200

**Idempotencia:** UNIQUE `payments.provider_transaction_id` + Wompi retry policy (30m/3h/24h) → dup webhook = no-op safe.

### 4.4 Charges recurring (cron-driven)

**Endpoint:** `POST /api/cron/billing/process-cycles` (auth `Bearer $CRON_SECRET`)

Schedule en `vercel.ts`: `'0 8 * * *'` (UTC = 03:00 COT diario)

Lógica:
```ts
const subs = await getSubscriptionsDueForCharge(); // current_period_end <= now() AND status='active'

for (const sub of subs) {
  const org = await getOrg(sub.organization_id);
  if (org.billing_exempt) continue;          // LR
  if (!sub.payment_method_id) {              // sin tarjeta
    sub.status = 'past_due'; continue;
  }

  const invoice = await createInvoice(sub);
  const pm = await getPaymentMethod(sub.payment_method_id);
  const result = await wompiCharge({
    payment_source_id: pm.provider_payment_source_id,
    amount_in_cents: invoice.total_cop * 100,
    currency: 'COP',
    reference: invoice.id,
    recurrent: true,                          // COF flag obligatorio
  });

  if (result.status === 'APPROVED') {
    await markInvoicePaid(invoice.id);
    await extendSubscription(sub.id);
    await emitDianInvoiceJob(invoice.id);
  } else if (result.status === 'PENDING') {
    // Esperar webhook
  } else {
    await markInvoiceFailed(invoice.id, result);
    await applyDunningRule(sub.id);
  }
}
```

### 4.5 Env vars nuevas

```
NEXT_PUBLIC_WOMPI_PUBLIC_KEY=pub_prod_xxx
WOMPI_PRIVATE_KEY=prv_prod_xxx
WOMPI_EVENTS_SECRET=xxx
WOMPI_INTEGRITY_SECRET=xxx
CRON_SECRET=<random 32 bytes>
BILLING_CREDS_ENC_KEY=<base64 32 bytes>   # AES-256-GCM key para billing_providers.config
```

Sandbox tiene contrapartes `pub_test_`, `prv_test_`, `test_events_`, `test_integrity_`.

---

## 5. Subscription lifecycle engine

### State machine

```
   ┌─────────────┐
   │  trialing   │ (creado en approve_demo_request)
   └──┬──────┬───┘
      │      │
agrega│      │ trial_ends_at (sin pago)
tarjeta│     ▼
+ pagó│   ┌──────────┐
      │   │ past_due │ ◄──── charge fail (active → past_due)
      ▼   └──┬───┬───┘
   ┌──────────┐  │   │
   │  active  │──┘   │ grace 7d sin payment
   └──┬───────┘      ▼
      │           ┌─────────┐
admin │           │ paused  │
cancel│           └────┬────┘
      ▼                │ admin actualiza tarjeta + paga
   ┌──────────┐        │
   │ canceled │ ◄──────┘ (o cancel desde paused)
   └──────────┘
```

Transiciones permitidas:
- `trialing → active` (admin agrega tarjeta y primer charge APPROVED)
- `trialing → past_due` (trial_ends_at alcanzado sin tarjeta)
- `active → past_due` (charge recurring DECLINED)
- `active → canceled` (admin cancela; toma efecto al period_end)
- `past_due → active` (charge retry o tarjeta nueva → APPROVED)
- `past_due → paused` (grace 7d agotado)
- `paused → active` (admin actualiza tarjeta + primer charge APPROVED)
- `paused → canceled` (admin decide cancelar)

### Dunning engine

Tabla state-machine en `src/lib/billing/dunning.ts`:

| Estado | Día relativo | Acción |
|--------|--------------|--------|
| `trialing` | T-3 | Email "Tu trial vence en 3 días" |
| `trialing` | T-1 | Email "Tu trial vence mañana" |
| `trialing` | T+0 → `past_due` | Subscription transition (no email — banner ya activo) |
| `past_due` | T+1 | Email "No pudimos cobrar, actualiza tarjeta" |
| `past_due` | T+3 | Email recordatorio + retry charge automático |
| `past_due` | T+5 | Último email "Suscripción se pausa en 2 días" |
| `past_due` | T+7 → `paused` | Subscription + org.status='paused'; NO email automático |

Reminders ejecutados por cron `/api/cron/billing/reminders` (schedule `'0 14 * * *'` UTC = 09:00 COT diario). Idempotencia: tabla `sent_reminders (organization_id, day_relative, sent_at)` para no doblar emails.

---

## 6. DIAN multi-provider framework

### 6.1 Abstract interface

```ts
// src/lib/billing/providers/types.ts
export interface BillingProvider {
  emitInvoice(invoice: Invoice, customer: Organization): Promise<EmitResult>;
  voidInvoice(externalId: string): Promise<boolean>;
  getStatus(externalId: string): Promise<'pending' | 'accepted' | 'rejected'>;
}

export type EmitResult = {
  externalId: string;
  pdfUrl: string | null;
  status: 'pending' | 'accepted';
};
```

### 6.2 Adapters

**`AlegraProvider`** (`src/lib/billing/providers/alegra.ts`):
- Config requerida: `{ api_key, email_user, account_id }`
- `emitInvoice`: POST `https://api.alegra.com/api/v1/invoices` con auth `Basic base64(email:api_key)`
- Maneja errores: 401 (creds inválidos), 422 (validación), 500 (Alegra down) → retry
- Devuelve `externalId` (Alegra invoice ID) + `pdfUrl` (CDN Alegra)

**`ManualProvider`** (`src/lib/billing/providers/manual.ts`):
- No-op para emisión externa
- `emitInvoice` retorna `{ externalId: 'manual-' + uuid, pdfUrl: null, status: 'pending' }`
- super_admin sube factura a DIAN manualmente vía su plataforma elegida y marca como `accepted` desde UI futura

**Factory** (`src/lib/billing/providers/index.ts`):
```ts
export async function getProvider(orgId: string): Promise<BillingProvider> {
  const config = await getBillingProviderConfig(orgId);
  if (!config) return new ManualProvider(); // default
  switch (config.provider) {
    case 'alegra': return new AlegraProvider(decryptCreds(config.config));
    case 'manual': return new ManualProvider();
    default: throw new Error(`Unsupported: ${config.provider}`);
  }
}
```

### 6.3 Async emission

Webhook handler de Wompi NO bloquea en DIAN emission:
1. Marca invoice paid
2. Encola job `emitDianInvoice(invoice.id)` (mecanismo: Next.js `after(...)` o pg_cron table)
3. Job ejecuta provider.emitInvoice
4. Si OK: invoice.dian_invoice_id + pdf_url + status='accepted'
5. Si fail: retry exponencial (1m, 5m, 30m). Tras 3 fallos → email super_admin

### 6.4 Encryption de creds

```ts
// src/lib/billing/crypto.ts
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

const KEY = Buffer.from(process.env.BILLING_CREDS_ENC_KEY!, 'base64'); // 32 bytes

export function encryptCreds(plain: Record<string, string>): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', KEY, iv);
  const enc = Buffer.concat([cipher.update(JSON.stringify(plain), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString('base64');
}

export function decryptCreds(encrypted: string): Record<string, string> {
  const buf = Buffer.from(encrypted, 'base64');
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const data = buf.subarray(28);
  const decipher = createDecipheriv('aes-256-gcm', KEY, iv);
  decipher.setAuthTag(tag);
  return JSON.parse(Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8'));
}
```

---

## 7. UI

### 7.1 `/facturacion` (admin only)

4 tabs en una sola page:

**Tab 1 — Plan & Suscripción:**
- Card con plan actual + precio
- "Próximo cobro: 23 jun 2026 — $249.000 COP"
- Estado badge: ● Activa / ● Trial / ● Pago vencido / ● Pausada / ● Cancelada
- Botón "Cambiar plan" → dialog plan picker con 3 cards (Starter/Pro/Enterprise)
  - Si plan tiene `contact_sales=true` (Enterprise): "Contactar ventas" en lugar de "Suscribirse"
- Botón "Cancelar suscripción" → confirma → set `cancel_at_period_end=true` → banner "Cancelarás el 23/06/2026, hasta entonces tienes acceso"

**Tab 2 — Método de pago:**
- Card con tarjeta actual (logo brand + •••• 1234 exp 12/27)
- Botón "Cambiar tarjeta" → abre widget Wompi en modo "update only" (charge $1 COP authorization, reversado)
- Si no hay tarjeta: CTA "Agregar tarjeta" (lleva a flow suscripción)

**Tab 3 — Facturación electrónica:**
- Si configurado: muestra provider + estado ✓ Conectado
- Si no: select dropdown ("Alegra", "Siigo", "FacturaTech", "Manual"), form de creds según provider
- Botón "Guardar" → POST `/api/billing/providers` (cifra creds, valida con un ping al provider)

**Tab 4 — Historial:**
- Tabla con DataTable<Invoice>: Fecha | Plan | Monto | Estado | DIAN | Acción (PDF download)
- Filtros: año, estado
- Botón "Exportar CSV"

### 7.2 Sidebar

Nuevo item en `topNavigation`:
```ts
{ name: "Facturación", href: "/facturacion", icon: CreditCard, roles: ["super_admin", "admin"] }
```

Badge rojo si `subscription.status === 'past_due'` (paralelo a badge demo-requests).

Hook `useBillingStatus(enabled: boolean)` similar a `useDemoRequestsCount`.

### 7.3 Banner global

`<BillingBanner />` montado en `(authenticated)/layout.tsx`:

| Subscription status | Banner | Color | CTA |
|---|---|---|---|
| `trialing` + trial > 7d | (none) | — | — |
| `trialing` + T-3 a T-1 | "Tu trial vence en X días" | amber | "Agregar tarjeta" → /facturacion |
| `past_due` | "No pudimos cobrar tu última factura" | red | "Actualizar tarjeta" → /facturacion |
| `paused` | (handled vía middleware) | — | — |

### 7.4 Middleware bloqueo `paused`

Extender `src/lib/supabase/middleware.ts` con regla R10 (después de R7):

```ts
// R10. Org paused → bloquea TODO excepto /facturacion + /api/* + public paths
if (
  user && profile?.organization_id && 
  subscription?.status === 'paused' &&
  !path.startsWith('/facturacion') &&
  !path.startsWith('/api/') &&
  !pathIsPublic
) {
  return NextResponse.redirect(new URL('/facturacion', request.url));
}
```

Subscription se lee en el mismo join que profile (extender query).

---

## 8. Edge cases

(Resumen de los 14 casos del brainstorming — todos manejados explícitamente en la implementación)

| # | Caso | Solución |
|---|------|----------|
| 1 | Plan change mid-cycle | Toma efecto al siguiente ciclo, sin prorrateo. UI dice "Cambio efectivo desde 23/06" |
| 2 | Empleado exceeds plan max | Soft-warn en N+1, block hard al exceder con CTA "Actualizar plan" |
| 3 | Widget abandonado tab cerrada | Sweep job diario marca invoices `>24h ago, status='open', sin payment APPROVED` como failed |
| 4 | Webhook antes que callback | Idempotente: handler upserts payment row si no existe |
| 5 | Tarjeta expirada | Charge DECLINED reason='expired_card' → past_due → email "Tu tarjeta venció" |
| 6 | Refund | V1: super_admin manual en Wompi dashboard + marca payment.status='refunded' + emite nota crédito DIAN |
| 7 | Cancelación | `cancel_at_period_end=true`, mantiene acceso hasta period_end, después canceled+paused |
| 8 | Wompi retry mismo webhook | UNIQUE `provider_transaction_id` + responder 200 idempotente |
| 9 | DIAN provider down | Retry exponencial 1m/5m/30m, después 3 fallos email super_admin. Charge no se bloquea |
| 10 | LR billing_exempt → migrar a pagador | Manual: super_admin remove flag + create subscription. No automático |
| 11 | COP sin decimales | `amount_in_cents = price_cop * 100`. IVA 19% server-side. Wompi exige integer |
| 12 | Timezones | DB UTC, UI COT (UTC-5). Crons UTC = COT + 5 |
| 13 | Demo aprobado 2 veces | UNIQUE subscription per org + idempotencia en `approve_demo_request` |
| 14 | Concurrent admin agrega 2 tarjetas | UI muestra solo `is_default=true`. Cambio default = un botón |

---

## 9. Testing strategy

### 9.1 Vitest unit (~60-80 tests nuevos)

- `src/lib/billing/engine.test.ts`: `calculateNextPeriodEnd`, `shouldPauseAfterGrace`, `selectInvoiceToCharge`, `isOverEmployeeLimit`, `calculateIva`
- `src/lib/billing/wompi/integrity-hash.test.ts`: vectores conocidos
- `src/lib/billing/wompi/webhook-verify.test.ts`: HMAC válido/inválido, timestamp viejo (replay), missing fields
- `src/lib/billing/dunning.test.ts`: state machine T-3..T+8
- `src/lib/billing/providers/alegra.test.ts`: adapter con fetch mockeado (success, 401, 422, 500)
- `src/lib/billing/providers/manual.test.ts`: no-op behavior
- `src/lib/billing/crypto.test.ts`: encrypt/decrypt round-trip + tampered ciphertext rechazado
- `src/lib/billing/dian-emit-job.test.ts`: retry exponencial, max attempts, alert super_admin

### 9.2 SQL tests (BEGIN/ROLLBACK)

- `supabase/tests/billing_rls_isolation.sql`: admin org A no ve subs/invoices org B
- `supabase/tests/billing_unique_constraints.sql`: payments.provider_transaction_id, subscriptions per org
- `supabase/tests/billing_exempt_skip.sql`: cron SELECT excluye orgs exentas
- `supabase/tests/billing_plans_seed.sql`: 3 planes default presentes
- `supabase/tests/migration_046_schema.sql`: FK válidos, RLS aplicado, indexes presentes

### 9.3 Integration con Wompi sandbox

- `src/lib/billing/wompi/__tests__/integration.test.ts`:
  - Skip si `WOMPI_SANDBOX_PUBLIC` no presente
  - Create payment_source E2E con tarjeta test
  - Charge APPROVED (`4242 4242 4242 4242`)
  - Charge DECLINED (`4242 4242 4242 0002`)
  - Webhook signature válido contra payload conocido

### 9.4 E2E smoke browser (sandbox)

- Setup: org test temp → /facturacion → widget sandbox → tarjeta test → confirma → invoice paid
- past_due: tarjeta declined → banner + email
- Cancel + reactivar

### 9.5 Cron manual testing

```bash
curl -H "Authorization: Bearer $CRON_SECRET" \
  https://staging.tushorarios.com/api/cron/billing/process-cycles
```

### 9.6 Métricas de cobertura

- Engine + dunning + crypto: 100% líneas (lógica pura)
- Adapters: ≥80% (mocks)
- Webhook handler: 100% paths (approved, declined, error, replay, invalid sig)

---

## 10. Rollout

Plan-level (detalle en plan separado). Orden sugerido:

1. **Wompi sandbox account + env vars** (user)
2. **Alegra sandbox account + API key test** (user)
3. **Migration 046 + types regen + SQL tests**
4. **`src/lib/billing/` modules** (crypto, engine, dunning, providers)
5. **Wompi integration** (acceptance, integrity, webhook)
6. **Cron endpoints** (process-cycles, reminders)
7. **DIAN async emit job**
8. **UI `/facturacion` + sidebar + banner**
9. **Middleware R10 paused-block**
10. **Smoke E2E sandbox completo**
11. **Feature flag `BILLING_ENABLED=true` solo para super_admin inicialmente**
12. **Beta con Base Laboral SAS** (primer cliente real post-aprobación)
13. **GA**

Plan timeline estimado: 7-10 días devel + 2-3 testing.

---

## 11. Risks & open questions

| Risk | Mitigación |
|------|------------|
| Wompi sandbox keys del user no listas para empezar | Empezar por DB/engine sin tocar Wompi |
| Alegra API cambia signature | Adapter aislado, fácil ajustar |
| Webhook hose no llega (delivery fail) | Sweep job revisa transacciones PENDING > 1h |
| Reminder emails marcados spam por Hotmail | Subj+body neutros, Resend con DKIM ya configurado |
| Cron Vercel hobbypool limitations | Verificar: producción ya está en plan Pro |
| `payment_source_id` rota en Wompi (rare) | Capturar error específico, marcar `payment_methods.is_active=false`, force re-add |
| DIAN reject por datos faltantes del cliente | Validación en `/facturacion` antes de primer charge: NIT/cedula, razon social, dirección |

**Open questions a confirmar antes de comenzar plan:**
- ¿Vercel plan actual es Pro (cron + queues)? *Asunción: sí, por deploys actuales sin warning*
- ¿Tarjeta test sandbox Wompi disponible (apertura cuenta)? Pre-req de implementación
- ¿NIT del cliente cómo se captura — onboarding wizard ya lo pide?

---

## 12. Documentación referenciada

- Wompi inicio rápido: https://docs.wompi.co/docs/colombia/inicio-rapido/
- Wompi keys: https://docs.wompi.co/docs/colombia/ambientes-y-llaves/
- Wompi payment sources: https://docs.wompi.co/docs/colombia/fuentes-de-pago/
- Wompi eventos: https://docs.wompi.co/docs/colombia/eventos/
- Wompi tokens aceptación: https://docs.wompi.co/docs/colombia/tokens-de-aceptacion/
- Wompi widget: https://docs.wompi.co/docs/colombia/widget-checkout-web/
- Alegra API: https://developer.alegra.com/reference (consulta al implementar)
- Ley 2101 (DIAN factura electrónica): legalmente vigente Col 2026

---

**Spec FIN — listo para review user + plan.**
