# Spec: Módulo de Perfil del usuario

- **Fecha:** 2026-07-01
- **Estado:** Aprobado (brainstorming)
- **Autor:** Simón (con Claude Code)

## 1. Contexto y motivación

Hoy la app **no tiene ninguna pantalla de perfil ni autoservicio de contraseña**. El menú lateral solo ofrece los módulos, "Ajustes" (config de app, admin) y "Cerrar sesión". Cambiar la propia contraseña solo es posible vía el flujo de recuperación por correo (`/forgot-password` → `/auth/set-password`), que además falla para dominios corporativos Microsoft 365 (ver incidente 2026-07-01: `compras@evi.com.co` no recibió el correo de reset por filtrado de Exchange Online Protection).

Este módulo da a **todos los roles** (empleado, manager, admin, super_admin) un lugar único para ver y editar sus datos, cambiar su contraseña y su correo, y subir su foto — sin depender del correo.

Además, la investigación descubrió un **bug de seguridad preexistente** que este trabajo debe cerrar: la política `profiles_update_own` es `USING (id = auth.uid())` **sin restricción de columnas**, así que un empleado puede auto-asignarse `role = 'admin'` (escalada de privilegios). El CLAUDE.md afirma que la política limita al empleado a editar solo `phone`, pero esa restricción no está en la política actual — se perdió en la migración multi-tenant (039+).

## 2. Objetivos y no-objetivos

**Objetivos**
- Ruta `/perfil` con 5 secciones: foto, datos personales, correo, seguridad (contraseña), info laboral (solo lectura).
- Acceso desde el sidebar (ítem "Mi perfil") **y** desde un menú en el bloque de usuario.
- Cerrar el agujero de escalada de privilegios en `profiles`.
- Cobertura de tests (Vitest lógica pura + SQL test del trigger).

**No-objetivos (YAGNI)**
- Preferencias de tema/notificaciones.
- 2FA, historial de sesiones, gestión de dispositivos.
- Edición de datos laborales por el propio usuario (rol, contrato, sede, disponibilidad) — sigue siendo exclusivo de admin en `/employees`.

## 3. Decisiones tomadas en brainstorming

| Decisión | Elección |
|---|---|
| Secciones | Foto + datos personales + correo + seguridad + info laboral (las 4/5) |
| Correo | **Editable** con flujo de confirmación (`auth.updateUser({email})`) |
| Nombre/apellido | Editables por **el propio usuario** |
| Acceso | **Ambos**: ítem en sidebar + menú en bloque de usuario |
| Escritura de datos | Client-side directo a `profiles` (coherente con la app), respaldado por el arreglo de RLS |
| Contraseña | Se pide y verifica la **contraseña actual** antes de cambiarla |
| Avatar | Incluido en fase 1 (Supabase Storage) |

## 4. Arquitectura

### 4.1 Ruta y navegación
- **`src/app/(authenticated)/perfil/page.tsx`** — client component. Visible para todos los roles.
- **Sidebar** (`src/components/layout/sidebar.tsx`):
  - Nuevo ítem "Mi perfil" (`href: /perfil`, icono `User` de lucide) en la lista operativa, sin restricción de rol.
  - El bloque de usuario del pie (`profile.first_name last_name` + rol) se convierte en un **menú** (shadcn `DropdownMenu`) con dos acciones: "Mi perfil" (navega a `/perfil`) y "Cerrar sesión" (`signOut`). Se conserva la accesibilidad (botón con `aria`, foco visible).

### 4.2 Componentes
Página compuesta por tarjetas (`Card` shadcn), una por sección. Componentes nuevos en `src/components/profile/`:
- `avatar-card.tsx` — foto/iniciales + subir/cambiar/quitar.
- `personal-data-card.tsx` — form nombre/apellido/teléfono.
- `email-card.tsx` — email + cambio con confirmación.
- `security-card.tsx` — cambio de contraseña.
- `work-info-card.tsx` — datos laborales de solo lectura.

Cada card es autónoma: recibe `profile`/`user` por props y un callback `onUpdated` que dispara `refreshProfile()`. Se pueden entender y testear por separado.

