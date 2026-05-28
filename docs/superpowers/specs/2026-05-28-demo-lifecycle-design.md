# Sub-proyecto 8 — Endurecimiento del ciclo de vida de solicitudes de demo

**Fecha:** 2026-05-28
**Estado:** Diseño aprobado (brainstorming). Pendiente: plan de implementación.

## 1. Problema

El flujo de "solicitudes de demo" (leads del landing) tiene gaps que ya causan ruido y un riesgo real en producción:

1. **Sin detección de duplicados.** El mismo email puede solicitar demo infinitas veces. Caso real: `ceobaselab@gmail.com` ya tiene la org `base-laboral-sas` (trial hasta 23/6, con cuenta y `auth.user`) pero volvió a solicitar el 26/5 y 28/5; ambas quedaron como "Nuevo" pendientes. La persona casi seguro no recuerda que ya tiene cuenta.
2. **Riesgo de "org zombie".** Si el super_admin aprueba una solicitud de un email que ya tiene cuenta, el RPC crea una segunda organización, el `inviteUserByEmail` falla ("usuario ya existe"), la org queda `paused` huérfana y el admin recibe un 500 confuso. No hay validación que lo prevenga.
3. **Vigencia sin efecto.** Al aprobar se setea `organizations.trial_ends_at = now()+30d`, pero **no se crea fila en `subscriptions`** (hay 0 en la BD). Los recordatorios de fin de trial (T-3, T-1) y la expiración del dunning operan sobre `subscriptions`, así que **nunca se disparan**. Con `BILLING_ENABLED=false` además nada expira.
4. **Trazabilidad invisible.** Existen `approved_by`, `approved_at`, `approved_org_id`, pero la UI solo muestra "→ Org creada". `contacted_at` nunca se actualiza. `notes` no tiene UI.

## 2. Objetivo

Que el ciclo de vida de un lead sea robusto y claro: detectar duplicados y guiar a la persona que ya tiene cuenta, impedir orgs zombie, dejar la facturación lista para expirar trials, y exponer la trazabilidad.

## 3. Decisiones aprobadas (brainstorming)

- **Email con cuenta en el landing** → mensaje **directo**: "Ya tienes una cuenta" + Iniciar sesión + Recuperar contraseña.
- **Solicitud pendiente duplicada** → **deduplicar** (actualizar la existente, no crear otra).
- **Aprobar email con cuenta** → **bloquear** + ofrecer **"Reenviar acceso"** (recuperar contraseña).

## 4. Diseño técnico

### 4.1 Detección de duplicados en el landing (`POST /api/demo-requests`)

Toda la lógica vive **dentro del endpoint existente** (que ya usa `createAdminClient()` service_role y tiene rate-limit de 5/hora por IP — esto contiene el riesgo de enumeración de emails). Tras validar Zod + honeypot, antes de insertar:

1. **¿El email tiene cuenta?** `SELECT 1 FROM profiles WHERE lower(email) = lower(p_email)`. Si existe → no inserta; responde `{ outcome: "existing_account" }`.
2. **¿Hay solicitud pendiente** (`status IN ('new','contacted','scheduled')`) con ese email? → **dedupe**: `UPDATE` esa fila con los datos nuevos (`nombre, empresa, telefono, sector, mensaje, updated_at = now()`); responde `{ outcome: "duplicate_pending" }`. (No reenvía el email de confirmación para no spamear; opcional.)
3. **Si no** → `INSERT` + emails actuales; responde `{ outcome: "created" }`.

> Requiere columna `demo_requests.updated_at` (TIMESTAMPTZ DEFAULT now()) — no existe hoy. Se agrega en la migración (§4.5) con trigger `set_updated_at` (patrón existente del repo).

La decisión del `outcome` se extrae a una **función pura** `classifyDemoSubmission(hasAccount: boolean, pendingRequestId: string | null): DemoOutcome` para testear sin DB.

### 4.2 `DemoForm` reacciona al outcome

`src/components/landing/DemoForm.tsx` interpreta el `outcome` de la respuesta:
- `created` → mensaje de éxito actual ("Te contactaremos pronto").
- `existing_account` → bloque: "Parece que ya tienes una cuenta en Tus Horarios" + enlaces **Iniciar sesión** (`/login`) y **¿Olvidaste tu contraseña?** (`/forgot-password`).
- `duplicate_pending` → "Ya recibimos tu solicitud, te contactaremos pronto."

(UI construida respetando `modern-web-guidance`.)

### 4.3 Guard + "Reenviar acceso" en el panel admin

- **Aprobación** (`POST /api/admin/demo-requests/approve`): antes de llamar el RPC, `SELECT 1 FROM profiles WHERE lower(email)=lower(admin_email)`. Si existe → responde `409` con `{ error, existingOrg: { name, slug, trial_ends_at } }`. Nunca se crea la org zombie. El diálogo muestra el error y un botón **"Reenviar acceso"**.
- **Tabla de pendientes** (`/admin/demo-requests`): la página hace una query que marca qué emails visibles ya tienen `profile`. Para esas filas, en vez de `[Aprobar]` muestra un badge **"Ya tiene cuenta"** + botones **Reenviar acceso** y **Descartar** (marca la solicitud como `spam`/descartada).
- **Reenviar acceso**: nuevo route `POST /api/admin/demo-requests/resend-access` (guard super_admin) que ejecuta `adminSupabase.auth.resetPasswordForEmail(email, { redirectTo: <root>/auth/set-password })`. La persona recibe el link para recuperar/activar su contraseña.

