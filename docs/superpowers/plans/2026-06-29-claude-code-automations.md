# Lote de automatizaciones Claude Code — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Crear 4 automatizaciones de Claude Code (1 hook de protección, 1 skill de type-check, 1 subagent de seguridad, 1 skill de smoke-test) sin tocar código de producción de la app.

**Architecture:** Todos los artefactos viven en `.claude/` salvo 1 línea de script en `package.json`. Se clonan los patrones de los hooks/agents/skills existentes del proyecto. El hook bash es el único con lógica real (se construye TDD-style con casos de prueba por exit code); los demás son archivos Markdown/JSON validados por sintaxis y descubribilidad.

**Tech Stack:** Bash + `jq` (hooks), Markdown + YAML frontmatter (agents/skills), JSON (settings), `tsc` (typecheck).

## Global Constraints

- Todo el texto de cara al usuario en **español**, con acentos correctos (`posición`, `día`, `acción`, etc.).
- Sin emojis en archivos (usar texto/lucide en su lugar).
- Rama de trabajo: `chore/claude-code-automations` (ya creada; el spec ya está committeado ahí en `9e0b45f`).
- Patrón de hooks: leer stdin JSON → extraer `.tool_input.file_path` con `jq` → `exit 0` = permitir/skip, `exit 2` = bloquear con mensaje a stderr.
- Patrón de agents: frontmatter `name` / `description` / `tools: Read, Glob, Grep, Bash` / `model: opus`; cuerpo con checklist; reporta solo issues reales.
- Mensaje de commit termina con: `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`
- Project ID Supabase: `ugkvuinkynvtuiutwlkd`. Roles: `admin`/`manager`/`employee`/`super_admin`.

---

### Task 1: Hook `guard-env-files.sh` + registro en settings.json

**Files:**
- Create: `.claude/hooks/guard-env-files.sh`
- Modify: `.claude/settings.json` (añadir 2º comando al matcher `Edit|Write` PreToolUse)
- Test: validación inline por exit code (sin framework — es un hook bash)

**Interfaces:**
- Consumes: stdin JSON con forma `{"tool_input":{"file_path":"..."}}` (contrato de PreToolUse de Claude Code).
- Produces: exit code `0` (permitir) o `2` (bloquear) + mensaje a stderr. Lo consume el runtime de hooks de Claude Code.

- [ ] **Step 1: Escribir el script del hook**

Create `.claude/hooks/guard-env-files.sh`:

```bash
#!/bin/bash
# PreToolUse hook: bloquea editar archivos .env con secrets de producción
# (Wompi prod keys, SUPABASE_SERVICE_ROLE_KEY). Permite .env.example, que es
# la plantilla versionada y se edita normalmente.
#
# Exit 0 = permitir / skip
# Exit 2 = bloquear (Claude ve stderr y reacciona)

set -u
INPUT=$(cat)
FILE=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty' 2>/dev/null)

[[ -z "$FILE" ]] && exit 0

BASENAME=$(basename "$FILE")

case "$BASENAME" in
  .env.example)
    # Plantilla versionada — editar permitido.
    exit 0
    ;;
  .env|.env.*)
    echo "BLOQUEADO: $BASENAME contiene secrets de producción (Wompi keys, service_role)." >&2
    echo "" >&2
    echo "No edites este archivo desde Claude:" >&2
    echo "  → Edítalo manualmente en tu editor para no exponer secrets en un diff." >&2
    echo "" >&2
    echo "Si solo querés documentar una variable nueva, hazlo en .env.example." >&2
    exit 2
    ;;
esac

exit 0
```

- [ ] **Step 2: Hacerlo ejecutable**

Run: `chmod +x .claude/hooks/guard-env-files.sh`
Expected: sin output, exit 0.

- [ ] **Step 3: Verificar los casos por exit code (la "prueba")**

Run:
```bash
echo '{"tool_input":{"file_path":"/x/.env"}}'         | bash .claude/hooks/guard-env-files.sh; echo "env=$?"
echo '{"tool_input":{"file_path":"/x/.env.local"}}'   | bash .claude/hooks/guard-env-files.sh; echo "local=$?"
echo '{"tool_input":{"file_path":"/x/.env.example"}}' | bash .claude/hooks/guard-env-files.sh; echo "example=$?"
echo '{"tool_input":{"file_path":"/x/src/foo.tsx"}}'  | bash .claude/hooks/guard-env-files.sh; echo "tsx=$?"
echo '{"tool_input":{}}'                               | bash .claude/hooks/guard-env-files.sh; echo "empty=$?"
```
Expected (stderr del bloqueo aparte):
```
env=2
local=2
example=0
tsx=0
empty=0
```
Si algún exit code no coincide, arreglar el `case` antes de continuar.

