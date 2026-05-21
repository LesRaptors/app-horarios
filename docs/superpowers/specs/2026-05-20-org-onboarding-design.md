# Sub-proyecto 4 — Org onboarding (approval + wizard)

> Spec del sub-proyecto 4 de la transformación SaaS multi-tenant de Tus Horarios. Define el flow end-to-end desde que un lead llega vía `/demo-request` hasta que el primer admin del cliente completa el wizard de onboarding y queda operativo en su organización con trial de 30 días.

## 1. Contexto y motivación

Sub-proyecto 3 dejó la infra multi-tenant funcional (organizations, RLS, super_admin), pero **no hay forma de crear nuevas organizations** sin SQL manual. Este sub-proyecto cubre el flow completo de **alta de nuevos clientes** en producción, con modelo **invite-only** (sales-led, no self-serve público).

### Sucesores

- Sub-proy 5: Subdomain routing (`acme.tushorarios.com`) — usa `organizations.slug` generado acá.
- Sub-proy 6: Billing — convierte `trial` → `active` con Wompi/Bold/Stripe.
- Sub-proy 7: Dashboard super-admin completo — la pantalla `/admin/demo-requests` de este sub-proy es la versión mínima.

### Antecedente: bug pendiente

Smoke test del sub-proy 3 detectó **13 archivos** con role checks que excluyen `super_admin`. Se incluye como **Task 0** del plan de este sub-proyecto (precursor) porque sin ese fix, `suv411@hotmail.com` no puede usar la app para debuggear el wizard.

## 2. Decisiones clave

| Decisión | Valor | Razón |
|----------|-------|-------|
| Modelo signup | **Invite-only** (admin approval) | Sales-led, mayor control de calidad de leads, no PLG |
| UI approval | `/admin/demo-requests` mínima | Versión MVP hasta sub-proy 7 |
| Trial | **30 días** | Estándar B2B SMB, suficiente para 1 ciclo completo de nómina |
| Wizard | **6 steps** (empresa, sede, depts, posiciones, turnos, equipo) | Cubre setup mínimo viable |
| Países activos | **Solo CO** | Locked. MX/PE/AR/CL en sub-proy futuro |
| Emails | **2** (Welcome custom Resend + Invite Supabase Auth) | Branding pulido + flow técnico |
| Slug | **Auto + editable** | `suggest_unique_slug()` RPC + input editable antes de confirmar |

## 3. Arquitectura general

```
Visitante → /demo-request (form ya existe)
  ↓
INSERT demo_requests (status='new')
  ↓ [super_admin recibe email notif vía Resend, ya existe]
  ↓
suv411 logueado como super_admin
  ↓
/admin/demo-requests (NUEVO)
  - Lista leads pendientes
  - Click "Aprobar" → modal con datos pre-llenados
  - Form: nombre empresa, slug (auto via RPC), plan, primer admin
  ↓
POST /api/admin/demo-requests/approve
  - RPC approve_demo_request (atómica)
    - INSERT organizations (plan='trial', trial_ends_at=now()+30d)
    - UPDATE demo_requests (status='approved', approved_org_id, approved_at, approved_by)
  - supabase.auth.admin.inviteUserByEmail (Auth)
  - Resend welcome email (si checkbox marcado)
  ↓
Cliente primer admin recibe 2 emails:
  1. Bienvenida custom (Resend) — branding, qué esperar, intro al wizard
  2. Auth invite (Supabase) — link a /auth/set-password
  ↓
Click link → /auth/set-password → setea password → sesión activa
  ↓
Middleware: SELECT organizations.onboarding_completed_at WHERE id=org_id
  - NULL → redirect /onboarding/{onboarding_step || 'empresa'}
  - not null → /dashboard
  ↓
/onboarding wizard (NUEVO, 6 pasos)
  1. /onboarding/empresa — legal_name, NIT, industry
  2. /onboarding/sede — primera location
  3. /onboarding/departments — al menos 1
  4. /onboarding/positions — al menos 1, asociadas a depts
  5. /onboarding/shifts — al menos 1 plantilla turno
  6. /onboarding/team — invitar managers/empleados (skip OK)
  ↓
UPDATE organizations SET onboarding_completed_at=now(), onboarding_step='done'
  → redirect /dashboard
```

## 4. Schema changes (migración 042)

