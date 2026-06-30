# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

App Horarios is a workforce scheduling system (Spanish UI) for managing employee shift assignments across multiple locations. Target customer: multi-sede single-tenant (3-10 sedes, 50-200 empleados), migrating off Excel. Built with Next.js 14 (App Router) + Supabase Cloud + Tailwind CSS v3 + shadcn/ui. Deployed on Vercel at `app-horarios-mauve.vercel.app`. Supabase project ID: `ugkvuinkynvtuiutwlkd`.

## Commands

- **Dev (Docker):** `docker compose up` — runs on port 3100, maps to internal port 3000
- **Dev (local):** `npm run dev` — starts on 0.0.0.0:3000
- **Build:** `npm run build`
- **Lint:** `npm run lint` — Next.js lint (no ESLint config present, will prompt interactively)
- **Test:** `npm run test` (Vitest; pure-logic only, `src/**/*.test.ts`)
- **Wompi integration test (opcional):** `src/lib/billing/wompi/__tests__/integration.test.ts` hace llamadas de red reales al sandbox de Wompi. Se skipea salvo que `NEXT_PUBLIC_WOMPI_PUBLIC_KEY` (`pub_test_…`) y `WOMPI_PRIVATE_KEY` (`prv_test_…`) estén en el entorno. Correr: `NEXT_PUBLIC_WOMPI_PUBLIC_KEY=… WOMPI_PRIVATE_KEY=… npm run test -- integration`
- **Test watch:** `npm run test:watch`
- **Test UI:** `npm run test:ui`
- **SQL tests:** scripts in `supabase/tests/*.sql` — run via Supabase MCP `execute_sql` or psql (all use `BEGIN ... ROLLBACK` pattern, safe against prod)

## Architecture

### Data Flow

All data access goes through Supabase client-side queries (no server-side data fetching layer). Pages are `"use client"` components that call Supabase directly via the browser client singleton.

### Supabase Client Patterns

Three Supabase client factories in `src/lib/supabase/`, all typed with `Database` generic from `database.types.ts`:
- `client.ts` — singleton browser client (used in all `"use client"` pages/hooks)
- `server.ts` — server client using `cookies()` (used in API routes)
- `admin.ts` — service role client (bypasses RLS, used in API routes that need cross-user operations)

Generated types in `src/lib/supabase/database.types.ts` — regenerate with Supabase MCP `generate_typescript_types` after schema changes.

### Context Providers

Two context providers wrap the authenticated layout (`src/app/(authenticated)/layout.tsx`):
- `AuthProvider` (`src/contexts/auth-context.tsx`) — single auth fetch shared by all components. Use `useAuth()` hook.
- `NotificationsProvider` (`src/contexts/notifications-context.tsx`) — single Realtime subscription for notifications. Use `useNotifications()` hook.

Hooks in `src/hooks/` re-export from contexts for backward compatibility.

### Authentication & Authorization

- Supabase Auth with email/password. Middleware (`src/middleware.ts`) refreshes sessions and redirects unauthenticated users to `/login`.
- Three roles: `admin`, `manager`, `employee`. Role checked client-side via `useAuth()` context.
- RLS policies enforce access at the database level. Helper functions `get_user_role()` and `get_user_location_id()` are used in policies.
- `profiles_insert` RLS is `WITH CHECK (false)` — all profile creation goes through the auth trigger or service_role. `profiles.id` FK to `auth.users(id)` was dropped in migration 011 to allow demo profiles; a trigger on `auth.users` DELETE preserves cascade semantics for real users.
- `profiles_update_own` restricts employees to only updating their `phone` field; `profiles_update_admin` lets admin/manager update any column.
- `profiles_delete_admin` (migration 022) allows admin/manager to delete profiles. In UI, demos are hard-deleted; real employees are soft-deleted via `is_active = false` to preserve schedule history.

### API Routes

- `/api/swaps/approve` — atomic shift swap approval via `approve_shift_swap` RPC
- `/api/employees/invite` — invite real employee via Supabase Auth email
- `/api/employees/demo` — create demo (placeholder) employee (surfaces real Postgres errors via `translateDbError`)
- `/api/employees/demo/convert` — convert demo to real employee via `convert_demo_to_real` RPC
- `/api/employees/demo/transfer` — transfer demo's shifts to a real employee

### Route Structure

