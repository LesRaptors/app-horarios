# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

App Horarios is a workforce scheduling system (Spanish UI) for managing employee shift assignments across multiple locations. Built with Next.js 14 (App Router) + Supabase Cloud + Tailwind CSS + shadcn/ui. Deployed on Vercel at `app-horarios-mauve.vercel.app`.

## Commands

- **Dev (Docker):** `docker compose up` — runs on port 3100, maps to internal port 3000
- **Dev (local):** `npm run dev` — starts on 0.0.0.0:3000
- **Build:** `npm run build`
- **Lint:** `npm run lint`
- **No test runner is configured.**

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
- `profiles_insert` RLS is `WITH CHECK (false)` — all profile creation goes through the auth trigger or service_role.
- `profiles_update_own` restricts employees to only updating their `phone` field.
- New users get a profile auto-created via a Postgres trigger on `auth.users` insert.

### API Routes

- `/api/swaps/approve` — atomic shift swap approval via `approve_shift_swap` RPC
- `/api/employees/invite` — invite real employee via Supabase Auth email
- `/api/employees/demo` — create demo (placeholder) employee
- `/api/employees/demo/convert` — convert demo to real employee via `convert_demo_to_real` RPC
- `/api/employees/demo/transfer` — transfer demo's shifts to a real employee

### Route Structure

- `/login` — public login page
- `/(authenticated)/` — layout with sidebar + navbar + AuthProvider + NotificationsProvider:
  - `dashboard` — stats cards, upcoming shifts
  - `schedule` — main calendar grid (admin/manager edit, employee read-only)
  - `employees` — CRUD + demo employee management (create, convert, transfer)
  - `locations`, `departments`, `positions`, `shifts` — CRUD management pages
  - `requests` — time-off and shift swap requests (tabs)
  - `notifications` — notification list
  - `settings` — labor constraints config
  - `staffing` — staffing requirements matrix

### Schedule Lifecycle

Schedules are per-location, per-month with status flow: `draft` → `published` → `archived`. Only draft schedules can be edited. Publishing triggers Postgres notifications to affected employees.

### Demo Employees

Profiles with `is_demo = true` are placeholder employees for schedule planning. They have no `auth.users` entry and cannot log in. Two conversion paths: convert in-place (creates auth user, migrates shifts) or transfer shifts to an existing real employee. Visually identified by yellow "Demo" badge + italic name.

### Key Shared Components

- `DataTable<T>` (`src/components/shared/data-table.tsx`) — generic table with search, loading skeletons, optional `keyAccessor`
- `PageHeader`, `FormField`, `DeleteDialog` in `src/components/shared/`
- Schedule components in `src/components/schedule/` (calendar grid, cell, toolbar, assign dialog, auto-generate, export)
- Error boundaries: `global-error.tsx`, `not-found.tsx`, `(authenticated)/error.tsx`, `(authenticated)/loading.tsx`

### Database Schema

12 tables with RLS on all. Migrations in `supabase/migrations/` (001-010). Core entity hierarchy: `locations` → `departments` → `positions` → `profiles`. Schedules contain entries that link employees to positions on specific dates with time ranges. `app_settings` stores labor constraints as JSONB. RPC functions: `approve_shift_swap`, `convert_demo_to_real`.

### Types and Constants

- All TypeScript interfaces in `src/lib/types.ts` — mirrors the database schema
- UI labels, colors, day/month names (Spanish) in `src/lib/constants.ts`
- Utility functions (date formatting, entry maps, DB error translation) in `src/lib/utils.ts`

## Environment Variables

Required (see `.env.example`):
- `NEXT_PUBLIC_SUPABASE_URL` — Supabase project URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` — Supabase anon/public key
- `SUPABASE_SERVICE_ROLE_KEY` — Supabase service role key (server-side only)

These must also be configured in Vercel project settings for deployment.

## Conventions

- All UI text is in **Spanish**.
- Months are 0-indexed in JS but 1-indexed in the database (`schedules.month`).
- Dates use `YYYY-MM-DD` ISO format strings throughout.
- The `output: "standalone"` Next.js config enables Docker production builds.
- Export features use `jspdf`/`jspdf-autotable` for PDF and `xlsx` for Excel.
- API routes that modify cross-user data use `createAdminClient()` (service_role) — never pass sensitive IDs from the request body when the session already has them.
- Dark mode CSS variables are defined in `globals.css` (`.dark` class).

## Agent Skills

Reference skills are available in `.agents/skills/`. Consult the relevant SKILL.md before making changes in these areas:

| Area | Skill directory | When to consult |
|------|----------------|-----------------|
| Next.js | `next-best-practices/` | Routing, data fetching, rendering strategies, App Router patterns |
| Next.js Cache | `next-cache-components/` | Caching, ISR, revalidation |
| Next.js Upgrade | `next-upgrade/` | Version migrations, codemods |
| React | `vercel-react-best-practices/` | Component structure, hooks, performance |
| Component Composition | `vercel-composition-patterns/` | Layout patterns, shared components |
| Tailwind CSS | `tailwind-css-patterns/` | Utility classes, responsive design, theming |
| Tailwind v4 + shadcn | `tailwind-v4-shadcn/` | Tailwind v4 migration with shadcn/ui |
| shadcn/ui | `shadcn/` | Component installation, customization, theming |
| TypeScript | `typescript-advanced-types/` | Advanced types, generics, type utilities |
| Supabase/Postgres | `supabase-postgres-best-practices/` | Queries, RLS policies, migrations, functions |
| Node.js Backend | `nodejs-backend-patterns/` | API routes, server patterns |
| Frontend Design | `frontend-design/` | UI/UX quality, design patterns |
| Accessibility | `accessibility/` | ARIA, keyboard nav, semantic HTML |
| SEO | `seo/` | Metadata, structured data, performance |