### 4.4 Vigencia real: crear `subscription` al aprobar

Dentro del RPC `approve_demo_request` (nueva migración que lo redefine), tras crear la org, **insertar en `subscriptions`**:
- `organization_id` = la org nueva, `status = 'trialing'`, `current_period_start = now()`, `current_period_end = trial_ends_at` (now()+30d), `plan_id = <plan real>`.
- **Matiz del plan:** `subscriptions.plan_id` es FK a `plans` (seed: `starter`/`pro`/`enterprise`). El diálogo de aprobación hoy ofrece `trial/starter/pro/enterprise`. Resolución: si el plan elegido no existe en `plans` (p. ej. "trial"), usar `'starter'` por defecto para la subscription (el `status='trialing'` ya representa la prueba; el `plan_id` es el plan que tendrá al pagar). Alternativamente, quitar "trial" de las opciones del diálogo y exigir un plan real. Se decide en el plan; preferencia: default a `starter`.
- Con `BILLING_ENABLED=false` esto es data inerte y correcta; cuando se encienda, el dunning procesa la subscription (recordatorios + expiración).

### 4.5 Migración

Nueva migración (`056_demo_lifecycle.sql`):
- `ALTER TABLE demo_requests ADD COLUMN updated_at TIMESTAMPTZ NOT NULL DEFAULT now();` + trigger `set_updated_at`.
- Redefinir `approve_demo_request` para insertar la fila de `subscriptions` (atómico con la creación de la org). Resto del comportamiento intacto.
- (Opcional) índice funcional `lower(email)` en `profiles` y `demo_requests` si las búsquedas lo justifican (perf marginal a este volumen; evaluar en el plan).

### 4.6 Trazabilidad visible

- **Vista de detalle** de una solicitud (al hacer clic en la fila o un botón "Ver"): muestra todos los datos + para aprobadas: quién aprobó (`approved_by` → nombre), `approved_at`, **link a la org** (`/super-admin` o la org), estado del trial (`trial_ends_at`), y `welcome_email_sent_at`.
- **`contacted_at`**: al marcar "Contactado", el `markStatus` setea `contacted_at = now()` además del status.
- **`notes`**: textarea editable en el detalle, persistida en `demo_requests.notes`.

### 4.7 Limpieza puntual

Marcar las 2 solicitudes pendientes duplicadas de `ceobaselab@gmail.com` (26/5, 28/5) como descartadas (`status='spam'`), ya que su email tiene la org `base-laboral-sas`. Vía `UPDATE` puntual (no migración de schema).

## 5. No-objetivos (YAGNI)

- Migrar el rate-limit a Redis (sigue in-memory; riesgo bajo al volumen actual).
- Tabla de auditoría dedicada (los campos denormalizados bastan).
- Forzar que el `admin_email` sea igual al email del solicitante (el super_admin puede editarlo a propósito).
- Encender billing / cambiar `BILLING_ENABLED` (separado).

## 6. Testing

- **Vitest**: `classifyDemoSubmission` (los 3 outcomes).
- **SQL tests** (`BEGIN…ROLLBACK`): `approve_demo_request` crea la subscription `trialing` con `current_period_end = trial_ends_at`; el guard de email existente (a nivel API se testea en smoke).
- **Smoke E2E** en preview:
  1. Solicitar demo con email nuevo → `created`.
  2. Re-solicitar con `ceobaselab@gmail.com` → "ya tienes cuenta" + enlaces login/recuperar; no se crea fila.
  3. Re-solicitar con un email pendiente nuevo dos veces → la 2ª deduplica (una sola fila, datos actualizados).
  4. Panel: la fila de un email con cuenta muestra "Ya tiene cuenta" + "Reenviar acceso" (verificar que llega el email de recuperación).
  5. Aprobar un email nuevo → org + `subscription` `trialing` creada (verificar en BD).

## 7. Riesgos

- **Enumeración de emails** (el approach directo lo permite por diseño). Mitigado por el rate-limit del endpoint (5/hora/IP) y aceptado para B2B.
- **Redefinir `approve_demo_request`** toca el flujo de aprobación. Mitigación: SQL test del nuevo comportamiento + smoke; el resto del RPC se preserva textual.
- **`plan_id` inválido** al crear la subscription si el diálogo pasa "trial". Mitigación: default a `starter` (§4.4).

## 8. Entregables

1. Migración `056_demo_lifecycle.sql` (updated_at + trigger; `approve_demo_request` con subscription) + `database.types.ts` regenerado.
2. `classifyDemoSubmission` puro + test.
3. `POST /api/demo-requests`: detección de cuenta + dedupe (devuelve `outcome`).
4. `DemoForm`: ramas de UI por outcome.
5. Guard en `approve` route + route `resend-access`.
6. Panel: badge "Ya tiene cuenta" + acciones; vista de detalle con trazabilidad; `contacted_at`; `notes`.
7. Limpieza de los 2 duplicados de `ceobaselab`.
8. SQL tests + smoke E2E.
