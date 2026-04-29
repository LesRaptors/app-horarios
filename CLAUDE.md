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
- `/contract-types` (**admin only**) — Full-time, Part-time, Fin de semana, Sin definir (default)
- `/holidays` — Nacionales (Colombia pre-seeded 2026-2028) + Por sede tabs
- `/settings` (Ajustes) — labor constraints + scoring_weights (JSONB)

### Schedule Lifecycle

Schedules are per-location, per-month with status flow: `draft` → `published` → `archived`. Only draft schedules can be edited. Publishing triggers Postgres notifications to affected employees.

### Staffing Matrix (`/necesidades`)

Configurador semanal recurrente de necesidades por (sede × posición × turno × día). Tres tabs: Por turno, Por posición, Heatmap demanda. Persiste vía RPC `save_staffing_diff(p_location_id uuid, p_rows jsonb)` que aplica un diff atómico (insert/update/delete según desired state) y devuelve `{inserted, updated, deleted}`. Auditoría: `staffing_requirements.updated_by`. Helpers puros en `src/lib/staffing-helpers.ts` (`diffStaffing`, `replicateAcrossDays`, `replicateShiftToShift`). Hook `useStaffingMatrix` carga 5 queries en paralelo (requirements + positions + shift_templates + capacidad teórica desde `profiles` + `employee_secondary_positions` + cobertura últimas 4 semanas desde `schedule_entries`).

### Demo Employees

Profiles with `is_demo = true` are placeholder employees for schedule planning. They have no `auth.users` entry and cannot log in. Two conversion paths: convert in-place (creates auth user, migrates shifts) or transfer shifts to an existing real employee. Visually identified by yellow "Demo" badge + italic name. Hard-deleted by admin; schedule_entries cascade (migration 022).

### Supernumerarios (`is_floater`)

Empleados con `profiles.is_floater = true` (migración 035) son comodines: el motor los usa SOLO cuando los empleados primarios para una posición no pueden cubrir el slot. Implementación: nuevo Pase 1.5 entre el Pase 1 strict (solo primarios) y el Pase 2 extras (todos). Sus posiciones cubribles se definen en `employee_secondary_positions`. Esto reduce extras forzados sin sobrecargar al floater. Form en `/employees` muestra switch "Supernumerario" + multi-pick de posiciones agrupadas por departamento. Badge azul "Supernumerario" en la tabla.

### Reglas de descanso parametrizables

Sistema plug-in (migración 036): cada `contract_type` puede tener 0 o más reglas en `contract_rest_rules` con `params jsonb`. 5 tipos soportados:
- `work_cycle`: trabaja N días, descansa M (ej. 4×3, 7×7).
- `weekend_rotation`: cada N semanas, sáb/dom libres (offset 0/1).
- `post_night_rest`: tras N noches consecutivas, M días libres.
- `max_consecutive_nights`: tope duro de noches seguidas.
- `compensatory_day`: si trabajó dom/festivo, día libre dentro de N días (Art. 179 CST).

Helpers puros en `src/lib/rest-rules.ts` con TDD (~23 tests). Motor las aplica como inviolable en `filterCandidates` después de los chequeos de descanso/disponibilidad. UI en `/contract-types` ofrece 4 presets (Sin reglas, Asistencial, Rotación 4×3, Findes alternados) + Personalizado con cards editables y preview de 14 días. Tabla muestra columna "Reglas" con resumen. Tabla `/employees` muestra badge resumen de reglas del contract. Panel "Salud del horario" lista los días de descanso por regla para empleados saturados.

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

## Agent Skills

Reference skills are available in `.agents/skills/`. Consult the relevant SKILL.md before making changes in these areas:

| Area | Skill directory |
|------|----------------|
| Next.js | `next-best-practices/`, `next-cache-components/`, `next-upgrade/` |
| React | `vercel-react-best-practices/`, `vercel-composition-patterns/` |
| Tailwind | `tailwind-css-patterns/`, `tailwind-v4-shadcn/` |
| shadcn/ui | `shadcn/` |
| TypeScript | `typescript-advanced-types/` |
| Supabase/Postgres | `supabase-postgres-best-practices/` |
| Node.js Backend | `nodejs-backend-patterns/` |
| Frontend Design | `frontend-design/` |
| Accessibility | `accessibility/` |
| SEO | `seo/` |
