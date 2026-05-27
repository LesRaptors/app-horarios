# Sub-proyecto 7 — Panel super_admin + cambio de tenant

**Fecha:** 2026-05-27
**Estado:** Diseño aprobado (brainstorming). Pendiente: plan de implementación.

## 1. Problema

El rol `super_admin` (dueño del SaaS, `suv411@hotmail.com`) administra todas las organizaciones, pero hoy la experiencia está rota:

1. **No hay selector de tenant.** No existe forma de decir "quiero trabajar en Les Raptors". No hay cookie, estado ni UI.
2. **Datos mezclados sin contexto.** El RLS le deja ver todo (`is_super_admin() OR organization_id = get_user_org_id()`), así que en `/employees` aparecen los empleados de todas las orgs juntos, sin saber a cuál pertenece cada registro. Por eso "parece un solo tenant".
3. **No puede crear nada.** Los ~25 formularios insertan `organization_id: profile?.organization_id ?? ""` → para el super_admin (`organization_id IS NULL`) eso es `""`, que el RLS/FK rechaza. Solo puede leer.
4. **No hay panel de orgs.** Solo existe `/admin/demo-requests` (leads). No ve sus tenants reales, su estado ni sus métricas.

**Datos en producción al diseñar:** 2 organizaciones — Les Raptors (onboarded, 17 empleados, 2 sedes, plan enterprise grandfathered) y Base Laboral SAS (onboarding incompleto, 1 empleado, 0 sedes).

## 2. Objetivo

Dar al super_admin **dos modos** claramente diferenciados:

- **Modo panel SaaS:** vista global de todas las organizaciones (la home del super_admin). Para supervisar y administrar el negocio.
- **Modo operación:** "entrar" a un tenant y trabajar dentro como si fuera su admin (leer y crear/editar sedes, horarios, empleados, nómina). Para dar soporte y configurar clientes.

El cambio entre tenants debe ser de un clic, con un indicador visual inconfundible de en qué org estás operando.

## 3. No-objetivos (YAGNI para V1)

- Página de detalle por organización con histórico/gráficos.
- Métricas de vanidad (último login, MRR agregado, gráficos de uso).
- Modo read-only de impersonación (el super_admin opera con permisos plenos sobre el tenant activo; la auditoría queda preservada — ver §4.4).
- Cambiar el comportamiento del subdomain routing (la regla R5 que expulsa al super_admin de los subdominios de tenants se mantiene).

## 4. Diseño técnico

### 4.1 Corazón: "tenant activo" sin reescribir policies

Las 116 policies multi-tenant siguen el patrón:

```sql
-- lectura
USING (is_super_admin() OR organization_id = get_user_org_id())
-- escritura
WITH CHECK (is_super_admin() OR (organization_id = get_user_org_id()
            AND get_user_role() IN ('admin','manager')))
```

En vez de reescribir ese patrón en cada policy (alto riesgo de romper el aislamiento), hacemos que **tres funciones helper sean conscientes de un "tenant activo"**. Las policies no se tocan.

**Tabla nueva:**

```sql
CREATE TABLE super_admin_active_org (
  user_id        UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  active_org_id  UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE super_admin_active_org ENABLE ROW LEVEL SECURITY;
-- Solo el propio super_admin lee/escribe su fila. Escritura real vía RPC SECURITY DEFINER.
CREATE POLICY saao_self ON super_admin_active_org FOR SELECT TO authenticated
  USING (user_id = auth.uid());
```

**RPC para setear/limpiar el tenant activo:**

```sql
CREATE OR REPLACE FUNCTION public.set_active_org(p_org_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  -- check crudo de rol, NO la función is_super_admin() (que es tenant-aware)
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin') THEN
    RAISE EXCEPTION 'solo super_admin';
  END IF;
  IF p_org_id IS NULL THEN
    DELETE FROM super_admin_active_org WHERE user_id = auth.uid();
  ELSE
    INSERT INTO super_admin_active_org (user_id, active_org_id)
    VALUES (auth.uid(), p_org_id)
    ON CONFLICT (user_id) DO UPDATE SET active_org_id = EXCLUDED.active_org_id, updated_at = now();
  END IF;
END;
$$;
GRANT EXECUTE ON FUNCTION public.set_active_org(UUID) TO authenticated;
```

