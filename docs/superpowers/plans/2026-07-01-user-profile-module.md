# Módulo de Perfil del usuario — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dar a todos los roles una ruta `/perfil` para ver/editar sus datos, cambiar contraseña y correo, y subir foto — cerrando además un agujero de escalada de privilegios en `profiles`.

**Architecture:** Página client-side bajo `(authenticated)/perfil` compuesta por 5 tarjetas autónomas. Lectura desde `useAuth()` (sin refetch); escritura de datos personales/avatar client-side directo a `profiles`, contraseña/email vía `supabase.auth.updateUser`. Un trigger `BEFORE UPDATE` en `profiles` restringe por columna qué puede auto-editar un no-staff. Avatar en Supabase Storage (bucket público, carpeta por `auth.uid()`).

**Tech Stack:** Next.js 14 App Router, Supabase (Postgres + Auth + Storage), Tailwind v3, shadcn/ui, lucide-react, Vitest.

## Global Constraints

- Toda la UI en **español** con acentos correctos (`posición`, `día`, `contraseña`, `foto`, etc.).
- **Sin emojis** en archivos; indicadores visuales con iconos lucide.
- Fechas en formato `YYYY-MM-DD`.
- Data access client-side vía el singleton `createClient()` de `@/lib/supabase/client`.
- Tests de lógica pura con **Vitest** (`src/**/*.test.ts`); tests SQL con patrón `BEGIN … ROLLBACK` en `supabase/tests/`.
- **Antes de escribir UI** (page/componentes): invocar la skill `modern-web-guidance:modern-web-guidance` con query enfocada (forms, dropdown/menu, file upload, a11y) y aplicar sus DOs/DON'Ts.
- La migración pasa por el subagente **migration-reviewer** antes de aplicarse en Supabase Cloud (project `ugkvuinkynvtuiutwlkd`).
- Cada task termina en commit; mensaje en español con `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.
- Rama de trabajo: `feature/user-profile-module`.

---

### Task 1: Helpers puros de perfil (validaciones + utilidades)

**Files:**
- Create: `src/lib/profile-helpers.ts`
- Test: `src/lib/profile-helpers.test.ts`

**Interfaces:**
- Produces:
  - `getInitials(firstName: string, lastName: string): string`
  - `validatePhone(phone: string): string | null` — `null` = válido; string = mensaje de error.
  - `validateEmail(email: string): string | null`
  - `validatePasswordChange(current: string, next: string, confirm: string): string | null`
  - `validateAvatarFile(file: { type: string; size: number }): string | null`
  - `resolveAvailability(override: boolean | null | undefined, contractDefault: boolean): boolean`
  - `AVATAR_MAX_BYTES: number`, `AVATAR_ALLOWED_TYPES: string[]`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/profile-helpers.test.ts
import { describe, it, expect } from "vitest";
import {
  getInitials,
  validatePhone,
  validateEmail,
  validatePasswordChange,
  validateAvatarFile,
  resolveAvailability,
  AVATAR_MAX_BYTES,
} from "./profile-helpers";

describe("getInitials", () => {
  it("toma la primera letra de nombre y apellido en mayúscula", () => {
    expect(getInitials("simón", "urrego")).toBe("SU");
  });
  it("tolera apellido vacío", () => {
    expect(getInitials("Ana", "")).toBe("A");
  });
});

describe("validatePhone", () => {
  it("acepta un celular colombiano", () => {
    expect(validatePhone("+57 300 123 4567")).toBeNull();
  });
  it("acepta vacío (opcional)", () => {
    expect(validatePhone("")).toBeNull();
  });
  it("rechaza con letras", () => {
    expect(validatePhone("abc123")).not.toBeNull();
  });
  it("rechaza demasiado corto", () => {
    expect(validatePhone("123")).not.toBeNull();
  });
});

describe("validateEmail", () => {
  it("acepta un email válido", () => {
    expect(validateEmail("a@b.co")).toBeNull();
  });
  it("rechaza sin arroba", () => {
    expect(validateEmail("ab.co")).not.toBeNull();
  });
});

describe("validatePasswordChange", () => {
  it("acepta cambio válido", () => {
    expect(validatePasswordChange("vieja123", "nuevaClave8", "nuevaClave8")).toBeNull();
  });
  it("rechaza si la nueva es menor a 8", () => {
    expect(validatePasswordChange("vieja123", "corta", "corta")).not.toBeNull();
  });
  it("rechaza si no coinciden", () => {
    expect(validatePasswordChange("vieja123", "nuevaClave8", "otra12345")).not.toBeNull();
  });
  it("rechaza si la actual está vacía", () => {
    expect(validatePasswordChange("", "nuevaClave8", "nuevaClave8")).not.toBeNull();
  });
});

describe("validateAvatarFile", () => {
  it("acepta png dentro del límite", () => {
    expect(validateAvatarFile({ type: "image/png", size: 1000 })).toBeNull();
  });
  it("rechaza tipo no permitido", () => {
    expect(validateAvatarFile({ type: "application/pdf", size: 1000 })).not.toBeNull();
  });
  it("rechaza si excede el tamaño", () => {
    expect(validateAvatarFile({ type: "image/png", size: AVATAR_MAX_BYTES + 1 })).not.toBeNull();
  });
});

describe("resolveAvailability", () => {
  it("usa el override del empleado cuando existe", () => {
    expect(resolveAvailability(false, true)).toBe(false);
  });
  it("cae al default del contrato cuando el override es null", () => {
    expect(resolveAvailability(null, true)).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- profile-helpers`