### 4.3 Estado y auth-context
- La página lee `user` y `profile` de `useAuth()` (sin refetch). `profile` ya incluye `position` y `location` embebidos.
- **Refactor del auth-context** (`src/contexts/auth-context.tsx`):
  - Extraer la lógica de fetch de `getUser` a una función reutilizable y exponer **`refreshProfile(): Promise<void>`** en `AuthContextValue`.
  - Añadir `contract_type:contract_types(*)` al `select` del profile para mostrar el nombre del contrato sin query extra.
- Tras cualquier guardado exitoso, la card llama `refreshProfile()` para reflejar los cambios en toda la UI (sidebar incluido).

## 5. Secciones (detalle)

### 5.1 Foto de perfil (`avatar-card`)
- Muestra `profile.avatar_url` o, si es null, un círculo con las iniciales (`first_name[0]+last_name[0]`).
- Acciones: **Subir/Cambiar** (input file) y **Quitar**.
- Validación cliente: tipo `image/jpeg|png|webp`, tamaño ≤ 2 MB. Mensaje de error accesible si no cumple.
- Sube a Storage `avatars/{user_id}/avatar.<ext>` (upsert), obtiene la URL pública, guarda `avatar_url` en `profiles`, llama `refreshProfile()`.
- "Quitar": borra el objeto de Storage y setea `avatar_url = null`.

### 5.2 Datos personales (`personal-data-card`)
- Campos: `first_name` (req.), `last_name` (req.), `phone` (opcional).
- Validación: nombre/apellido no vacíos; teléfono opcional con formato flexible (dígitos, espacios, `+`, `-`), 7–15 dígitos.
- Guarda con `update` client-side sobre `profiles` (solo estos campos). `refreshProfile()` al terminar.

### 5.3 Correo (`email-card`)
- Muestra `user.email` (fuente de verdad de Auth).
- Botón "Cambiar correo" → input nuevo email → `supabase.auth.updateUser({ email })`.
- Aviso post-envío: *"Te enviamos un enlace de confirmación a **{nuevo}**. El cambio se aplica cuando abras ese enlace. Si no llega, revisa spam o la cuarentena de tu proveedor."*
- Sincronización `profiles.email`: se maneja con un **trigger `AFTER UPDATE OF email ON auth.users`** que copia el nuevo email a `profiles.email` una vez confirmado (o, si ya existe uno equivalente, reutilizarlo). Va en la misma migración 065. (Nota: `profiles.email` deja de ser editable directamente por el usuario; solo lo actualiza este trigger.)

### 5.4 Seguridad / contraseña (`security-card`)
- Campos: contraseña actual, nueva (mín. 8), confirmar.
- Verificación de la actual: `supabase.auth.signInWithPassword({ email: user.email, password: actual })` en un cliente efímero; si falla → error "Contraseña actual incorrecta". Si pasa → `supabase.auth.updateUser({ password: nueva })`.
- Mensajes de éxito/error accesibles (`aria-live`). No redirige (a diferencia de `/auth/set-password`); solo confirma inline.

### 5.5 Info laboral (`work-info-card`) — solo lectura
- Muestra: rol (`ROLE_LABELS`), sede (`location.name`), posición (`position.name`), tipo de contrato (`contract_type.name`), fecha de ingreso (`hire_date`), disponibilidad (domingos/festivos/noches con badges Sí/No, resolviendo el override del empleado vs. default del contrato si aplica).
- Nota aclaratoria: *"Estos datos los gestiona tu administrador."*

## 6. Seguridad — migración 065 (trigger de columnas)

