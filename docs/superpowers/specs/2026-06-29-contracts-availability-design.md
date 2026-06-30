# Spec — Lote "Contratos y disponibilidad por empleado"

**Fecha:** 2026-06-29
**Estado:** Aprobado (diseño)
**Rama:** `feature/contracts-availability`

## Contexto y motivación

Surgió de un caso real: la empleada **Manuela Quintero García** (contrato "Full-time") **no debe trabajar festivos**, pero hoy no hay forma de configurarlo sin afectar a los demás empleados del mismo contrato. La exploración del código reveló cuatro problemas relacionados, todos en torno a tipos de contrato y disponibilidad:

1. **La disponibilidad de festivos/domingos/noches vive solo en el tipo de contrato** (`available_sundays/holidays/nights` en `contract_types`), sin override por empleado. El motor la lee en `schedule-generator.ts:286-288` desde `contract = ctx.contractTypes.get(emp.contract_type_id)`. Ninguna de las 5 reglas de descanso individuales (`employee_rest_rules`) puede expresar "no trabaja festivos".
2. **Los nombres de contrato están en inglés** ("Full-time", "Part-time", "Asistencial Full-time") — la app es para mercado latinoamericano. Son **datos** sembrados en inglés en la migración `014`, no literales de UI.
3. **Crear empleado no pide tipo de contrato** → todos caen al default "Sin definir". Ni "Crear demo" ni "Invitar" envían `contract_type_id`; el default es de columna (`profiles.contract_type_id DEFAULT '…0001'`, migración `015`).
4. **Las organizaciones nuevas nacen sin ningún tipo de contrato** — el seed de la `014` pertenece solo a Les Raptors; el onboarding/`approve_demo_request` (042) no siembra contratos.

## Decisiones cerradas

- Override de disponibilidad **por empleado** (no contrato dedicado), con semántica tri-estado (Hereda / Sí / No).
- Traducciones: `Full-time → Tiempo completo`, `Part-time → Medio tiempo`, `Asistencial Full-time → Asistencial tiempo completo`. **No** se tocan `Fin de semana` ni `Sin definir`.
- Set base para orgs nuevas (5): **Sin definir, Tiempo completo, Medio tiempo, Fin de semana, Asistencial tiempo completo**.
- **Fuera de alcance (Fase 2, spec propio):** "trabaja festivos pero con horario diferente" — eso se resuelve con un **turno de festivo** + un **perfil de festivo en Necesidades** (`staffing_requirements` + `buildDemandSlots`), porque en este modelo el horario lo define el turno, no el empleado.

---

## Pieza 1 — Traducir nombres de contratos al español

**Objetivo:** que los tipos de contrato existentes se muestren en español.

**Implementación:**
- **Migración SQL** `UPDATE contract_types SET name = ...` idempotente, mapeando por nombre actual:
  - `'Full-time' → 'Tiempo completo'`
  - `'Part-time' → 'Medio tiempo'`
  - `'Asistencial Full-time' → 'Asistencial tiempo completo'`
- **No** se modifican `'Fin de semana'` ni `'Sin definir'`.
- **Sobre `employees/page.tsx:907`** (`contract?.name === "Sin definir"`): **no requiere cambio**. Como `'Sin definir'` no se traduce y es un nombre estable presente en cada org (Pieza 4 lo siembra con ese mismo nombre), la comparación por nombre sigue siendo correcta y multi-tenant-safe. (Comparar por el UUID `…0001` sería *incorrecto*: ese UUID es solo el de Les Raptors, no el "Sin definir" de orgs nuevas.) Se mantiene la convención de que el tipo por defecto siempre se llama `'Sin definir'`.

**Riesgo:** bajo. El `UPDATE` solo afecta filas con esos tres nombres (hoy solo existen en Les Raptors). El default de columna es por UUID, no por nombre, así que sobrevive a la traducción.

---

## Pieza 2 — Tipo de contrato obligatorio al crear empleado

**Objetivo:** que ningún empleado nazca "Sin definir" por omisión.