Expected: FAIL (módulo no existe / funciones no definidas).

- [ ] **Step 3: Write minimal implementation**

```ts
// src/lib/profile-helpers.ts
export const AVATAR_MAX_BYTES = 2 * 1024 * 1024; // 2 MB
export const AVATAR_ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];

export function getInitials(firstName: string, lastName: string): string {
  const a = (firstName ?? "").trim().charAt(0);
  const b = (lastName ?? "").trim().charAt(0);
  return `${a}${b}`.toUpperCase();
}

export function validatePhone(phone: string): string | null {
  const trimmed = (phone ?? "").trim();
  if (trimmed === "") return null; // opcional
  if (!/^[+\d][\d\s-]*$/.test(trimmed)) {
    return "El teléfono solo puede tener dígitos, espacios, + y -.";
  }
  const digits = trimmed.replace(/\D/g, "");
  if (digits.length < 7 || digits.length > 15) {
    return "El teléfono debe tener entre 7 y 15 dígitos.";
  }
  return null;
}

export function validateEmail(email: string): string | null {
  const trimmed = (email ?? "").trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
    return "Ingresa un correo válido.";
  }
  return null;
}

export function validatePasswordChange(
  current: string,
  next: string,
  confirm: string
): string | null {
  if (!current) return "Ingresa tu contraseña actual.";
  if (next.length < 8) return "La nueva contraseña debe tener al menos 8 caracteres.";
  if (next !== confirm) return "Las contraseñas no coinciden.";
  return null;
}

export function validateAvatarFile(file: { type: string; size: number }): string | null {
  if (!AVATAR_ALLOWED_TYPES.includes(file.type)) {
    return "La foto debe ser JPG, PNG o WEBP.";
  }
  if (file.size > AVATAR_MAX_BYTES) {
    return "La foto no puede superar 2 MB.";
  }
  return null;
}

export function resolveAvailability(
  override: boolean | null | undefined,
  contractDefault: boolean
): boolean {
  return override === null || override === undefined ? contractDefault : override;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- profile-helpers`
Expected: PASS (todos los casos).

- [ ] **Step 5: Commit**

```bash
git add src/lib/profile-helpers.ts src/lib/profile-helpers.test.ts
git commit -m "feat(perfil): helpers puros de validación + tests

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Migración 065 — guard de columnas, avatar, storage, sync de email

**Files:**
- Create: `supabase/migrations/065_profiles_column_guard.sql`
- Create: `supabase/tests/profile_column_guard.sql`
- Modify: `src/lib/supabase/database.types.ts` (regenerar tras aplicar)

**Interfaces:**
- Produces (DB): columna `profiles.avatar_url TEXT`; bucket `avatars`; trigger `trg_enforce_profile_self_update`; trigger `trg_sync_profile_email`; políticas storage `avatars_*`.

- [ ] **Step 1: Escribir la migración**

```sql
-- supabase/migrations/065_profiles_column_guard.sql
-- Módulo de perfil: columna avatar_url, guard de columnas auto-editables,
-- sync de email auth.users -> profiles, y bucket de avatares con RLS.
BEGIN;

-- 1) Columna para la foto de perfil (nullable, sin backfill).
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS avatar_url TEXT;

-- 2) Guard: un no-staff editando su propia fila solo puede tocar
--    first_name, last_name, phone, avatar_url (y updated_at).
CREATE OR REPLACE FUNCTION public.enforce_profile_self_update_columns()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor_role text;
BEGIN
  -- Bypass del sync interno de email (ver sync_profile_email).
  IF current_setting('app.syncing_email', true) = '1' THEN
    RETURN NEW;
  END IF;

  -- Operaciones de servicio sin JWT (triggers SECURITY DEFINER, service_role).
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  actor_role := public.get_user_role();

  -- Staff puede editar cualquier columna (flujo /employees).
  IF actor_role IN ('admin', 'manager', 'super_admin') THEN
    RETURN NEW;
  END IF;

  -- Editando la fila de OTRO: lo bloquea la RLS, no este guard.
  IF auth.uid() <> NEW.id THEN
    RETURN NEW;
  END IF;

  -- No-staff sobre su propia fila: rechazar cualquier columna sensible.
  IF ROW(NEW.role, NEW.contract_type_id, NEW.position_id, NEW.location_id,
         NEW.is_active, NEW.is_demo, NEW.is_floater, NEW.is_terminated,
         NEW.organization_id, NEW.email, NEW.hire_date, NEW.termination_date,
         NEW.arl_risk_class, NEW.max_hours_per_week,
         NEW.available_sundays, NEW.available_holidays, NEW.available_nights)
     IS DISTINCT FROM
     ROW(OLD.role, OLD.contract_type_id, OLD.position_id, OLD.location_id,
         OLD.is_active, OLD.is_demo, OLD.is_floater, OLD.is_terminated,
         OLD.organization_id, OLD.email, OLD.hire_date, OLD.termination_date,
         OLD.arl_risk_class, OLD.max_hours_per_week,
         OLD.available_sundays, OLD.available_holidays, OLD.available_nights) THEN
    RAISE EXCEPTION 'No puedes modificar esos campos de tu perfil (solo nombre, apellido, teléfono y foto).';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_profile_self_update ON public.profiles;