- [ ] **Step 4: Registrar el hook en settings.json**

Modify `.claude/settings.json` — en el array `hooks` del matcher `Edit|Write` dentro de `PreToolUse`, añadir un 2º comando después del de `guard-applied-migration.sh`:

```json
        "hooks": [
          {
            "type": "command",
            "command": "bash \"$CLAUDE_PROJECT_DIR/.claude/hooks/guard-applied-migration.sh\""
          },
          {
            "type": "command",
            "command": "bash \"$CLAUDE_PROJECT_DIR/.claude/hooks/guard-env-files.sh\""
          }
        ]
```

- [ ] **Step 5: Verificar que settings.json sigue siendo JSON válido y que el hook previo quedó intacto**

Run:
```bash
jq '.hooks.PreToolUse[0].hooks | length' .claude/settings.json
jq -r '.hooks.PreToolUse[0].hooks[].command' .claude/settings.json
```
Expected: `2` y las 2 líneas de comando (guard-applied-migration y guard-env-files). Si `jq` falla, el JSON quedó malformado — corregir.

- [ ] **Step 6: Commit**

```bash
git add .claude/hooks/guard-env-files.sh .claude/settings.json
git commit -m "feat(hooks): guard-env-files bloquea editar .env* (permite .env.example)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Script `typecheck` en package.json + skill `/typecheck`

**Files:**
- Modify: `package.json` (añadir script `typecheck`)
- Create: `.claude/skills/typecheck/SKILL.md`

**Interfaces:**
- Consumes: `tsconfig.json` existente (`noEmit: true`, `incremental: true`, `strict: true`).
- Produces: comando `npm run typecheck` invocable; skill `/typecheck` descubrible por nombre.

- [ ] **Step 1: Añadir el script a package.json**

Modify `package.json` — en `"scripts"`, después de `"lint": "next lint",`, añadir:

```json
    "typecheck": "tsc --noEmit",
```

- [ ] **Step 2: Verificar que el script corre**

Run: `npm run typecheck`
Expected: termina sin error de configuración. Si hay errores de tipo preexistentes en el repo, anótalos pero NO los arregles aquí (fuera de alcance) — lo importante es que el comando funciona. Si `tsc` no se encuentra, verificar que `typescript` está en devDependencies (lo está).

- [ ] **Step 3: Crear el skill**

Create `.claude/skills/typecheck/SKILL.md`:

```markdown
---
name: typecheck
description: Corre el type-check de TypeScript (tsc --noEmit) sobre todo el proyecto y reporta errores de tipo agrupados por archivo. Útil antes de commitear cambios en componentes .tsx, que el hook de vitest (solo cubre src/lib) no valida.
---

# Type-check

Cuando el usuario invoque `/typecheck`, corre el chequeo de tipos de todo el proyecto.

## Pasos

1. **Corre el type-check**:
   ```bash
   npm run typecheck
   ```
   (Usa `tsc --noEmit` con `incremental` + `tsconfig.tsbuildinfo` → rápido tras el primer build.)

2. **Si pasa (exit 0)**: confirma **"Type-check OK — cero errores de tipo."**

3. **Si falla**: agrupa los errores por archivo y, para cada uno, muestra:
   - `path/al/archivo.tsx:línea:columna`
   - el código de error de TS (ej. `TS2322`) y el mensaje
   Luego propón los fixes concretos. No los apliques sin confirmación si tocan lógica de negocio.

## Notas

- Cubre los ~289 archivos `.ts`/`.tsx`. El hook `test-on-lib-edit.sh` solo corre Vitest sobre `src/lib/`, así que los componentes/páginas no tienen otro guard local antes del build de Vercel.
- Si el usuario pasa un argumento con una ruta, podés acotar mentalmente el reporte a esa ruta, pero `tsc` siempre chequea el proyecto completo (no acepta archivo suelto con el tsconfig de Next).
```

- [ ] **Step 4: Verificar el frontmatter del skill**

Run:
```bash
head -4 .claude/skills/typecheck/SKILL.md
```
Expected: bloque `---` con `name: typecheck` y `description:` en una sola línea. Confirmar que no hay líneas en blanco dentro del frontmatter ni dos puntos sin comillas que rompan el YAML.

- [ ] **Step 5: Commit**

```bash
git add package.json .claude/skills/typecheck/SKILL.md
git commit -m "feat(skill): /typecheck corre tsc --noEmit sobre los .tsx

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Subagent `security-reviewer`