- `/login` — public login page
- `/(authenticated)/` — layout with sidebar + navbar + AuthProvider + NotificationsProvider

**Operational routes (flat, top of sidebar):**
- `/dashboard` — stats cards, upcoming shifts
- `/schedule` — main calendar grid (admin/manager edit, employee read-only). Auto-generate dialog uses the two-pass equity-aware algorithm.
- `/employees` — CRUD + demo management (create, convert, transfer, delete/deactivate). Contract column is an inline `Select` for quick reassign. Row click opens `<EmployeeEquityPanel />` side sheet.
- `/requests` — 3 tabs: Ausencias (time-off), Intercambios (swaps), Horas extra (overtime approval workflow)
- `/notifications` — notification list

**Configuration routes (grouped under collapsible "Configuración" in the sidebar):**
- `/locations` (Sedes), `/departments`, `/positions`
- `/shifts` (Turnos — plantillas horarias) — has `is_night` toggle with CST-based auto-suggestion
- `/staffing` (Necesidades — matrix of position × shift × day)
- `/contract-types` (**admin only**) — Tiempo completo, Medio tiempo, Asistencial tiempo completo, Fin de semana, Sin definir (default)
- `/holidays` — Nacionales (Colombia pre-seeded 2026-2028) + Por sede tabs
- `/settings` (Ajustes) — labor constraints + scoring_weights (JSONB)

### Schedule Lifecycle

Schedules are per-location, per-month with status flow: `draft` → `published` → `archived`. Only draft schedules can be edited. Publishing triggers Postgres notifications to affected employees.

### Staffing Matrix (`/necesidades`)

Configurador semanal recurrente de necesidades por (sede × posición × turno × día). Tres tabs: Por turno, Por posición, Heatmap demanda. Persiste vía RPC `save_staffing_diff(p_location_id uuid, p_rows jsonb)` que aplica un diff atómico (insert/update/delete según desired state) y devuelve `{inserted, updated, deleted}`. Auditoría: `staffing_requirements.updated_by`. Helpers puros en `src/lib/staffing-helpers.ts` (`diffStaffing`, `replicateAcrossDays`, `replicateShiftToShift`). Hook `useStaffingMatrix` carga 5 queries en paralelo (requirements + positions + shift_templates + capacidad teórica desde `profiles` + `employee_secondary_positions` + cobertura últimas 4 semanas desde `schedule_entries`).

### Demo Employees

Profiles with `is_demo = true` are placeholder employees for schedule planning. They have no `auth.users` entry and cannot log in. Two conversion paths: convert in-place (creates auth user, migrates shifts) or transfer shifts to an existing real employee. Visually identified by yellow "Demo" badge + italic name. Hard-deleted by admin; schedule_entries cascade (migration 022).

### Supernumerarios (`is_floater`)

Empleados con `profiles.is_floater = true` (migración 035) son comodines que cubren múltiples posiciones. Sus posiciones cubribles se definen en `employee_secondary_positions`. Form en `/employees` muestra switch "Supernumerario" + multi-pick de posiciones agrupadas por departamento. Badge azul "Supernumerario" en la tabla.

**Integración en el motor:** floaters compiten en **Pase 1 strict** junto con los primarios (un solo pool). El scoring preserva la preferencia natural por primarios vía `position_primary_bonus (100)` vs `position_secondary_bonus (30)` — diferencia de +70 puntos que el primario solo pierde si el floater tiene déficit significativo de horas/turnos (equidad) o si el primario quedó filtrado por inviolables (descanso, días consecutivos, etc.). Esto asegura que un floater tiempo completo se cargue equitativamente con los demás, en vez de quedar subutilizado como "último recurso". Pase 2 sigue siendo el fallback con overtime para todos.

### Reglas de descanso parametrizables

Sistema plug-in con dos fuentes de reglas:

- **`contract_rest_rules`** (migración 036): por `contract_type` — default que aplica a todos los empleados con ese contrato.
- **`employee_rest_rules`** (migración 037): por empleado individual — **override** total. Si un empleado tiene 1+ reglas individuales, esas se usan **en lugar de** las del contract; si no, fallback al contract.

Override semántico permite rotación intra-equipo: dos empleados con el mismo Tiempo completo pueden tener `weekend_rotation` con offsets opuestos (uno descansa findes pares, otro impares) sin que el motor los mande a descansar al mismo tiempo.