```sql
BEGIN;

-- organizations: tracking de onboarding + audit del approval
ALTER TABLE organizations
  ADD COLUMN onboarding_completed_at TIMESTAMPTZ,
  ADD COLUMN onboarding_step TEXT
    CHECK (onboarding_step IS NULL OR onboarding_step IN
      ('empresa','sede','departments','positions','shifts','team','done')),
  ADD COLUMN welcome_email_sent_at TIMESTAMPTZ,
  ADD COLUMN approved_by UUID REFERENCES profiles(id),
  ADD COLUMN approved_from_demo_request_id UUID REFERENCES demo_requests(id);

-- Les Raptors ya está "onboarded"
UPDATE organizations
  SET onboarding_completed_at = created_at, onboarding_step = 'done'
  WHERE slug = 'les-raptors';

-- demo_requests: audit del approval
ALTER TABLE demo_requests
  ADD COLUMN approved_org_id UUID REFERENCES organizations(id),
  ADD COLUMN approved_at TIMESTAMPTZ,
  ADD COLUMN approved_by UUID REFERENCES profiles(id);

-- Status del demo_request: agregar 'approved'
ALTER TABLE demo_requests DROP CONSTRAINT IF EXISTS demo_requests_status_check;
ALTER TABLE demo_requests ADD CONSTRAINT demo_requests_status_check
  CHECK (status IN ('new','contacted','scheduled','approved','rejected','spam'));

-- RPC atómica para aprobar
CREATE OR REPLACE FUNCTION approve_demo_request(
  p_demo_request_id UUID,
  p_org_name TEXT,
  p_org_slug TEXT,
  p_plan TEXT,
  p_admin_email TEXT,
  p_admin_first_name TEXT,
  p_admin_last_name TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_new_org_id UUID;
BEGIN
  IF NOT is_super_admin() THEN
    RAISE EXCEPTION 'Forbidden: only super_admin can approve demo requests'
      USING ERRCODE='insufficient_privilege';
  END IF;

  INSERT INTO organizations (name, slug, plan, status, trial_ends_at, country)
  VALUES (p_org_name, p_org_slug, p_plan, 'trialing', now() + INTERVAL '30 days', 'CO')
  RETURNING id INTO v_new_org_id;

  UPDATE demo_requests
    SET status='approved',
        approved_org_id=v_new_org_id,
        approved_at=now(),
        approved_by=auth.uid()
  WHERE id=p_demo_request_id;

  UPDATE organizations
    SET approved_by=auth.uid(),
        approved_from_demo_request_id=p_demo_request_id
  WHERE id=v_new_org_id;

  RETURN jsonb_build_object(
    'success', true,
    'organization_id', v_new_org_id,
    'trial_ends_at', (SELECT trial_ends_at FROM organizations WHERE id=v_new_org_id)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.approve_demo_request(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) TO authenticated;

COMMIT;
```

## 5. Pantalla `/admin/demo-requests`

**File**: `src/app/(authenticated)/admin/demo-requests/page.tsx`

### Lista

DataTable con columnas: Fecha, Empresa, Email, Sector, Estado, Acciones. Filtros: status (default "Pendientes" = new+contacted+scheduled), sector, date range, search por nombre/email.

```
Estado posibles: Nuevo · Contactado · Agendado · Aprobado · Rechazado · Spam
Acciones por row (según estado):
  - new/contacted/scheduled → [Aprobar] [Marcar contactado] [Rechazar]
  - approved → link al org creada
  - rejected → mostrar reason si hay
```

### Modal de approval

```
┌─────────────────────────────────────────────────┐
│  Aprobar demo: <Empresa del lead>               │
├─────────────────────────────────────────────────┤
│  Nombre empresa *      [_______________________]│  ← pre-lleno
│  Slug (URL única) *    [______________] ✓ avail │  ← auto via RPC, editable
│  País                  Colombia (CO) — locked   │
│  Plan inicial *        [Trial 30 días ▼]        │
│                                                 │
│  ─── Primer admin ───                           │
│  Email *               [____________________]   │  ← pre-lleno
│  Nombre │ Apellido     [______]│[______]        │
│                                                 │
│  ☑ Enviar email de bienvenida custom (Resend)   │
│  ☑ Enviar invite Supabase Auth (obligatorio)    │
│                                                 │
│  [Cancelar]                  [Aprobar y crear] │
└─────────────────────────────────────────────────┘
```

### Access control

Solo `super_admin` (verificación en page guard + RLS).

### Helper endpoint

`GET /api/admin/demo-requests/check-slug?slug=xxx` → `{ available: bool, suggestion?: string }` (debounce 300ms desde input).

## 6. API route `/api/admin/demo-requests/approve`

**File**: `src/app/api/admin/demo-requests/approve/route.ts`

### Flujo