**Redefinir las 3 funciones** (leyendo `super_admin_active_org`). Un único lookup combinado para no pagar 2 SELECTs por policy:

```sql
-- helper interno: rol crudo + org propia + tenant activo en una fila
CREATE OR REPLACE FUNCTION public._user_ctx()
RETURNS TABLE(raw_role TEXT, own_org UUID, active_org UUID)
LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT p.role, p.organization_id, s.active_org_id
  FROM profiles p
  LEFT JOIN super_admin_active_org s ON s.user_id = p.id
  WHERE p.id = auth.uid();
$$;

-- is_super_admin(): true SOLO si super_admin y SIN tenant activo (modo panel)
-- get_user_org_id(): super_admin con tenant activo → ese tenant; si no → org propia
-- get_user_role(): super_admin con tenant activo → 'admin'; si no → rol real
```

**Tabla de verdad resultante** (con el patrón de policies intacto):

| Estado | `is_super_admin()` | `get_user_org_id()` | `get_user_role()` | Efecto |
|---|---|---|---|---|
| super_admin en panel (sin tenant) | `true` | `null` | `super_admin` | Ve **todo** (listar orgs/métricas) |
| super_admin operando Les Raptors | `false` | LR | `admin` | Lee/escribe **como admin de LR**, nada más |
| admin/manager/employee normal | `false` | su org | su rol | **Idéntico a hoy** |

### 4.2 Seguridad y casos borde

- **Sin escalada.** La rama de tenant activo solo se dispara para `role = 'super_admin'`. Un usuario normal nunca tiene fila en `super_admin_active_org` y `get_user_org_id()` devuelve su org real.
- **Acciones SaaS-only quedan en modo panel.** `is_super_admin()` también gatea: crear/borrar `organizations`, `plans` (modify), ver `demo_requests`, `dian_emit_jobs`, `sent_reminders`. Con tenant activo `is_super_admin()=false` → esas acciones solo funcionan en modo panel. Es el comportamiento deseado: administras el negocio desde el panel, no mientras operas dentro de un cliente.
- **Editar la org en la que operas sí funciona.** `organizations UPDATE` = `is_super_admin() OR (id = get_user_org_id() AND get_user_role() = 'admin')` → con tenant activo la segunda rama aplica.
- **Suscripción del tenant activo visible.** `subs_org_admin` = super_admin OR org admin → con tenant activo accede a la suscripción de ese tenant vía la rama admin.
- **Auditar dependencias de `is_super_admin()`** en triggers/RPCs (no solo policies) durante la implementación, para confirmar que redefinirla no rompe ningún flujo SECURITY DEFINER.

### 4.3 Escrituras (los ~25 inserts rotos)

Decisión: **app-level, sin trigger BD.** El `WITH CHECK` del RLS ya es la red de seguridad — un `organization_id` equivocado se rechaza con error visible (se atrapa en smoke test), no es fuga silenciosa. Un trigger que rellene `organization_id` en ~27 tablas sería una tercera capa redundante y mágica.

- `AuthContext` expone `effectiveOrgId = profile.organization_id ?? activeOrgId`.
- Los ~25 inserts cambian `organization_id: profile?.organization_id ?? ""` → `organization_id: effectiveOrgId`. Cambio mecánico y acotado. Lista de archivos en el plan (incluye `schedule`, `departments`, `positions`, `locations`, `shifts`, `contract-types`, settings de nómina, requests, salarios, ausencias, auto-generate).
- **API routes server-side** (`billing/*`, `liquidacion-form`) usan `profile.organization_id` directo. Para super_admin operando deben resolver el tenant activo server-side vía `get_user_org_id()` (RPC) o lectura de `super_admin_active_org`. La operación principal (sedes, horarios, empleados) es client-side directa, no pasa por API routes; los flujos de billing los ejecuta el admin del tenant. Se documenta como consideración; `liquidacion-form` ya tiene guard explícito.

### 4.4 Auditoría preservada

Aunque `get_user_role()` devuelva `'admin'` mientras se opera, `auth.uid()` **no cambia**. Los campos `created_by`/`updated_by` registran el user_id real del super_admin. Quién hizo qué queda trazado; solo el *rol efectivo* para permisos cambia.