**Files:**
- Create: `.claude/agents/security-reviewer.md`

**Interfaces:**
- Consumes: lee el codebase (Read/Glob/Grep/Bash). Sigue el mismo contrato que `migration-reviewer.md` / `schedule-algorithm-reviewer.md`.
- Produces: subagent `security-reviewer` despachable; reporta en 3 secciones (Bloqueadores / Warnings / Follow-ups).

- [ ] **Step 1: Crear el agent**

Create `.claude/agents/security-reviewer.md`:

```markdown
---
name: security-reviewer
description: Revisa cambios en superficie sensible — API routes, billing Wompi/DIAN, crypto, webhooks, auth, service_role, RLS/multi-tenant. Despáchalo tras tocar src/app/api/**, src/lib/billing/**, src/lib/billing/crypto.ts, o cualquier uso de createAdminClient()/service_role.
tools: Read, Glob, Grep, Bash
model: opus
---

# Security Reviewer

Eres un revisor de seguridad especializado en este proyecto (App Horarios — Next.js + Supabase + RLS, SaaS multi-tenant con billing Wompi y facturación electrónica DIAN).

## Tu objetivo

Antes de mergear cambios en la superficie sensible, audita que no introducen fugas de secrets, bypass de auth, ni filtración de datos entre tenants. Reporta **solo issues reales** — no comentes estilo.

## Checklist obligatorio

Revisa los archivos cambiados (o los que te pase el usuario). Si no te pasan diff, usa `git diff main...HEAD --name-only` para acotar.

### 1. Webhooks (src/app/api/webhooks/**)
- [ ] La firma del webhook (Wompi) se verifica ANTES de procesar el payload
- [ ] Se rechaza (4xx) si la firma no valida — no se procesa "por las dudas"
- [ ] Es idempotente ante reintentos (no duplica cobros/eventos)

### 2. IDs sensibles desde la sesión, no del body
- [ ] Las API routes que modifican datos cross-user toman IDs sensibles (user_id, organization_id) de la sesión/cookie, NO del request body cuando la sesión ya los tiene (convención del proyecto en CLAUDE.md)

### 3. service_role / createAdminClient
- [ ] `createAdminClient()` / `SUPABASE_SERVICE_ROLE_KEY` nunca importado en archivos `"use client"`
- [ ] El cliente admin solo se usa en API routes server-side, nunca expuesto al browser
- [ ] No se devuelve el service_role key ni se filtra a logs

### 4. Secrets
- [ ] No hay `console.log` de secrets, tokens, keys, ni payloads con datos de tarjeta
- [ ] No hay secrets hardcodeados (deben venir de env vars)
- [ ] Las respuestas HTTP no incluyen secrets ni internals sensibles

### 5. Tenant isolation (multi-tenant)
- [ ] Toda query nueva filtra por `organization_id` (o pasa por una RLS policy que lo hace)
- [ ] Las rutas/operaciones de `super_admin` usan `effectiveOrgId` (la org en la que está operando) y NO el `organization_id` literal de la sesión del super_admin — regresión histórica real (commit a01645a: festivos por sede)
- [ ] No hay forma de que un usuario lea/escriba datos de otra organización

### 6. Validación + auth
- [ ] El input de las API routes se valida con `zod` antes de usarse
- [ ] Hay check de auth/rol ANTES de operaciones privilegiadas (no confiar solo en RLS para acciones destructivas)

### 7. Crypto (src/lib/billing/crypto.ts)
- [ ] Las comparaciones de firma/HMAC usan comparación de tiempo constante (no `===` sobre strings de firma)
- [ ] El algoritmo y el orden de concatenación coinciden con la spec de Wompi
- [ ] No hay fugas por timing ni por mensajes de error que revelen el secret

## Formato del reporte

```
## Security review: <scope>

### Bloqueadores (arreglar antes de mergear)
- archivo:línea — descripción del riesgo + fix sugerido