5 tipos de regla soportados:
- `work_cycle`: trabaja N días, descansa M (ej. 4×3, 7×7).
- `weekend_rotation`: cada N semanas, sáb/dom libres (offset 0/1).
- `post_night_rest`: tras N noches consecutivas, M días libres.
- `max_consecutive_nights`: tope duro de noches seguidas.
- `compensatory_day`: si trabajó dom/festivo, día libre dentro de N días (Art. 179 CST).

Helpers puros en `src/lib/rest-rules.ts` con TDD (~27 tests). Helper `pickEffectiveRules(employeeRules, contractRules)` decide qué reglas aplicar con override semántica. Motor (`schedule-generator.ts`) construye `restRulesByEmployee` y `restRulesByContract`, consulta el primero y hace fallback al segundo en `filterCandidates`. `schedule-health.ts` aplica la misma lógica al detectar `restDays` de empleados saturados.

UI:
- **`/contract-types`** — 4 presets (Sin reglas, Asistencial, Rotación 4×3, Findes alternados) + Personalizado para reglas a nivel contrato.
- **`/employees`** edit dialog — sección "Reglas de descanso individuales" con `<EmployeeRestRulesEditor>` (reusa `RestRuleCards`). Vacío = "usa reglas del contrato"; con reglas = override. Persiste con delete-all + insert-new (mismo patrón que `employee_secondary_positions`).

### Equity Model (core feature, see spec)

The scheduler balances workload across dimensions employees care about (priority order from the user): **domingos > sábados > noches > festivos > horas totales > descanso consecutivo**. Implementation:

- **`contract_types`** (modelo simplificado migración 034): `weekly_hours_mode` (`"full"` = 44h Ley 2101, `"partial"` = custom), `weekly_hours` (override si parcial), `is_healthcare` (12h/día Decreto 1042/1978 vs 10h/día), `available_sundays/holidays/nights` (booleans inviolables). El algoritmo balancea sábados/domingos/noches/festivos equitativamente vía `rolling_rollup_sums` + scoring penalties. Caps trimestrales eliminados (no exigidos por ley CST). Las columnas viejas (`max_sundays_per_quarter`, `target_saturdays_per_month`, `target_nights_per_month`, `target_hours_per_week`, `max_hours_per_day`, `max_hours_per_week`) están marcadas DEPRECATED — mantenidas por compat de data, ya no leídas por el motor. Employees MUST have a `contract_type_id`; default is "Sin definir" (full, no asistencial, todo disponible).
- **`holidays`** table: pre-loaded Colombian nacional festivos 2026-2028. Admin can add nacional entries; managers add per-sede entries (`location_id` not null).
- **`shift_templates.is_night`**: boolean, auto-suggested by the CST rule (shift overlaps 21:00-06:00) when creating a plantilla.
- **`employee_equity_rollups`** (materialized): `(employee_id, year, month)` PK with `sundays_worked`, `saturdays_worked`, `nights_worked`, `holidays_worked`, `total_hours`. Read-only via RLS; only the trigger (`recompute_equity_rollup`, SECURITY DEFINER) writes. Fires on `schedule_entries` INSERT/UPDATE/DELETE and on `holidays` INSERT/UPDATE/DELETE (cascades).
- **`schedule_entries.exceeds_caps TEXT[]`** + **`overtime_status`** enum (`none|pending|approved|rejected`) + reviewer metadata. CHECK constraint ensures reviewed metadata only present when status is `approved` or `rejected`.
- **`app_settings.scoring_weights`** JSONB: 11 tunable weights (sunday_penalty, saturday_penalty, night_penalty, holiday_penalty, block_continuation_bonus, fragmentation_penalty, clean_restart_bonus, position_primary_bonus, position_secondary_bonus, hour_deficit_multiplier, shift_deficit_multiplier).

**Algorithm** (`src/lib/schedule-generator.ts`):
- **Two passes per slot**: Pass 1 strict (enforces contractual caps + inviolables). Pass 2 relaxed (only inviolables — legal/safety: 12h rest, 24h after night, no double shift, no daily-hours excess). Pass 2 output is marked `overtime_status='pending'` with `exceeds_caps` listing the violations.
- **Rolling 3-month window** for soft scoring; **calendar quarter** for hard caps.
- **Block-packing scoring**: continuation bonus (gap=1), fragmentation penalty (gap=2), clean-restart bonus (gap≥3), block length capped at 4 to avoid runaway.
- **Tie-breaker**: when scores tie, prefers employee with fewer `totalShifts`.
- **Warnings**: structured `AutoGenWarning` union — `no_employees_in_position`, `no_safe_candidate`, `overtime_assigned`, `no_templates_selected`, `no_employees_selected`. Dialog groups them with action links.