## 5. UI

### 5.1 Panel SaaS (`/super-admin`, nueva home del super_admin)

Tabla de organizaciones con búsqueda. Columnas V1:

- **Identidad:** nombre + slug (link al subdominio).
- **Tamaño:** # empleados activos, # sedes.
- **Negocio:** estado de suscripción (`trialing` / `active` / `past_due` / `paused` / `canceled`, o "exenta" si `billing_exempt`) + plan (`current_plan_id`).
- **Onboarding:** completo / pendiente (`onboarding_completed_at`).
- **Acción:** "Trabajar en esta org" (llama `set_active_org` → navega a `/dashboard`).

Botón global "Crear organización" (reusa el flujo existente). El acceso a `/admin/demo-requests` (leads) se integra como pestaña/tarjeta del panel para unificar el centro de mando.

### 5.2 Selector global + indicador (header)

- Dropdown **"Viendo: [Org] ▾"** en el navbar, visible solo para super_admin, con buscador de orgs (combobox accesible).
- Al elegir → `set_active_org` → refresca datos.
- Opción **"← Salir al panel SaaS"** (`set_active_org(null)` → `/super-admin`).
- **Indicador inconfundible:** franja/color distintivo persistente en el header mientras hay tenant activo (no solo texto), para eliminar la clase de error "edité el cliente equivocado".
- UI construida respetando el skill `modern-web-guidance` (combobox/dropdown a11y, foco, teclado).

### 5.3 AuthContext + routing

- `useAuth()` pasa a exponer: `isSuperAdmin`, `activeOrgId`, `activeOrg` (objeto org), `setActiveOrg()`. La fuente de verdad del tenant activo es la tabla (server-side); el contexto la lee al cargar.
- Login del super_admin → redirige a `/super-admin` (no `/dashboard`).
- Middleware: super_admin **sin** tenant activo que entra a una ruta operativa → redirige a `/super-admin` ("elige una organización"); **con** tenant activo → opera normal. La regla R5 se mantiene.

## 6. Testing

- **SQL tests** (`supabase/tests/`, patrón `BEGIN … ROLLBACK`):
  - Las 3 funciones en los 3 estados (panel / operando / usuario normal).
  - super_admin con tenant activo: puede `INSERT` en ese tenant, **no** en otro.
  - Usuario normal: sin cambios de comportamiento.
  - Sin escalada: usuario no-super_admin que intenta `set_active_org` falla.
- **Vitest:** helper puro de `effectiveOrgId` y selección de rol efectivo si se extrae lógica pura.
- **Smoke E2E en preview:** panel → "Trabajar en Les Raptors" → crear una sede (verifica que el insert ya no rompe) → cambiar a Base Laboral en el selector → completar su onboarding pendiente → "Salir al panel SaaS" → confirmar que vuelve a ver todas las orgs.

## 7. Riesgos

- **Redefinir helpers de RLS toca el núcleo de seguridad.** Mitigación: las policies no cambian; SQL tests exhaustivos de los 3 estados antes de aplicar a prod; `migration-reviewer` antes de aplicar.
- **Olvidar un insert.** Mitigación: el RLS `WITH CHECK` lo rechaza ruidosamente; el smoke test cubre los flujos principales.
- **Performance de `_user_ctx()` en cada policy.** Mitigación: `STABLE` (cacheada por query) + lookups por PK indexada; un solo JOIN en vez de 2 SELECTs.

## 8. Entregables

1. Migración: tabla `super_admin_active_org` + RPC `set_active_org` + redefinición de `_user_ctx`/`is_super_admin`/`get_user_org_id`/`get_user_role` + RLS. `database.types.ts` regenerado.
2. SQL tests de las 3 funciones y aislamiento de escritura.
3. `AuthContext` extendido (`isSuperAdmin`, `activeOrgId`, `activeOrg`, `setActiveOrg`).
4. Página `/super-admin` (panel) + integración de `/admin/demo-requests`.
5. Selector global + indicador en el header/navbar.
6. Migración de los ~25 inserts a `effectiveOrgId`.
7. Ajustes de login redirect + middleware.
8. Smoke E2E en preview.