### Warnings (revisa, puede ser intencional)
- ...

### Follow-ups (no bloquean, pero conviene)
- ...
```

Si todo está OK, di: **"Security review OK. Sin bloqueadores."**

## Contexto del proyecto

- Project ID Supabase: `ugkvuinkynvtuiutwlkd`
- Clientes Supabase: `src/lib/supabase/client.ts` (browser singleton), `server.ts` (cookies, API routes), `admin.ts` (service_role, bypassa RLS)
- Billing: `src/lib/billing/` (engine, crypto, dunning, DIAN, Wompi client en `src/lib/billing/wompi/`)
- Webhooks: `src/app/api/webhooks/wompi`
- Roles: `admin`, `manager`, `employee`, `super_admin`
- Helpers RLS: `get_user_role()`, `get_user_location_id()`; funciones tenant-aware introducidas en migraciones 053/054/055
```

- [ ] **Step 2: Verificar frontmatter + descubrible**

Run:
```bash
head -6 .claude/agents/security-reviewer.md
```
Expected: bloque `---` con `name`, `description`, `tools`, `model` (4 campos), idéntico en forma a `migration-reviewer.md`. Confirmar que `description` es una sola línea.

- [ ] **Step 3: Commit**

```bash
git add .claude/agents/security-reviewer.md
git commit -m "feat(agent): security-reviewer audita auth/billing/crypto/tenant-isolation

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Skill `/smoke-test`

**Files:**
- Create: `.claude/skills/smoke-test/SKILL.md`

**Interfaces:**
- Consumes: tools `mcp__claude-in-chrome__*` (cargadas vía ToolSearch).
- Produces: skill `/smoke-test` user-only (`disable-model-invocation: true`).

- [ ] **Step 1: Crear el skill**

Create `.claude/skills/smoke-test/SKILL.md`:

```markdown
---
name: smoke-test
description: Ejecuta el smoke test E2E manual por rol (admin/manager/employee/super_admin) contra un deploy preview o producción usando chrome-in-chrome. Invócalo antes de mergear una PR.
disable-model-invocation: true
---

# Smoke test E2E

Cuando el usuario invoque `/smoke-test`, ejecuta una pasada de verificación E2E por rol en el browser.

## 0. Setup

1. Pregunta/confirma la **URL objetivo**: preview de Vercel (de la PR) o producción (`https://www.tushorarios.com`).
2. Confirma las **credenciales** de la org de prueba (LR) por rol. Si no las tenés, pedíselas al usuario.
3. Carga las tools de browser en UNA sola llamada a ToolSearch (core set):
   `select:mcp__claude-in-chrome__tabs_context_mcp,mcp__claude-in-chrome__navigate,mcp__claude-in-chrome__computer,mcp__claude-in-chrome__read_page,mcp__claude-in-chrome__tabs_create_mcp`
4. Llama `tabs_context_mcp` primero; abre un tab nuevo con `tabs_create_mcp` (no reuses tabs del usuario).

## 1. Checklist por rol

Para cada flujo: navegá, verificá que carga sin error, y marcá ✓ (pasa) o ✗ (falla, con detalle).

### admin (org LR)
- [ ] Login entra al dashboard
- [ ] Dashboard muestra stats cards + próximos turnos
- [ ] `/schedule` — generar horario automático corre sin error
- [ ] `/employees` — crear empleado demo + convertir/transferir
- [ ] `/requests` — los 3 tabs (Ausencias, Intercambios, Horas extra) cargan
- [ ] Billing — `/mi-pago` o panel de facturación carga el estado
- [ ] `/locations` y rutas de Configuración cargan

### manager
- [ ] Login entra a vistas scoped a su sede
- [ ] NO ve config admin-only (`/contract-types` redirige o se oculta)

### employee
- [ ] Horario en modo read-only (sin editar)
- [ ] `/mi-pago` muestra la colilla
- [ ] Puede crear una solicitud de ausencia

### super_admin
- [ ] Panel super_admin lista las orgs
- [ ] Cambio de tenant funciona (operar-como-org)
- [ ] Operando-como-org: escribir empleados / festivos respeta `effectiveOrgId`
- [ ] Billing por org carga

## 2. Reglas de seguridad del browser