**Overtime approval workflow** in `/solicitudes` "Horas extra" tab:
- Pending entries listed with bulk approve/reject.
- **Approve** → status='approved', reviewer metadata persisted.
- **Reject** → status='rejected' (soft delete; audit preserved). Schedule grid filters `neq('overtime_status','rejected')`.

### Salud del horario (`/schedule`)

`<ScheduleHealthBanner />` y `<ScheduleHealthPanel />` se calculan con `computeHealth(entries, employees, staffing, constraints, locationId, year, month): HealthSummary` desde `src/lib/schedule-health.ts`. El banner aparece sticky cuando hay turnos `pending` o slots sin cubrir; el panel es expansible y lista cobertura sin/con extras, slots faltantes, y empleados saturados (≥85% horas semana o ≥6 días consecutivos).

`consecutive_days` (Art. 161 CST — descanso semanal obligatorio) ahora es **inviolable** en `generateSchedule` — no se asigna día 7 consecutivo aunque sea Pase 2. Si nadie es elegible, emite warning `coverage_gap` con `reason: "all_at_cap"`. El scoring también penaliza candidatos cerca de sus caps (-30 si ≥85% horas semana, -50 si ≤1 día de holgura consecutivo).

### Key Shared Components

- `DataTable<T>` (`src/components/shared/data-table.tsx`) — columns have `cell: (row: T) => ReactNode`, requires `loading: boolean`. Top-level `keyAccessor`, `emptyMessage`, optional search props.
- `PageHeader` (`src/components/shared/page-header.tsx`) — `action` prop is `{ label, onClick }` (auto-renders `<Plus>` icon).
- `FormField` — `label, required?, error?, children`. `DeleteDialog` requires `loading` prop.
- `EmployeeEquityPanel` (`src/components/schedule/employee-equity-panel.tsx`) — 3-month rollup table + Q progress bars. Shared by `/employees` side sheet and schedule grid sidebar.
- Schedule components in `src/components/schedule/`: calendar grid, cell (with overtime visual states), toolbar, assign dialog, auto-generate, export. `schedule-cell.tsx` shows amber/red dashed border for pending overtime, green `<Check>` for approved.
- Error boundaries: `global-error.tsx`, `not-found.tsx`, `(authenticated)/error.tsx`, `(authenticated)/loading.tsx`

### Database Schema

**Migrations 001-022**. Key tables: `locations → departments → positions`, `profiles` (with `contract_type_id`), `shift_templates` (with `is_night`), `schedules` (status: draft|published|archived), `schedule_entries` (with `exceeds_caps`, `overtime_*`), `staffing_requirements`, `time_off_requests`, `shift_swap_requests`, `notifications`, `app_settings`, `employee_secondary_positions`, **`holidays`, `contract_types`, `employee_equity_rollups`**. RLS on all. RPCs: `approve_shift_swap`, `convert_demo_to_real`, `recompute_equity_rollup`.

### Types and Constants

- All TypeScript interfaces in `src/lib/types.ts` — mirrors the database schema. Key types: `ContractType`, `HolidayDate`, `EmployeeEquityRollup`, `ScoringWeights`, `OvertimeStatus`, `CapExcessKind`, `AutoGenWarning` (discriminated union).
- UI labels, colors, day/month names (Spanish) in `src/lib/constants.ts`.
- Utility functions (date formatting, entry maps, DB error translation) in `src/lib/utils.ts`.
- **`src/lib/equity-helpers.ts`** — pure functions with Vitest coverage: `getQuarter`, `getQuarterRange`, `getRollingWindow`, `sumRollupField`, `isHoliday`, `isNightShift`, `suggestIsNight`, `dayOfWeek`, `daysBetween`.

### Testing

- **Vitest** (`vitest.config.ts`, Node env, `@` alias). 38 tests pass: 33 in `equity-helpers.test.ts`, 5 in `schedule-generator.test.ts`.
- No component/API tests; pure-logic only.
- **SQL tests** in `supabase/tests/` (insert/delete/update-move triggers, holidays cascade, RLS presence).