**Implementación:**
- **Carga de datos:** los tres formularios cargan `contract_types` de la org efectiva (`effectiveOrgId`), ordenados por nombre.
- **UI** (`src/app/(authenticated)/employees/page.tsx`):
  - "Crear empleado demo" (dialog `~1681-1872`): agregar `Select` de tipo de contrato **obligatorio** (sin opción vacía; validación que impide submit si no se eligió).
  - "Invitar empleado" (dialog `~1044-1260`): igual.
  - "Editar empleado" (dialog `~1265-1676`): agregar el mismo `Select` al `EditForm` (hoy el contrato solo se cambia con el select inline de la tabla, `~942-962`). El select inline de la tabla se mantiene.
- **API:**
  - `src/app/api/employees/demo/route.ts`: aceptar `contract_type_id` en el body (validado, requerido) y setearlo en el insert (`~92-104`).
  - `src/app/api/employees/invite/route.ts`: aceptar `contract_type_id` y setearlo en el `update` posterior a la invitación (`~138-151`).
- **Validación de pertenencia:** el endpoint verifica que el `contract_type_id` pertenezca a la org efectiva (evita asignar un contrato de otra org). Patrón consistente con la verificación de tenant existente.

**Riesgo:** bajo-medio. Cambia el contrato de creación de los endpoints (ahora requieren un campo más). Los forms deben manejar el caso "la org no tiene contratos aún" (no debería pasar tras Pieza 4, pero se muestra un mensaje claro si la lista está vacía).

---

## Pieza 3 — Override de disponibilidad por empleado

**Objetivo:** que un empleado individual pueda pisar la disponibilidad de su contrato (resuelve Manuela).

**Implementación:**
- **Migración:** agregar a `profiles` tres columnas nullable:
  ```sql
  ALTER TABLE profiles
    ADD COLUMN available_sundays  BOOLEAN,
    ADD COLUMN available_holidays BOOLEAN,
    ADD COLUMN available_nights   BOOLEAN;
  ```
  `NULL` = "hereda del contrato" (default). No requiere backfill.
- **Motor** (`src/lib/schedule-generator.ts:286-288`): cambiar las tres condiciones inviolables de
  ```ts
  if (contract?.available_holidays === false && isHoliday(...)) continue;
  ```
  a
  ```ts
  const availHolidays = emp.available_holidays ?? contract?.available_holidays;
  if (availHolidays === false && isHoliday(...)) continue;
  ```
  (idéntico para `available_sundays` y `available_nights`). El objeto `emp` ya está en scope (`ctx`/candidato).
- **Tipos:** regenerar `database.types.ts`; agregar los 3 campos a la interfaz `Profile` en `src/lib/types.ts` como **opcionales/nullable** (`available_holidays?: boolean | null`) para no romper los mocks de test existentes.
- **UI** (`EditForm`, `employees/page.tsx`): nueva sección "Disponibilidad" (cerca de "Reglas de descanso individuales", `~1519-1533`), con **3 selects de tres estados** — Domingos, Festivos, Noches — cada uno con opciones *Hereda del contrato* (`null`), *Disponible* (`true`), *No disponible* (`false`). Persistir en el `update` del profile dentro de `handleEdit`.
- **Tests** (Vitest, pura lógica):
  - Test del motor: un empleado con `available_holidays = false` y contrato con `available_holidays = true` **no** se asigna a festivos; con `null` hereda el contrato.
  - Actualizar mocks `Profile` afectados solo si los campos se vuelven requeridos (se mantienen opcionales para evitarlo).

**Riesgo:** medio. Toca el motor (inviolables) → revisión obligatoria por `schedule-algorithm-reviewer`. Retrocompatible: `NULL` preserva el comportamiento actual.

---

## Pieza 4 — Orgs nuevas nacen con contratos base en español

**Objetivo:** que cada organización nueva arranque con un set usable de tipos de contrato en español.

**Implementación:**
- **Pre-requisito (corrige bug multi-tenant latente):** la constraint `UNIQUE(name)` global de `contract_types` (migración `014:3`, nunca cambiada) impide que dos orgs tengan el mismo nombre. Migración:
  ```sql
  ALTER TABLE contract_types DROP CONSTRAINT IF EXISTS contract_types_name_key;
  ALTER TABLE contract_types ADD CONSTRAINT contract_types_org_name_key UNIQUE (organization_id, name);
  ```