CREATE TRIGGER trg_enforce_profile_self_update
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_profile_self_update_columns();

-- 3) Sync de email: cuando auth.users.email cambia (tras confirmar el link),
--    reflejarlo en profiles.email. Usa un flag local para saltar el guard.
CREATE OR REPLACE FUNCTION public.sync_profile_email()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.email IS DISTINCT FROM OLD.email THEN
    PERFORM set_config('app.syncing_email', '1', true);
    UPDATE public.profiles SET email = NEW.email, updated_at = now() WHERE id = NEW.id;
    PERFORM set_config('app.syncing_email', '0', true);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_profile_email ON auth.users;
CREATE TRIGGER trg_sync_profile_email
  AFTER UPDATE OF email ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_profile_email();

-- 4) Bucket de avatares (lectura pública).
INSERT INTO storage.buckets (id, name, public)
VALUES ('avatars', 'avatars', true)
ON CONFLICT (id) DO NOTHING;

-- 5) Políticas de storage.objects para el bucket avatars.
DROP POLICY IF EXISTS "avatars_public_read" ON storage.objects;
CREATE POLICY "avatars_public_read" ON storage.objects
  FOR SELECT USING (bucket_id = 'avatars');

DROP POLICY IF EXISTS "avatars_owner_insert" ON storage.objects;
CREATE POLICY "avatars_owner_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "avatars_owner_update" ON storage.objects;
CREATE POLICY "avatars_owner_update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "avatars_owner_delete" ON storage.objects;
CREATE POLICY "avatars_owner_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);

COMMIT;
```

- [ ] **Step 2: Escribir el SQL test**

```sql
-- supabase/tests/profile_column_guard.sql
-- Verifica el guard de columnas. Patrón BEGIN ... ROLLBACK (seguro en prod).
BEGIN;

-- Setup mínimo: reutiliza una org existente y un contract_type de esa org.
DO $$
DECLARE
  v_org uuid;
  v_contract uuid;
  v_emp uuid := '11111111-1111-1111-1111-111111111111';
BEGIN
  SELECT id INTO v_org FROM public.organizations LIMIT 1;
  SELECT id INTO v_contract FROM public.contract_types WHERE organization_id = v_org LIMIT 1;

  INSERT INTO public.profiles (id, first_name, last_name, email, role,
                               is_active, is_demo, contract_type_id, is_terminated,
                               is_floater, organization_id, max_hours_per_week)
  VALUES (v_emp, 'Test', 'Empleado', 'test.guard@example.com', 'employee',
          true, false, v_contract, false, false, v_org, 44);
END $$;

-- Simular al empleado autenticado.
SELECT set_config('request.jwt.claims',
  json_build_object('sub', '11111111-1111-1111-1111-111111111111', 'role', 'authenticated')::text,
  true);
SET LOCAL role authenticated;

-- 1) Debe PERMITIR cambiar phone.
UPDATE public.profiles SET phone = '3001234567'
WHERE id = '11111111-1111-1111-1111-111111111111';

-- 2) Debe RECHAZAR escalar a admin.
DO $$
BEGIN
  BEGIN
    UPDATE public.profiles SET role = 'admin'
    WHERE id = '11111111-1111-1111-1111-111111111111';
    RAISE EXCEPTION 'FALLO: el guard permitió cambiar el role';
  EXCEPTION WHEN others THEN
    IF SQLERRM LIKE 'FALLO:%' THEN RAISE; END IF;
    RAISE NOTICE 'OK: guard bloqueó el cambio de role (%).', SQLERRM;
  END;
END $$;

