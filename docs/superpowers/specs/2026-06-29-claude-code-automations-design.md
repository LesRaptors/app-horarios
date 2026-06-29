# Spec — Lote de automatizaciones Claude Code

**Fecha:** 2026-06-29
**Estado:** Aprobado (diseño)
**Tipo:** Tooling / configuración `.claude/` (no toca código de producción de la app)

## Contexto

El setup de Claude Code del proyecto ya tiene 2 hooks (`guard-applied-migration.sh`, `test-on-lib-edit.sh`), 2 subagents (`migration-reviewer`, `schedule-algorithm-reviewer`) y 2 skills (`new-migration`, `regen-types`). Un análisis de automatizaciones identificó 4 gaps de alto valor para este codebase específico:

1. **Ningún reviewer cubre la superficie sensible**: billing Wompi (`crypto.ts`, webhooks firmados), facturación DIAN, `service_role` que bypassea RLS, y aislamiento multi-tenant con 84 RLS policies. Los 2 reviewers actuales solo cubren migraciones y el motor de scheduling.
2. **`.env`/`.env.local` editables sin protección**, conteniendo Wompi prod keys y `SUPABASE_SERVICE_ROLE_KEY`.
3. **Los 289 archivos `.tsx` no tienen guard de tipos local** — el hook de tests solo cubre `src/lib/`; los errores de tipo solo aparecen en el build de Vercel.
4. **El flujo de smoke test E2E que se repite en cada PR no está estructurado** como skill reutilizable.

## Objetivo

Crear 4 artefactos de automatización, todos dentro de `.claude/` (+ un script en `package.json`), sin tocar código de la aplicación. Validar el resultado con `/code-review`.

## Alcance (decisiones cerradas)

| # | Artefacto | Decisión |
|---|-----------|----------|
| 1 | `security-reviewer` subagent | Un solo subagent (superset que incluye tenant isolation), **no** dos separados |
| 2 | `guard-env-files.sh` hook | PreToolUse, bloquea `.env*` excepto `.env.example` |
| 3 | `/typecheck` skill | Skill manual (**no** hook) + script `typecheck` en `package.json` |
| 4 | `/smoke-test` skill | Checklist completa por rol (admin/manager/employee/super_admin) |

Fuera de alcance: ESLint/Prettier config, MCP servers nuevos (cobertura ya completa), `tenant-isolation-reviewer` separado.

---

## Componente 1 — Subagent `security-reviewer`

**Archivo:** `.claude/agents/security-reviewer.md`

**Patrón:** idéntico a `migration-reviewer.md` / `schedule-algorithm-reviewer.md`.

**Frontmatter:**
```yaml
---
name: security-reviewer
description: Revisa cambios en superficie sensible (API routes, billing Wompi/DIAN, crypto, webhooks, auth, service_role, RLS/multi-tenant). Despáchalo tras tocar src/app/api/**, src/lib/billing/**, crypto.ts, o cualquier uso de createAdminClient()/service_role.
tools: Read, Glob, Grep, Bash
model: opus
---
```

**Comportamiento:** read-only (no edita). Reporta solo issues reales, en 3 secciones (Bloqueadores / Warnings / Follow-ups), igual que `migration-reviewer`.

**Checklist que audita:**

1. **Webhooks** — firma verificada antes de procesar el payload (`src/app/api/webhooks/wompi`); rechaza si la firma no valida; idempotencia ante reintentos.
2. **IDs sensibles desde la sesión** — las API routes que modifican datos cross-user no toman IDs sensibles del `body` cuando la sesión ya los tiene (convención CLAUDE.md).
3. **`service_role` / `createAdminClient`** — nunca importado en archivos `"use client"`; nunca expuesto al browser; solo en API routes server-side.
4. **Secrets** — no logueados (`console.log`) ni devueltos en respuestas HTTP; no hardcodeados.
5. **Tenant isolation (multi-tenant)** — toda query nueva filtra por `organization_id`; las rutas/operaciones `super_admin` usan `effectiveOrgId` y no `organization_id` literal de la sesión (regresión histórica: commit `a01645a`).
6. **Validación + auth** — input validado con `zod`; check de auth/rol antes de operaciones privilegiadas.
7. **Crypto** — `src/lib/billing/crypto.ts`: HMAC/firma con comparación de tiempo constante; sin fugas por timing; algoritmos correctos para Wompi.

**Contexto del proyecto (incluido en el agent):** Supabase project `ugkvuinkynvtuiutwlkd`; roles `admin`/`manager`/`employee`/`super_admin`; clientes Supabase en `src/lib/supabase/` (`client.ts`, `server.ts`, `admin.ts`); billing en `src/lib/billing/`.

---

## Componente 2 — Hook `guard-env-files.sh`

**Archivos:** `.claude/hooks/guard-env-files.sh` + entrada en `.claude/settings.json`.

**Patrón:** clon de `guard-applied-migration.sh` — lee stdin JSON, extrae `.tool_input.file_path` con `jq`, `exit 2` + mensaje a stderr para bloquear.

**Lógica de matching:**
- **Bloquea** (exit 2): `.env`, `.env.local`, `.env.production`, `.env.development`, y cualquier `.env.<algo>` que **no** sea `.env.example`.
- **Permite** (exit 0): `.env.example` (plantilla versionada, se edita normalmente) y cualquier otro archivo.