`supabase/migrations/065_profiles_column_guard.sql`:
- Función `enforce_profile_self_update_columns()` `SECURITY DEFINER`, trigger `BEFORE UPDATE ON public.profiles`.
- Lógica: si `auth.uid() = NEW.id` **y** `get_user_role()` **no** está en `('admin','manager','super_admin')` (es decir, un usuario editando su propia fila sin ser staff), entonces todas las columnas salvo `{first_name, last_name, phone, avatar_url, updated_at}` deben permanecer iguales a `OLD`; si alguna cambió → `RAISE EXCEPTION`.
- Excepciones: cuando `auth.uid()` es null (operaciones de servicio / triggers SECURITY DEFINER / service_role) el trigger no restringe — deja pasar. Los admin/manager/super_admin no se ven afectados (pueden seguir editando cualquier columna vía `/employees`).
- Esto complementa las políticas RLS existentes (no las reemplaza); es defensa en profundidad a nivel columna, que RLS `WITH CHECK` no expresa por columna en Postgres.
- Regenerar tipos tras aplicar (no cambia el shape de `profiles` salvo por `avatar_url`).

## 7. Avatar / Storage — migración 065

- Columna nueva: `ALTER TABLE public.profiles ADD COLUMN avatar_url TEXT;` (nullable).
- Bucket `avatars`: `INSERT INTO storage.buckets (id, name, public) VALUES ('avatars','avatars', true)` (lectura pública).
- Políticas de `storage.objects` para el bucket `avatars`:
  - `SELECT`: público (bucket público, la foto se sirve por URL directa).
  - `INSERT/UPDATE/DELETE` permitido solo si `bucket_id = 'avatars'` y el primer segmento del `name` (`(storage.foldername(name))[1]`) es igual a `auth.uid()::text` → cada usuario solo administra su carpeta.
- `avatar_url` está en la allowlist del trigger de la sección 6.

## 8. Tests

- **Vitest (lógica pura)** en `src/lib/profile-helpers.ts` + `.test.ts`:
  - Validación de teléfono (formato/longitud), contraseña (mín. 8, coincidencia), email (formato), tipo/tamaño de imagen.
- **SQL test** `supabase/tests/profile_column_guard.sql` (patrón `BEGIN…ROLLBACK`):
  - Un empleado NO puede cambiar su `role` (espera excepción).
  - Un empleado SÍ puede cambiar su `phone`.
  - Un admin/manager SÍ puede cambiar `role`/`contract_type_id` de otros.

## 9. Archivos a crear / modificar

**Crear**
- `src/app/(authenticated)/perfil/page.tsx`
- `src/components/profile/{avatar-card,personal-data-card,email-card,security-card,work-info-card}.tsx`
- `src/lib/profile-helpers.ts` + `src/lib/profile-helpers.test.ts`
- `supabase/migrations/065_profiles_column_guard.sql` — una sola migración que agrupa: trigger de columnas + `avatar_url` + bucket `avatars` + storage RLS + trigger de sync de email. (Si el migration-reviewer prefiere separar el trigger sobre `auth.users`, se mueve a 066; default: todo en 065.)
- `supabase/tests/profile_column_guard.sql`

**Modificar**
- `src/contexts/auth-context.tsx` — exponer `refreshProfile()`, añadir `contract_type` al select.
- `src/components/layout/sidebar.tsx` — ítem "Mi perfil" + menú en el bloque de usuario.
- `src/lib/types.ts` — `Profile.avatar_url`, `contract_type` embebido.
- `src/lib/supabase/database.types.ts` — regenerar.

## 10. Riesgos y notas
- **Correo a M365 sigue roto.** El cambio de email depende del mismo canal que falla; por eso el aviso explícito. No lo resolvemos aquí (es infra de deliverability, tratado en el incidente 2026-07-01).
- **Trigger de columnas:** hay que verificar que operaciones legítimas del sistema (conversión demo→real, onboarding, triggers de equidad) no queden bloqueadas — de ahí la excepción cuando `auth.uid()` es null. El migration-reviewer debe validar esto.
- **Compat de datos:** `avatar_url` nullable, sin backfill. Bucket nuevo, sin objetos previos.

## 11. Proceso
- Invocar `modern-web-guidance` antes de escribir UI (forms, dialog/menu, file upload, a11y).
- La migración 065 pasa por `migration-reviewer` antes de aplicarse en Supabase Cloud.
- Ejecución subagent-driven con reviewers especializados (patrón del proyecto).