RESET role;
ROLLBACK;
```

- [ ] **Step 3: Despachar migration-reviewer**

Antes de aplicar, dispatch subagente `migration-reviewer` (model: opus) apuntando a `supabase/migrations/065_profiles_column_guard.sql`. Verificar especialmente: (a) que el sync de email no quede bloqueado por el guard, (b) que operaciones de servicio (convert demo→real, onboarding) no rompan, (c) idempotencia, (d) políticas storage correctas. Aplicar sus correcciones.

- [ ] **Step 4: Aplicar la migración**

Aplicar vía Supabase MCP `apply_migration` (name: `065_profiles_column_guard`, project `ugkvuinkynvtuiutwlkd`).
Expected: sin error.

- [ ] **Step 5: Correr el SQL test**

Ejecutar `supabase/tests/profile_column_guard.sql` vía MCP `execute_sql`.
Expected: el UPDATE de phone pasa; el bloque del role emite `NOTICE OK: guard bloqueó...`; `ROLLBACK` limpia. Sin fila `FALLO`.

- [ ] **Step 6: Regenerar tipos**

Regenerar `src/lib/supabase/database.types.ts` vía MCP `generate_typescript_types` (o skill `/regen-types`). Verificar que `profiles.avatar_url` aparece.

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/065_profiles_column_guard.sql supabase/tests/profile_column_guard.sql src/lib/supabase/database.types.ts
git commit -m "feat(perfil): migración 065 — guard de columnas, avatar_url, storage y sync de email

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: auth-context — `refreshProfile()` + `contract_type` en el profile

**Files:**
- Modify: `src/contexts/auth-context.tsx`
- Modify: `src/lib/types.ts`

**Interfaces:**
- Consumes: patrón de fetch existente en `getUser` (`auth-context.tsx:42-77`).
- Produces:
  - `AuthContextValue.refreshProfile: () => Promise<void>`
  - `Profile.avatar_url: string | null`
  - `Profile.contract_type?: ContractType` (objeto embebido opcional)

- [ ] **Step 1: Extender el tipo Profile**

En `src/lib/types.ts`, en la interfaz `Profile` añadir:

```ts
  avatar_url: string | null;
  contract_type?: ContractType; // embebido desde el join del auth-context
```

(`ContractType` ya existe en `types.ts`; si el `Profile` ya tiene `position?`/`location?` embebidos, seguir el mismo patrón.)

- [ ] **Step 2: Refactor del auth-context para reutilizar el fetch y exponer refreshProfile**

En `src/contexts/auth-context.tsx`:

1. Extraer la lógica de carga del profile a un `useCallback` reutilizable e incluir el contrato en el select:

```tsx
  const loadProfile = useCallback(async () => {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    setUser(user);
    if (!user) return;
    const { data: profileData } = await supabase
      .from("profiles")
      .select("*, position:positions(*), location:locations(*), contract_type:contract_types(*)")
      .eq("id", user.id)
      .single();
    setProfile(profileData as unknown as Profile);
  }, []);

  const refreshProfile = useCallback(async () => {
    await loadProfile();
  }, [loadProfile]);
```

2. Dentro del `useEffect`, mantener la lógica de super_admin/activeOrg tal cual, pero reemplazar el fetch del profile por `loadProfile()` (el select ahora trae también `contract_type`). Conservar `onAuthStateChange` y el `setLoading(false)`.

3. Añadir `refreshProfile` al objeto `value` del provider y a la interfaz `AuthContextValue`.

- [ ] **Step 3: Verificar typecheck y build**

Run: `npx tsc --noEmit` (o `/typecheck`)
Expected: sin errores. `refreshProfile` visible en `useAuth()`.

- [ ] **Step 4: Commit**

```bash
git add src/contexts/auth-context.tsx src/lib/types.ts
git commit -m "feat(perfil): auth-context expone refreshProfile y embebe contract_type

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Página `/perfil` (shell) + tarjeta de información laboral (solo lectura)

**NOTA:** invocar `modern-web-guidance:modern-web-guidance` (query: "landmarks headings page structure") antes de escribir el layout.

**Files:**
- Create: `src/app/(authenticated)/perfil/page.tsx`
- Create: `src/components/profile/work-info-card.tsx`

**Interfaces:**
- Consumes: `useAuth()` (`profile`, `user`, `refreshProfile`); `resolveAvailability` (Task 1); `ROLE_LABELS` (`src/lib/constants.ts`).
- Produces:
  - Contrato de props para todas las tarjetas:
    ```ts
    interface ProfileCardProps {
      profile: Profile;
      user: User;              // de @supabase/supabase-js
      onUpdated: () => void | Promise<void>;
    }
    ```
  - `<WorkInfoCard profile={profile} />`

- [ ] **Step 1: Crear la tarjeta de info laboral**