**Mensaje de bloqueo (español):** explica que el archivo contiene secrets de producción (Wompi keys, service_role) y que debe editarse manualmente fuera de Claude; sugiere `.env.example` si lo que se quiere es documentar una variable nueva.

**Integración en `settings.json`:** se añade como **segundo** comando en el array `hooks` del matcher `Edit|Write` PreToolUse existente (junto a `guard-applied-migration.sh`). Ambos corren; ninguno reemplaza al otro.

**Permisos:** el `.sh` debe ser ejecutable (`chmod +x`).

---

## Componente 3 — Skill `/typecheck`

**Archivos:** `.claude/skills/typecheck/SKILL.md` + script en `package.json`.

**Script nuevo en `package.json`:**
```json
"typecheck": "tsc --noEmit"
```
(Aprovecha `incremental: true` + `tsconfig.tsbuildinfo` ya presentes → rápido tras el primer build.)

**Frontmatter del skill:**
```yaml
---
name: typecheck
description: Corre el type-check de TypeScript (tsc --noEmit) sobre todo el proyecto y reporta errores de tipo. Útil antes de commitear cambios en componentes .tsx que el hook de vitest (solo src/lib) no cubre.
---
```
(Invocable por ambos — usuario vía `/typecheck` y Claude cuando convenga. Sin `disable-model-invocation`.)

**Comportamiento:**
1. Corre `npm run typecheck`.
2. Si pasa: confirma "Type-check OK, cero errores".
3. Si falla: lista los errores agrupados por archivo, con `file:line` y el mensaje de `tsc`, y propone los fixes.

---

## Componente 4 — Skill `/smoke-test`

**Archivo:** `.claude/skills/smoke-test/SKILL.md`

**Frontmatter:**
```yaml
---
name: smoke-test
description: Ejecuta el smoke test E2E manual por rol (admin/manager/employee/super_admin) contra un deploy preview o producción usando chrome-in-chrome. Invócalo antes de mergear una PR.
disable-model-invocation: true
---
```
(User-only: tiene efectos de navegación en el browser.)

**Comportamiento:**
1. **Setup**: pregunta/confirma la URL objetivo (preview de Vercel o prod `www.tushorarios.com`) y las credenciales de la org de prueba (LR). Usa las tools `mcp__claude-in-chrome__*` (cargar vía ToolSearch el core set primero).
2. **Checklist por rol** — verifica cada flujo y reporta ✓/✗ con evidencia:
   - **admin** (org LR): login → dashboard (stats cards) → `/schedule` generar horario auto → `/employees` CRUD + demo → `/requests` (3 tabs) → billing (`/mi-pago` o panel) → `/locations` y config.
   - **manager**: login → vistas scoped a su sede → no ve config admin-only (`/contract-types`).
   - **employee**: login → horario read-only → `/mi-pago` (colilla) → crear solicitud de ausencia.
   - **super_admin**: panel super_admin → cambio de tenant → operar-como-org (write empleados, festivos) → billing por org.
3. **Reglas de seguridad del browser**: no disparar dialogs (alert/confirm) — seguir la guía de chrome-in-chrome; capturar GIF si el usuario lo pide.
4. **Reporte final**: tabla de flujos PASS/FAIL + lista de bugs encontrados.

---

## Validación (`/code-review`)

Tras implementar los 4 componentes:

1. **`/code-review`** sobre el diff completo. Foco:
   - Bugs en `guard-env-files.sh` (parsing `jq`, que **no** bloquee `.env.example` por error de glob, manejo de `file_path` vacío).
   - `settings.json` sigue siendo JSON válido y los 2 hooks previos quedan intactos.
   - Frontmatter YAML válido en los 2 skills nuevos y el agent.
2. **Pruebas manuales del hook** antes/después:
   - `echo '{"tool_input":{"file_path":"/x/.env"}}' | bash .claude/hooks/guard-env-files.sh` → debe `exit 2`.
   - `echo '{"tool_input":{"file_path":"/x/.env.example"}}' | bash .claude/hooks/guard-env-files.sh` → debe `exit 0`.
   - `echo '{"tool_input":{"file_path":"/x/src/foo.tsx"}}' | bash .claude/hooks/guard-env-files.sh` → debe `exit 0`.
3. **`npm run typecheck`** corre sin error de configuración (valida que el script nuevo funciona).
4. **`npm run test`** sigue verde (los hooks no rompen el flujo existente).

## Criterios de éxito

- [ ] Los 4 artefactos creados y con sintaxis válida.
- [ ] El hook `.env` bloquea `.env`/`.env.local` y permite `.env.example` (verificado con los 3 echos).
- [ ] Los 2 hooks previos y los 2 agents/skills previos quedan intactos.
- [ ] `npm run typecheck` y `npm run test` pasan.
- [ ] `/code-review` no reporta bloqueadores.

## Riesgos

- **Bajo**: ningún cambio toca `src/` de la app ni el schema. El único cambio fuera de `.claude/` es agregar 1 línea de script a `package.json`.
- **Mitigación del hook `.env`**: si bloquea algo legítimo, el usuario edita manualmente; el mensaje lo explica. Reversible borrando la entrada de `settings.json`.