1. Verificar caller es super_admin (server client + profile check).
2. Validar body con Zod (org_name, slug regex, plan enum, email, first/last name, bool welcome).
3. Llamar RPC `approve_demo_request` (RPC ya enforza super_admin pero defense in depth).
4. Si RPC falla con `23505` (unique violation slug) → HTTP 409 "Slug ya en uso".
5. Llamar `supabase.auth.admin.inviteUserByEmail` con metadata `{ first_name, last_name, role:'admin', organization_id }` + `redirectTo: NEXT_PUBLIC_SITE_URL/auth/set-password`.
6. Si invite falla → marcar org como `status='paused'` para revisión manual + HTTP 500.
7. Si `send_welcome_email=true` → `sendWelcomeEmail()` + UPDATE `welcome_email_sent_at`.
8. Return `{ success, organization_id, user_id, trial_ends_at }`.

### Schema Zod

```typescript
z.object({
  demo_request_id: z.string().uuid(),
  org_name: z.string().min(2).max(100),
  org_slug: z.string().regex(/^[a-z0-9-]+$/).min(3).max(50),
  plan: z.enum(['trial','starter','pro','enterprise']),
  admin_email: z.string().email(),
  admin_first_name: z.string().min(1).max(50),
  admin_last_name: z.string().min(1).max(50),
  send_welcome_email: z.boolean().default(true),
});
```

## 7. Wizard onboarding

### Ruta

`/onboarding/[step]` con state en `organizations.onboarding_step`.

### Steps

| # | Slug | Datos requeridos | Skip-able |
|---|------|------------------|-----------|
| 1 | `empresa` | name (min 2); NIT y industry opcionales | No |
| 2 | `sede` | name (min 2) | No |
| 3 | `departments` | array `[{name}]` ≥ 1 | No |
| 4 | `positions` | array `[{name, department_id, color}]` ≥ 1 | No |
| 5 | `shifts` | array `[{name, start_time, end_time, location_id}]` ≥ 1 | No |
| 6 | `team` | array emails (0+) | **Sí** |

Al completar paso 6 (o saltarlo): `UPDATE onboarding_step='done', onboarding_completed_at=now()` → redirect `/dashboard`.

### Middleware redirect

En `src/middleware.ts`:

```typescript
if (user && profile?.role !== 'super_admin' && pathname.startsWith('/dashboard')) {
  const { data: org } = await supabase
    .from('organizations')
    .select('onboarding_completed_at, onboarding_step')
    .eq('id', profile.organization_id)
    .single();
  if (!org?.onboarding_completed_at) {
    return NextResponse.redirect(
      new URL(`/onboarding/${org?.onboarding_step || 'empresa'}`, request.url)
    );
  }
}
```

Super_admin bypassea el redirect (puede ir directo a /dashboard).

### Layout

Stepper visual top + contenido del step + botón Atrás/Continuar. "Saltar configuración" → marca step como pendiente y va a /dashboard (employees=`is_active=false` o managers se invitan después).

### Componentes

Reuso de los CRUD existentes (`/locations`, `/departments`, etc.) extrayendo el form modal a componente compartido. Cada step renderiza el form correspondiente con `wizardMode={true}` para ajustar copy/UX.

## 8. Emails

### Welcome custom (Resend)

**Template**: `src/emails/welcome-org-admin.tsx` (React Email)

**Subject**: "Bienvenido a Tus Horarios, {firstName}"

**Contenido**:
- Header con logo + brand
- Saludo personalizado
- Mensaje contexto: cuenta creada, 30 días trial, fecha de fin
- 3 bullets "¿Qué hago ahora?": setear password, wizard 6 pasos, primer cuadro en 10 min
- Botón CTA "Establecer mi contraseña" → link Supabase Auth invite
- Footer con contacto

**Sender**: `noreply@tushorarios.com` (FROM_NOREPLY env)

### Auth invite (Supabase)

Email default de Supabase Auth con SMTP custom Hostinger (sub-proy 1). Subject "Confirma tu cuenta". Link a `/auth/set-password`.

### Helper

**File**: `src/lib/emails/send-welcome.ts`

```typescript
export async function sendWelcomeEmail(params: {
  to: string; firstName: string; orgName: string; trialEndsAt: string;
}) {
  await resend.emails.send({
    from: FROM_NOREPLY,
    to: params.to,
    subject: `Bienvenido a Tus Horarios, ${params.firstName}`,
    react: <WelcomeOrgAdminEmail {...params} />,
  });
}
```

## 9. Task 0: Fix super_admin UI guards

### Problema

13 archivos en `src/` tienen `role === 'admin' || role === 'manager'` que excluyen `super_admin`. Resultado: `suv411@hotmail.com` ve sidebar vacío + "No tienes permisos" en `/employees`.

### Helper centralized