```tsx
// src/components/profile/work-info-card.tsx
"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ROLE_LABELS } from "@/lib/constants";
import { resolveAvailability } from "@/lib/profile-helpers";
import type { Profile } from "@/lib/types";

function Yn({ value }: { value: boolean }) {
  return <Badge variant={value ? "default" : "secondary"}>{value ? "Sí" : "No"}</Badge>;
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 py-1.5">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="text-sm font-medium text-right">{children}</dd>
    </div>
  );
}

export function WorkInfoCard({ profile }: { profile: Profile }) {
  const contract = profile.contract_type;
  const sundays = resolveAvailability(profile.available_sundays, contract?.available_sundays ?? true);
  const holidays = resolveAvailability(profile.available_holidays, contract?.available_holidays ?? true);
  const nights = resolveAvailability(profile.available_nights, contract?.available_nights ?? true);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Información laboral</CardTitle>
      </CardHeader>
      <CardContent>
        <dl className="divide-y">
          <Row label="Rol">{ROLE_LABELS[profile.role] ?? profile.role}</Row>
          <Row label="Sede">{profile.location?.name ?? "—"}</Row>
          <Row label="Posición">{profile.position?.name ?? "—"}</Row>
          <Row label="Tipo de contrato">{contract?.name ?? "—"}</Row>
          <Row label="Fecha de ingreso">{profile.hire_date ?? "—"}</Row>
          <Row label="Trabaja domingos"><Yn value={sundays} /></Row>
          <Row label="Trabaja festivos"><Yn value={holidays} /></Row>
          <Row label="Trabaja noches"><Yn value={nights} /></Row>
        </dl>
        <p className="mt-4 text-xs text-muted-foreground">
          Estos datos los gestiona tu administrador.
        </p>
      </CardContent>
    </Card>
  );
}
```

(Si `profile.position`/`location` no están tipados como opcionales embebidos en `types.ts`, ajustarlos igual que en Task 3.)

- [ ] **Step 2: Crear la página shell que monta la tarjeta**

```tsx
// src/app/(authenticated)/perfil/page.tsx
"use client";

import { useAuth } from "@/hooks/use-auth";
import { PageHeader } from "@/components/shared/page-header";
import { WorkInfoCard } from "@/components/profile/work-info-card";
import { Loader2 } from "lucide-react";

export default function PerfilPage() {
  const { profile, user, loading } = useAuth();

  if (loading || !profile || !user) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Mi perfil" />
      <div className="grid gap-6 lg:grid-cols-2">
        <WorkInfoCard profile={profile} />
        {/* Las demás tarjetas se montan en tasks siguientes */}
      </div>
    </div>
  );
}
```

(Verificar el import real de `useAuth` — puede ser `@/hooks/use-auth` o `@/contexts/auth-context`. Usar el que use el resto de páginas de `(authenticated)`. Verificar la firma real de `PageHeader` — si `title` no es la prop, adaptarlo.)

- [ ] **Step 3: Verificar typecheck/lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: sin errores.

- [ ] **Step 4: Commit**

```bash
git add "src/app/(authenticated)/perfil/page.tsx" src/components/profile/work-info-card.tsx
git commit -m "feat(perfil): página /perfil + tarjeta de información laboral

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Tarjeta de datos personales (editar nombre/apellido/teléfono)

**NOTA:** invocar `modern-web-guidance:modern-web-guidance` (query: "form label aria-invalid validation") antes de escribir el form.

**Files:**
- Create: `src/components/profile/personal-data-card.tsx`
- Modify: `src/app/(authenticated)/perfil/page.tsx` (montar la tarjeta)

**Interfaces:**
- Consumes: `ProfileCardProps` (Task 4); `validatePhone` (Task 1); `createClient` (`@/lib/supabase/client`).
- Produces: `<PersonalDataCard profile user onUpdated />`

- [ ] **Step 1: Crear la tarjeta**

```tsx
// src/components/profile/personal-data-card.tsx
"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormField } from "@/components/shared/form-field";
import { createClient } from "@/lib/supabase/client";
import { validatePhone } from "@/lib/profile-helpers";
import type { Profile } from "@/lib/types";
import type { User } from "@supabase/supabase-js";

interface Props {
  profile: Profile;
  user: User;
  onUpdated: () => void | Promise<void>;
}