- **Función de seed** `seed_default_contract_types(p_org_id uuid)` (`SECURITY DEFINER`, `SET search_path = public`): inserta los 5 tipos base para `p_org_id` (idempotente vía `ON CONFLICT (organization_id, name) DO NOTHING`):
  - **Sin definir** — `weekly_hours_mode = 'full'`, `is_healthcare = false`, disponibilidad `true/true/true` (mismos valores que el "Sin definir" actual, pero con UUID propio por org).
  - **Tiempo completo** — full, no asistencial, disponibilidad true/true/true.
  - **Medio tiempo** — partial (`weekly_hours = 24`), no asistencial, true/true/true.
  - **Fin de semana** — partial (24), no asistencial, disponible domingos/festivos, noches `false`.
  - **Asistencial tiempo completo** — full, `is_healthcare = true`, disponibilidad true/true/true.
- **Enganche:** trigger `AFTER INSERT ON organizations` que llama a `seed_default_contract_types(NEW.id)`. Se elige trigger (no inline en `approve_demo_request`) para cubrir **cualquier** camino de creación de org. El plan verificará que no rompe el onboarding wizard ni el seed de Les Raptors (que ya tiene sus contratos y no se re-inserta).

**Nota de riesgo / follow-up (no en este lote):** `profiles.contract_type_id` tiene `DEFAULT '…0001'` (el "Sin definir" de Les Raptors). Para empleados de otras orgs sin contrato explícito, ese default es cross-tenant (no visible por RLS de su org). La **Pieza 2** lo mitiga (asignación explícita obligatoria). Resolverlo del todo (quitar el default de columna o resolver el "Sin definir" por org) se deja como follow-up documentado.

**Riesgo:** medio. Toca constraint + creación de orgs. Revisión obligatoria por `migration-reviewer`. El cambio de constraint es seguro (Les Raptors no tiene nombres duplicados).

---

## Orden de implementación sugerido

1. **Pieza 1** (traducción) — aislada, rápida, valor inmediato.
2. **Pieza 4** (UNIQUE per-org + seed) — habilita orgs nuevas; el cambio de constraint conviene antes de tocar más contratos.
3. **Pieza 2** (contrato obligatorio) — depende de que existan contratos para elegir (Pieza 4 para orgs nuevas; LR ya los tiene).
4. **Pieza 3** (override disponibilidad) — la más independiente; toca motor + UI editor.

## Validación

Flujo `/superpowers` completo: spec → plan → implementar → `/code-review`. Reviewers obligatorios:
- `migration-reviewer` para cada migración nueva (Piezas 1, 3, 4).
- `schedule-algorithm-reviewer` tras tocar `schedule-generator.ts` (Pieza 3).
- `security-reviewer` tras tocar los endpoints de empleados (Pieza 2).
- `npm run typecheck` y `npm run test` verdes; regenerar `database.types.ts` tras migraciones.

## Criterios de éxito

- [ ] Los tipos de contrato de Les Raptors se ven en español (Tiempo completo / Medio tiempo / Asistencial tiempo completo).
- [ ] El badge "Sin definir" sigue funcionando (comparación por nombre, que es estable y per-org; no se renombra "Sin definir").
- [ ] Crear demo, Invitar y Editar exigen/permiten elegir tipo de contrato; ningún empleado nuevo cae a "Sin definir" por omisión.
- [ ] Un empleado con "Festivos: No disponible" no se asigna a festivos aunque su contrato sí lo permita; "Hereda" preserva el comportamiento del contrato.
- [ ] Una organización nueva arranca con los 5 tipos de contrato base en español.
- [ ] `npm run typecheck` y `npm run test` verdes; `/code-review` sin bloqueadores.

## Fuera de alcance

- **Horario diferente en festivos** (turno de festivo + perfil de festivo en Necesidades) → **Fase 2**, spec propio.
- Resolver el `DEFAULT` cross-tenant de `profiles.contract_type_id` → follow-up documentado.
- Renombrar `Sin definir` / `Fin de semana` (ya están en español).