**File**: `src/lib/auth/can-manage.ts`

```typescript
export function canManage(role: UserRole | null | undefined): boolean {
  return role === 'super_admin' || role === 'admin' || role === 'manager';
}
export function canAdmin(role: UserRole | null | undefined): boolean {
  return role === 'super_admin' || role === 'admin';
}
export function isSuperAdmin(role: UserRole | null | undefined): boolean {
  return role === 'super_admin';
}
```

### Refactor

Reemplazar role checks en los 13 archivos por `canManage()` / `canAdmin()`. Sidebar también ajustado para incluir super_admin en filtro de nav items.

### Tests

10+ Vitest tests del helper (cubre los 3 roles + null/undefined).

## 10. Testing + verification

### Tests Vitest

- `src/lib/auth/can-manage.test.ts` (10+ tests)
- `src/lib/onboarding/slug-validator.test.ts` (5 tests)
- `src/lib/onboarding/wizard-state.test.ts` (8 tests — transiciones de step)

### Tests SQL

```
supabase/tests/approve_demo_request_test.sql:
  - super_admin aprueba → asserts org+demo_request OK
  - caller NO super_admin → exception
  - slug duplicado → unique violation
```

### Verification end-to-end (manual)

1. Lleno `/demo-request` en landing como empresa test.
2. Como suv411 (super_admin), entro a `/admin/demo-requests`, veo el lead.
3. Aprueba con slug `test-empresa`, email `test@example.com`.
4. SQL check: organizations.plan='trial', trial_ends_at=+30d, status='trialing'.
5. demo_requests.status='approved' con audit fields.
6. Email Resend Welcome llega a inbox.
7. Email Auth llega → `/auth/set-password` funciona.
8. Setear password → sesión activa.
9. Middleware redirige a `/onboarding/empresa`.
10. Completo wizard 6 steps → `/dashboard` con datos.
11. Cleanup: borrar org test al final.

### Métricas de éxito

- Flow completo approval → wizard < 15 min de tiempo del cliente.
- Cero errores 500 en `/api/admin/demo-requests/approve` durante test.
- Cero console errors durante wizard.
- Email Resend Welcome deliverable a inbox (no spam) en cuenta test.

## 11. Edge cases

| Caso | Manejo |
|------|--------|
| Slug duplicado | Endpoint check-slug en vivo + RPC valida (defense in depth). HTTP 409 si falla en RPC. |
| Invite Auth falla | Org queda `status='paused'`. Notif en `/admin/demo-requests`: "invite failed → resend". |
| Welcome email falla | Log error, NO bloquea flow. Auth email es el crítico. |
| Admin cierra browser a mitad del wizard | `onboarding_step` persistido. Middleware reanuda al step guardado. |
| Trial expira (30d) | Sub-proy 6 (billing) lo maneja. Por ahora: status queda `trialing` hasta cambio manual. Cron diario opcional para auto-pausar. |
| Cliente rechazado vuelve a aplicar | Permitido: nuevo demo_request con mismo email. El primer queda `rejected`. |
| Sub-proy 5 cambia dominio email Auth | `redirectTo` usa `NEXT_PUBLIC_SITE_URL`. Cuando active subdomain, ajustamos esa var por org. |

## 12. Out of scope (diferido)

- Cobranza / billing automation → sub-proy 6
- Subdomain routing por org → sub-proy 5
- Multi-país (MX/PE/AR/CL) → sub-proy futuro
- Dashboard super-admin completo (métricas, churn, MRR) → sub-proy 7
- Self-serve signup público → sub-proy 8+ (si decisión cambia)
- Cron auto-pause trial expirado → sub-proy 6
- i18n / multi-idioma → sub-proy avanzado

## 13. Rollback

Si algo sale mal post-merge:
- Migración 042 es aditiva (solo ADD COLUMN + nueva RPC). Rollback fácil con `ALTER TABLE DROP COLUMN`.
- API route nueva — solo borrar.
- Middleware redirect: si rompe algo, comentar el bloque del wizard hasta arreglar.
- Wizard pages: si bugean, marcar org como `onboarding_completed_at=now()` manualmente vía SQL para skipear.

---

## Notas

- Email Resend Welcome es opcional via checkbox del modal — si está prendido, se envía. Default `true`.
- Sub-proy 5 (subdomain routing) heredará `organizations.slug` ya validado en este sub-proy.
- Sub-proy 7 (dashboard super-admin) reemplazará la pantalla `/admin/demo-requests` mínima con UI completa.
- Performance: la lista de demo_requests pagina a 20. Si supera ese volumen sin sub-proy 7, agregar filtros server-side.