export function PersonalDataCard({ profile, onUpdated }: Props) {
  const [firstName, setFirstName] = useState(profile.first_name);
  const [lastName, setLastName] = useState(profile.last_name);
  const [phone, setPhone] = useState(profile.phone ?? "");
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setOk(false);
    if (!firstName.trim() || !lastName.trim()) {
      setError("Nombre y apellido son obligatorios.");
      return;
    }
    const phoneErr = validatePhone(phone);
    if (phoneErr) {
      setError(phoneErr);
      return;
    }
    setSaving(true);
    const supabase = createClient();
    const { error: dbErr } = await supabase
      .from("profiles")
      .update({
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        phone: phone.trim() || null,
      })
      .eq("id", profile.id);
    setSaving(false);
    if (dbErr) {
      setError(dbErr.message);
      return;
    }
    setOk(true);
    await onUpdated();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Datos personales</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <FormField label="Nombre" required>
            <Input value={firstName} onChange={(e) => setFirstName(e.target.value)} />
          </FormField>
          <FormField label="Apellido" required>
            <Input value={lastName} onChange={(e) => setLastName(e.target.value)} />
          </FormField>
          <FormField label="Teléfono">
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" />
          </FormField>
          {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
          {ok && <p className="text-sm text-emerald-600" role="status">Datos guardados.</p>}
          <Button type="submit" disabled={saving}>
            {saving ? "Guardando…" : "Guardar cambios"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
```

(Verificar las props reales de `FormField` — el CLAUDE.md indica `label, required?, error?, children`. Si expone `error`, pasar el error por ahí en vez del `<p>`.)

- [ ] **Step 2: Montar en la página**

En `perfil/page.tsx`, importar y añadir dentro del grid, antes de `WorkInfoCard`:

```tsx
import { PersonalDataCard } from "@/components/profile/personal-data-card";
// ...
        <PersonalDataCard profile={profile} user={user} onUpdated={refreshProfile} />
```

Y desestructurar `refreshProfile` de `useAuth()`.

- [ ] **Step 3: Verificar typecheck/lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: sin errores.

- [ ] **Step 4: Commit**

```bash
git add src/components/profile/personal-data-card.tsx "src/app/(authenticated)/perfil/page.tsx"
git commit -m "feat(perfil): tarjeta de datos personales editables

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Tarjeta de seguridad (cambiar contraseña)

**NOTA:** invocar `modern-web-guidance:modern-web-guidance` (query: "password field autocomplete new-password") antes de escribir el form.

**Files:**
- Create: `src/components/profile/security-card.tsx`
- Modify: `src/app/(authenticated)/perfil/page.tsx`

**Interfaces:**
- Consumes: `validatePasswordChange` (Task 1); `createClient`; `user.email`.
- Produces: `<SecurityCard user onUpdated />`

- [ ] **Step 1: Crear la tarjeta**

```tsx
// src/components/profile/security-card.tsx
"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormField } from "@/components/shared/form-field";
import { createClient } from "@/lib/supabase/client";
import { validatePasswordChange } from "@/lib/profile-helpers";
import type { User } from "@supabase/supabase-js";

export function SecurityCard({ user }: { user: User }) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setOk(false);
    const vErr = validatePasswordChange(current, next, confirm);
    if (vErr) {
      setError(vErr);
      return;
    }
    setSaving(true);
    const supabase = createClient();
    // 1) Verificar la contraseña actual re-autenticando.
    const { error: signInErr } = await supabase.auth.signInWithPassword({
      email: user.email ?? "",
      password: current,
    });
    if (signInErr) {
      setSaving(false);
      setError("La contraseña actual es incorrecta.");
      return;
    }
    // 2) Actualizar a la nueva.
    const { error: updErr } = await supabase.auth.updateUser({ password: next });
    setSaving(false);
    if (updErr) {
      setError(updErr.message);
      return;
    }
    setOk(true);
    setCurrent("");
    setNext("");
    setConfirm("");
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Seguridad</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <FormField label="Contraseña actual" required>
            <Input type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} />
          </FormField>
          <FormField label="Nueva contraseña" required>
            <Input type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} />
          </FormField>
          <FormField label="Confirmar nueva contraseña" required>
            <Input type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
          </FormField>
          {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
          {ok && <p className="text-sm text-emerald-600" role="status">Contraseña actualizada.</p>}
          <Button type="submit" disabled={saving}>
            {saving ? "Actualizando…" : "Cambiar contraseña"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 2: Montar en la página**

```tsx
import { SecurityCard } from "@/components/profile/security-card";
// dentro del grid:
        <SecurityCard user={user} />
```

- [ ] **Step 3: Verificar typecheck/lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: sin errores.

- [ ] **Step 4: Commit**

```bash
git add src/components/profile/security-card.tsx "src/app/(authenticated)/perfil/page.tsx"
git commit -m "feat(perfil): tarjeta de seguridad — cambio de contraseña con verificación

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: Tarjeta de correo (cambiar email con confirmación)

**NOTA:** invocar `modern-web-guidance:modern-web-guidance` (query: "form label email input") antes de escribir el form.

**Files:**
- Create: `src/components/profile/email-card.tsx`
- Modify: `src/app/(authenticated)/perfil/page.tsx`

**Interfaces:**
- Consumes: `validateEmail` (Task 1); `createClient`; `user.email`.
- Produces: `<EmailCard user />`

- [ ] **Step 1: Crear la tarjeta**

```tsx
// src/components/profile/email-card.tsx
"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormField } from "@/components/shared/form-field";
import { createClient } from "@/lib/supabase/client";
import { validateEmail } from "@/lib/profile-helpers";
import type { User } from "@supabase/supabase-js";

export function EmailCard({ user }: { user: User }) {
  const [editing, setEditing] = useState(false);
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const vErr = validateEmail(email);
    if (vErr) {
      setError(vErr);
      return;
    }
    if (email.trim().toLowerCase() === (user.email ?? "").toLowerCase()) {
      setError("Ese ya es tu correo actual.");
      return;
    }
    setSaving(true);
    const supabase = createClient();
    const { error: updErr } = await supabase.auth.updateUser({ email: email.trim() });
    setSaving(false);
    if (updErr) {
      setError(updErr.message);
      return;
    }
    setSent(true);
    setEditing(false);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Correo</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <p className="text-sm text-muted-foreground">Correo actual</p>
          <p className="text-sm font-medium">{user.email}</p>
        </div>

        {sent && (
          <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2.5" role="status">
            Te enviamos un enlace de confirmación al nuevo correo. El cambio se aplica cuando lo abras.
            Si no llega, revisa spam o la cuarentena de tu proveedor.
          </p>
        )}

        {!editing && !sent && (
          <Button variant="outline" onClick={() => setEditing(true)}>Cambiar correo</Button>
        )}

        {editing && (
          <form onSubmit={handleSubmit} className="space-y-4">
            <FormField label="Nuevo correo" required>
              <Input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </FormField>
            {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
            <div className="flex gap-2">
              <Button type="submit" disabled={saving}>{saving ? "Enviando…" : "Enviar confirmación"}</Button>
              <Button type="button" variant="ghost" onClick={() => { setEditing(false); setError(null); }}>Cancelar</Button>
            </div>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 2: Montar en la página**

```tsx
import { EmailCard } from "@/components/profile/email-card";
// dentro del grid:
        <EmailCard user={user} />
```

- [ ] **Step 3: Verificar typecheck/lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: sin errores.

- [ ] **Step 4: Commit**

```bash
git add src/components/profile/email-card.tsx "src/app/(authenticated)/perfil/page.tsx"
git commit -m "feat(perfil): tarjeta de correo — cambio con confirmación

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: Tarjeta de foto de perfil (avatar + Storage)

**NOTA:** invocar `modern-web-guidance:modern-web-guidance` (query: "file input upload accessible button") antes de escribir el componente.

**Files:**
- Create: `src/components/profile/avatar-card.tsx`
- Modify: `src/app/(authenticated)/perfil/page.tsx`

**Interfaces:**
- Consumes: `validateAvatarFile`, `getInitials` (Task 1); `createClient`; bucket `avatars` (Task 2); `profile.avatar_url`.
- Produces: `<AvatarCard profile user onUpdated />`

- [ ] **Step 1: Crear la tarjeta**

```tsx
// src/components/profile/avatar-card.tsx
"use client";

import { useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { validateAvatarFile, getInitials } from "@/lib/profile-helpers";
import type { Profile } from "@/lib/types";
import type { User } from "@supabase/supabase-js";

interface Props {
  profile: Profile;
  user: User;
  onUpdated: () => void | Promise<void>;
}

const EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

export function AvatarCard({ profile, user, onUpdated }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // permitir re-seleccionar el mismo archivo
    if (!file) return;
    setError(null);
    const vErr = validateAvatarFile({ type: file.type, size: file.size });
    if (vErr) {
      setError(vErr);
      return;
    }
    setBusy(true);
    const supabase = createClient();
    const path = `${user.id}/avatar.${EXT[file.type]}`;
    const { error: upErr } = await supabase.storage
      .from("avatars")
      .upload(path, file, { upsert: true, contentType: file.type });
    if (upErr) {
      setBusy(false);
      setError(upErr.message);
      return;
    }
    const { data: pub } = supabase.storage.from("avatars").getPublicUrl(path);
    const url = `${pub.publicUrl}?t=${Date.now()}`; // cache-busting
    const { error: dbErr } = await supabase
      .from("profiles")
      .update({ avatar_url: url })
      .eq("id", profile.id);
    setBusy(false);
    if (dbErr) {
      setError(dbErr.message);
      return;
    }
    await onUpdated();
  }

  async function handleRemove() {
    setBusy(true);
    setError(null);
    const supabase = createClient();
    // Borrar posibles extensiones subidas.
    await supabase.storage
      .from("avatars")
      .remove([`${user.id}/avatar.jpg`, `${user.id}/avatar.png`, `${user.id}/avatar.webp`]);
    const { error: dbErr } = await supabase
      .from("profiles")
      .update({ avatar_url: null })
      .eq("id", profile.id);
    setBusy(false);
    if (dbErr) {
      setError(dbErr.message);
      return;
    }
    await onUpdated();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Foto de perfil</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex items-center gap-4">
          {profile.avatar_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={profile.avatar_url}
              alt="Foto de perfil"
              className="h-20 w-20 rounded-full object-cover border"
            />
          ) : (
            <div className="h-20 w-20 rounded-full bg-muted flex items-center justify-center text-lg font-semibold text-muted-foreground">
              {getInitials(profile.first_name, profile.last_name)}
            </div>
          )}
          <div className="flex flex-col gap-2">
            <input
              ref={inputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="sr-only"
              onChange={handleFile}
            />
            <Button type="button" variant="outline" disabled={busy} onClick={() => inputRef.current?.click()}>
              {busy ? "Procesando…" : profile.avatar_url ? "Cambiar foto" : "Subir foto"}
            </Button>
            {profile.avatar_url && (
              <Button type="button" variant="ghost" disabled={busy} onClick={handleRemove}>
                Quitar foto
              </Button>
            )}
          </div>
        </div>
        {error && <p className="mt-3 text-sm text-destructive" role="alert">{error}</p>}
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 2: Montar en la página**

```tsx
import { AvatarCard } from "@/components/profile/avatar-card";
// como primera tarjeta del grid (arriba):
        <AvatarCard profile={profile} user={user} onUpdated={refreshProfile} />
```

- [ ] **Step 3: Verificar typecheck/lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: sin errores.

- [ ] **Step 4: Commit**

```bash
git add src/components/profile/avatar-card.tsx "src/app/(authenticated)/perfil/page.tsx"
git commit -m "feat(perfil): tarjeta de foto de perfil con Supabase Storage

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 9: Navegación — ítem "Mi perfil" + menú en el bloque de usuario

**NOTA:** invocar `modern-web-guidance:modern-web-guidance` (query: "dropdown menu button keyboard accessible") antes de tocar el sidebar.

**Files:**
- Modify: `src/components/layout/sidebar.tsx`

**Interfaces:**
- Consumes: `useAuth()` (`profile`, `signOut`); shadcn `DropdownMenu`; lucide `User`, `LogOut`.

- [ ] **Step 1: Añadir el ítem "Mi perfil" al nav**

En la lista de enlaces operativos del sidebar (junto a los demás módulos, sin restricción de rol), añadir:

```tsx
{ name: "Mi perfil", href: "/perfil", icon: User, roles: ["super_admin", "admin", "manager", "employee"] },
```

Importar `User` de `lucide-react` si no está.

- [ ] **Step 2: Convertir el bloque de usuario en un menú**

Reemplazar el bloque `{/* User info */}` (el `<div>` con nombre/rol + botón "Cerrar sesión") por un `DropdownMenu` de shadcn cuyo trigger es el bloque nombre+rol (como botón accesible) y cuyo contenido tiene dos ítems:

```tsx
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import Link from "next/link";
import { User, LogOut } from "lucide-react";

// ... dentro del pie del sidebar:
<div className="border-t p-4">
  {profile && (
    <DropdownMenu>
      <DropdownMenuTrigger className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left hover:bg-accent">
        <div className="flex-1">
          <p className="text-sm font-medium">{profile.first_name} {profile.last_name}</p>
          <p className="text-xs text-muted-foreground">{ROLE_LABELS[profile.role]}</p>
        </div>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuItem asChild>
          <Link href="/perfil"><User className="mr-2 h-4 w-4" />Mi perfil</Link>
        </DropdownMenuItem>
        <DropdownMenuItem onClick={signOut}>
          <LogOut className="mr-2 h-4 w-4" />Cerrar sesión
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )}
</div>
```

(Si `src/components/ui/dropdown-menu.tsx` no existe, generarlo con `npx shadcn@latest add dropdown-menu` — verificar primero con `ls src/components/ui/dropdown-menu.tsx`.)

- [ ] **Step 3: Verificar typecheck/lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: sin errores.

- [ ] **Step 4: Commit**

```bash
git add src/components/layout/sidebar.tsx src/components/ui/dropdown-menu.tsx
git commit -m "feat(perfil): acceso desde sidebar (ítem + menú de usuario)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 10: Verificación end-to-end (smoke) + build

**Files:** ninguno (verificación).

- [ ] **Step 1: Build de producción**

Run: `npm run build`
Expected: build exitoso, `/perfil` en la lista de rutas.

- [ ] **Step 2: Correr toda la suite de tests**

Run: `npm run test`
Expected: todos los tests pasan (incluye `profile-helpers`).

- [ ] **Step 3: Smoke manual en navegador (dev)**

Con `npm run dev`, autenticado como un empleado de prueba, verificar en `/perfil`:
- Datos personales: cambiar teléfono → "Datos guardados" y el cambio persiste al recargar.
- Seguridad: contraseña actual incorrecta → error; correcta + nueva válida → "Contraseña actualizada".
- Foto: subir PNG < 2 MB → aparece; subir PDF → error de tipo; quitar → vuelve a iniciales.
- Correo: cambiar → aviso de confirmación.
- Info laboral: muestra rol/sede/posición/contrato/ingreso/disponibilidad correctos.
- Sidebar: ítem "Mi perfil" navega; el menú de usuario abre con teclado y tiene "Mi perfil" + "Cerrar sesión".
- Escalada bloqueada: en la consola del navegador, `supabase.from('profiles').update({role:'admin'}).eq('id', <miId>)` devuelve error (guard activo).

- [ ] **Step 4: Commit (si hubo ajustes de smoke)**

```bash
git add -A
git commit -m "chore(perfil): ajustes de verificación end-to-end

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Notas de cierre

- Tras el smoke, seguir la skill `superpowers:finishing-a-development-branch` para abrir PR contra `main`.
- Recordar la limitación conocida: el cambio de correo depende de la entrega SMTP, que sigue fallando para dominios Microsoft 365 (incidente 2026-07-01) — no se resuelve en este plan.