## Environment Variables

Required (see `.env.example`):
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` (server-side only)

Configured in Vercel project settings for deployment.

## Conventions

- All UI text is in **Spanish**. Spanish accents normalized: use `posición`, `día`, `distribución`, `acción`, `organización`, `desviación`, `automáticamente`, etc.
- Months are 0-indexed in JS but 1-indexed in the database (`schedules.month`).
- Dates use `YYYY-MM-DD` ISO format strings throughout.
- The `output: "standalone"` Next.js config enables Docker production builds.
- Export features use `jspdf`/`jspdf-autotable` for PDF and `xlsx` for Excel.
- API routes that modify cross-user data use `createAdminClient()` (service_role) — never pass sensitive IDs from the request body when the session already has them.
- Dark mode CSS variables are defined in `globals.css` (`.dark` class).
- No emojis in files unless the user asks (per auto-memory feedback). Use lucide icons for visual indicators (e.g. `<Check>` for success, `<AlertTriangle>` for warnings).
- `day_of_week` uses JavaScript convention (`0=Sunday`, `6=Saturday`) — consistent with `staffing_requirements.day_of_week`.

## Docs

- **Spec**: `docs/superpowers/specs/2026-04-22-schedule-equity-model-design.md` — equity model design.
- **Plan**: `docs/superpowers/plans/2026-04-22-schedule-equity-model.md` — 24-task implementation plan (completed 2026-04-22 → 2026-04-23).
- Other specs/plans: `2026-04-03-demo-employees-*` (earlier work), `2026-04-21-schedule-generator-ux-improvements.md` (prior UX pass).

## Modern Web Compliance (MANDATORY before new UI/CSS/client-JS)

Before writing or significantly modifying React/TSX components, CSS, or client-side JS, **invoke the `modern-web-guidance:modern-web-guidance` skill** with a focused query for the topic at hand. This is the authoritative source for a11y, CWV, forms, dialogs/popovers, and modern CSS patterns in this project.

Quick invocations:
- Forms / validation: `npx -y modern-web-guidance@latest search "form label aria-invalid"`
- A11y / landmarks: `npx -y modern-web-guidance@latest search "landmarks skip link nav"`
- Performance / LCP: `npx -y modern-web-guidance@latest search "LCP image fetchpriority"`
- Modals / dialogs: `npx -y modern-web-guidance@latest search "dialog popover native"`
- Modern CSS: `npx -y modern-web-guidance@latest search "container queries :has user-invalid"`

Then `retrieve` the matched `id`s and apply DOs/DON'Ts verbatim — don't re-derive what the guide already standardizes. Compliance baseline established 2026-05-20 in `docs/superpowers/plans/2026-05-20-modern-web-compliance.md`.

## Agent Skills

Reference skills are available in `.agents/skills/`. Consult the relevant SKILL.md before making changes in these areas:

| Area | Skill / Plugin |
|------|----------------|
| Modern web standards (a11y/CWV/forms/dialogs) | `modern-web-guidance:modern-web-guidance` (MANDATORY) |
| Next.js | `vercel:nextjs`, `vercel:next-cache-components`, `vercel:next-upgrade` |
| React | `vercel:react-best-practices`, `vercel-composition-patterns/` |
| Tailwind | `tailwind-css-patterns/`, `tailwind-v4-shadcn/` |
| shadcn/ui | `vercel:shadcn` |
| TypeScript | `typescript-advanced-types/` |
| Supabase/Postgres | `supabase:supabase`, `supabase:supabase-postgres-best-practices` |
| Node.js Backend | `nodejs-backend-patterns/` |
| Frontend Design | `frontend-design:frontend-design` |
| Accessibility (companion to modern-web-guidance) | `accessibility/`, `chrome-devtools-mcp:a11y-debugging` |
| SEO | `seo/` |
| Browser verification | `chrome-devtools-mcp:chrome-devtools`, `vercel:verification` |

**MCP plugins relevantes:** `plugin_supabase_supabase` (apply_migration, execute_sql, generate_typescript_types), `plugin_github_github` (PRs/issues), `plugin_vercel_vercel` (deployments, runtime logs), `plugin_chrome-devtools-mcp` (live browser debugging).

**Subagent briefing rule:** when dispatching subagents, list the relevant skills above in the prompt and pin `model: sonnet` or `model: opus` — never let it fall to haiku for substantive code work.