- NO dispares dialogs (alert/confirm/prompt) — bloquean la sesión. Evitá botones con confirmación destructiva; si hay que tocarlos, avisá al usuario primero.
- Si una tool de browser falla 2-3 veces, parar y preguntar al usuario en vez de reintentar en loop.
- Si el usuario pide registro, usá `gif_creator` (cargalo en la misma ToolSearch).

## 3. Reporte final

Devolvé:
1. Una tabla **Rol × Flujo → PASS/FAIL**.
2. Lista de bugs encontrados (con la URL y qué pasó).
3. Veredicto: **"Smoke test OK, listo para mergear"** o **"N flujos fallan, ver detalle"**.
```

- [ ] **Step 2: Verificar frontmatter**

Run:
```bash
head -5 .claude/skills/smoke-test/SKILL.md
```
Expected: bloque `---` con `name: smoke-test`, `description:` (una línea) y `disable-model-invocation: true`.

- [ ] **Step 3: Commit**

```bash
git add .claude/skills/smoke-test/SKILL.md
git commit -m "feat(skill): /smoke-test checklist E2E por rol con chrome-in-chrome

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Validación final

**Files:** ninguno nuevo — valida los 4 anteriores.

**Interfaces:**
- Consumes: los 4 artefactos creados en Tasks 1-4.
- Produces: confirmación de que nada se rompió + reporte de `/code-review`.

- [ ] **Step 1: Re-correr los casos del hook (regresión)**

Run:
```bash
for f in ".env:2" ".env.local:2" ".env.example:0" "src/a.tsx:0"; do
  p="${f%:*}"; want="${f#*:}"
  echo "{\"tool_input\":{\"file_path\":\"/x/$p\"}}" | bash .claude/hooks/guard-env-files.sh >/dev/null 2>&1
  got=$?; [[ "$got" == "$want" ]] && echo "OK $p ($got)" || echo "FAIL $p got=$got want=$want"
done
```
Expected: 4 líneas `OK`.

- [ ] **Step 2: Verificar que la suite y el typecheck pasan**

Run: `npm run test`
Expected: todos los tests verdes (los hooks/skills nuevos no tocan `src/`, así que no deben cambiar el resultado).

Run: `npm run typecheck`
Expected: termina sin error de configuración (errores de tipo preexistentes, si los hay, se reportan pero no son de este lote).

- [ ] **Step 3: Verificar settings.json y conteo de artefactos**

Run:
```bash
jq '.hooks.PreToolUse[0].hooks | length' .claude/settings.json   # → 2
ls .claude/agents/        # migration-reviewer, schedule-algorithm-reviewer, security-reviewer
ls .claude/skills/        # new-migration, regen-types, smoke-test, typecheck
ls .claude/hooks/         # guard-applied-migration, guard-env-files, test-on-lib-edit
```
Expected: hook count `2`; 3 agents; 4 skills; 3 hooks. Los previos intactos.

- [ ] **Step 4: `/code-review` sobre el diff de la rama**

Correr `/code-review` sobre `main...chore/claude-code-automations`. Foco:
- Bugs en `guard-env-files.sh` (parsing `jq`, glob del `case`, `file_path` vacío).
- `settings.json` JSON válido + hooks previos intactos.
- Frontmatter YAML válido en `security-reviewer.md`, `typecheck/SKILL.md`, `smoke-test/SKILL.md`.

Arreglar cualquier bloqueador que reporte; warnings se evalúan caso por caso.

- [ ] **Step 5: Commit de fixes (si `/code-review` encontró algo)**

```bash
git add -A
git commit -m "fix: ajustes de code-review en lote de automatizaciones

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```
(Si `/code-review` no encontró nada, saltar este step.)

---

## Self-Review del plan

**Spec coverage:**
- Componente 1 (security-reviewer) → Task 3 ✓
- Componente 2 (guard-env-files hook) → Task 1 ✓
- Componente 3 (/typecheck skill + script) → Task 2 ✓
- Componente 4 (/smoke-test skill) → Task 4 ✓
- Validación (/code-review + pruebas del hook + npm test/typecheck) → Task 5 ✓
- Todos los criterios de éxito del spec tienen un step que los verifica.

**Placeholder scan:** sin TBD/TODO; todo el contenido de los 4 archivos está completo y literal en el plan.

**Type consistency:** los nombres de archivo, los exit codes (0/2), el conteo de hooks (2) y los nombres de skill/agent (`security-reviewer`, `typecheck`, `smoke-test`) son consistentes entre tasks y con el spec.
