# App Horarios Full Optimization Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix all 29 audit findings — security vulnerabilities, performance issues, accessibility gaps, and code quality — in priority order.

**Architecture:** Work in 6 phases: (1) Security fixes for RLS and API, (2) Core infrastructure (AuthProvider, Supabase client stability, generated types), (3) Error boundaries and loading states, (4) Data fetching optimization (parallel queries, server components where feasible), (5) Component decomposition and memoization, (6) Accessibility, SEO, and Tailwind cleanup.

**Tech Stack:** Next.js 14 (App Router), Supabase (Cloud), TypeScript, Tailwind CSS, shadcn/ui, Zod

**Important notes:**
- This project has **no test runner configured**. Steps that would normally be TDD will instead use manual verification via `npm run build` and `npm run lint`.
- The app runs in Docker (`docker compose up` on port 3100) or locally (`npm run dev` on port 3000).
- All UI text must be in **Spanish**.
- Months are 0-indexed in JS, 1-indexed in DB (`schedules.month`).

---

## Phase 1: Security Fixes (Critical)

### Task 1: Fix RLS — Restrict `profiles_update_own` to safe columns

**Files:**
- Create: `supabase/migrations/006_fix_rls_security.sql`

**Why:** Currently employees can update ANY column on their own profile, including `role` (self-promote to admin), `is_active`, `max_hours_per_week`.

- [ ] **Step 1: Create migration file**

```sql
-- 006_fix_rls_security.sql
-- Fix: employees could self-promote to admin via profiles_update_own

-- Drop the overly permissive policy
DROP POLICY IF EXISTS "profiles_update_own" ON profiles;

-- Recreate: employees can only update their own phone number
CREATE POLICY "profiles_update_own" ON profiles
    FOR UPDATE USING (id = auth.uid())
    WITH CHECK (
        id = auth.uid()
        AND role = (SELECT role FROM profiles WHERE id = auth.uid())
        AND is_active = (SELECT is_active FROM profiles WHERE id = auth.uid())
        AND max_hours_per_week = (SELECT max_hours_per_week FROM profiles WHERE id = auth.uid())
        AND position_id IS NOT DISTINCT FROM (SELECT position_id FROM profiles WHERE id = auth.uid())
        AND location_id IS NOT DISTINCT FROM (SELECT location_id FROM profiles WHERE id = auth.uid())
    );

-- Fix: anyone could insert profiles with any role
DROP POLICY IF EXISTS "profiles_insert" ON profiles;
CREATE POLICY "profiles_insert" ON profiles
    FOR INSERT WITH CHECK (
        -- Only the trigger on auth.users should insert (service_role bypasses RLS)
        -- Block direct inserts from anon/authenticated roles
        false
    );

-- Fix: anyone could insert notifications for any user
DROP POLICY IF EXISTS "notifications_insert" ON notifications;
CREATE POLICY "notifications_insert" ON notifications
    FOR INSERT WITH CHECK (
        -- Users can only create notifications for themselves (system uses service_role)
        user_id = auth.uid()
    );

-- Fix: SECURITY DEFINER functions missing search_path
CREATE OR REPLACE FUNCTION create_notification(
    p_user_id UUID,
    p_title TEXT,
    p_message TEXT,
    p_type notification_type DEFAULT 'general',
    p_link TEXT DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
    v_id UUID;
BEGIN
    INSERT INTO notifications (user_id, title, message, type, link)
    VALUES (p_user_id, p_title, p_message, p_type, p_link)
    RETURNING id INTO v_id;
    RETURN v_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION notify_schedule_published()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.status = 'published' AND (OLD.status IS NULL OR OLD.status != 'published') THEN
        INSERT INTO notifications (user_id, title, message, type, link)
        SELECT DISTINCT
            se.employee_id,
            'Horario publicado',
            'Se ha publicado el horario de ' ||
                CASE NEW.month
                    WHEN 1 THEN 'Enero' WHEN 2 THEN 'Febrero' WHEN 3 THEN 'Marzo'
                    WHEN 4 THEN 'Abril' WHEN 5 THEN 'Mayo' WHEN 6 THEN 'Junio'
                    WHEN 7 THEN 'Julio' WHEN 8 THEN 'Agosto' WHEN 9 THEN 'Septiembre'
                    WHEN 10 THEN 'Octubre' WHEN 11 THEN 'Noviembre' WHEN 12 THEN 'Diciembre'
                END || ' ' || NEW.year,
            'schedule_published'::notification_type,
            '/schedule'
        FROM schedule_entries se
        WHERE se.schedule_id = NEW.id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION notify_time_off_reviewed()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.status != OLD.status AND NEW.status IN ('approved', 'rejected') THEN
        INSERT INTO notifications (user_id, title, message, type, link)
        VALUES (
            NEW.employee_id,
            CASE NEW.status
                WHEN 'approved' THEN 'Solicitud aprobada'
                WHEN 'rejected' THEN 'Solicitud rechazada'
            END,
            'Tu solicitud de días libres del ' || NEW.start_date || ' al ' || NEW.end_date ||
            ' ha sido ' ||
            CASE NEW.status
                WHEN 'approved' THEN 'aprobada'
                WHEN 'rejected' THEN 'rechazada'
            END,
            'request_update'::notification_type,
            '/requests'
        );
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION notify_swap_request()
RETURNS TRIGGER AS $$
DECLARE
    v_requester_name TEXT;
BEGIN
    SELECT first_name || ' ' || last_name INTO v_requester_name
    FROM profiles WHERE id = NEW.requester_id;

    INSERT INTO notifications (user_id, title, message, type, link)
    VALUES (
        NEW.target_id,
        'Solicitud de intercambio',
        v_requester_name || ' quiere intercambiar un turno contigo.',
        'swap_request'::notification_type,
        '/requests'
    );

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Add missing indexes for common queries
CREATE INDEX IF NOT EXISTS idx_schedule_entries_schedule_employee
    ON schedule_entries(schedule_id, employee_id);
CREATE INDEX IF NOT EXISTS idx_schedule_entries_schedule_date
    ON schedule_entries(schedule_id, date);
CREATE INDEX IF NOT EXISTS idx_swap_status
    ON shift_swap_requests(status);
CREATE INDEX IF NOT EXISTS idx_time_off_employee_status
    ON time_off_requests(employee_id, status);
CREATE INDEX IF NOT EXISTS idx_profiles_location_active
    ON profiles(location_id, is_active);
```

- [ ] **Step 2: Apply migration to Supabase**

Run via Supabase MCP `execute_sql` or via dashboard SQL editor. Execute the full content of `006_fix_rls_security.sql`.

- [ ] **Step 3: Verify RLS restrictions work**

Test that an authenticated employee cannot change their own role:
```sql
-- As a test, try to update role as the employee user (should be blocked)
-- This should fail with RLS violation
```

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/006_fix_rls_security.sql
git commit -m "fix(security): restrict RLS policies — block self-promotion, notification spoofing, set search_path on SECURITY DEFINER functions, add missing indexes"
```

---

### Task 2: Fix swap approval API — atomic transaction + remove `reviewer_id` from body

**Files:**
- Create: `supabase/migrations/007_swap_approval_rpc.sql`
- Modify: `src/app/api/swaps/approve/route.ts`

- [ ] **Step 1: Create RPC function for atomic swap approval**

```sql
-- 007_swap_approval_rpc.sql
-- Atomic swap approval: swaps both entries and updates status in one transaction

CREATE OR REPLACE FUNCTION approve_shift_swap(
    p_swap_id UUID,
    p_reviewer_id UUID
)
RETURNS JSONB AS $$
DECLARE
    v_swap RECORD;
BEGIN
    -- Fetch swap request
    SELECT * INTO v_swap FROM shift_swap_requests WHERE id = p_swap_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('error', 'Solicitud no encontrada');
    END IF;

    IF v_swap.status != 'accepted' THEN
        RETURN jsonb_build_object('error', 'Solo se pueden aprobar intercambios aceptados');
    END IF;

    -- Swap employee_ids atomically
    UPDATE schedule_entries SET employee_id = v_swap.target_id
        WHERE id = v_swap.requester_entry_id;
    UPDATE schedule_entries SET employee_id = v_swap.requester_id
        WHERE id = v_swap.target_entry_id;

    -- Update swap status
    UPDATE shift_swap_requests
        SET status = 'approved', reviewed_by = p_reviewer_id
        WHERE id = p_swap_id;

    -- Create notifications
    INSERT INTO notifications (user_id, title, message, type, link) VALUES
        (v_swap.requester_id, 'Intercambio aprobado',
         'Tu solicitud de intercambio de turno ha sido aprobada.',
         'swap_request', '/requests'),
        (v_swap.target_id, 'Intercambio aprobado',
         'El intercambio de turno ha sido aprobado por el manager.',
         'swap_request', '/requests');

    RETURN jsonb_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
```

- [ ] **Step 2: Apply migration**

Run via Supabase MCP `execute_sql`.

- [ ] **Step 3: Rewrite the route handler to use the RPC**

Replace `src/app/api/swaps/approve/route.ts` with:

```typescript
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  try {
    // 1. Verify caller is admin or manager
    const supabase = await createServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user)
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });

    const { data: callerProfile, error: profileError } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    if (profileError || !callerProfile) {
      return NextResponse.json({ error: "Error al verificar permisos" }, { status: 500 });
    }

    if (!["admin", "manager"].includes(callerProfile.role)) {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }

    // 2. Parse and validate body
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Body JSON inválido" }, { status: 400 });
    }

    const { swap_id } = body as { swap_id?: string };

    if (!swap_id || typeof swap_id !== "string") {
      return NextResponse.json(
        { error: "swap_id es requerido y debe ser un string" },
        { status: 400 }
      );
    }

    // UUID format validation
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(swap_id)) {
      return NextResponse.json({ error: "swap_id formato inválido" }, { status: 400 });
    }

    // 3. Call atomic RPC — reviewer_id always comes from the session, never from body
    const adminSupabase = createAdminClient();
    const { data, error } = await adminSupabase.rpc("approve_shift_swap", {
      p_swap_id: swap_id,
      p_reviewer_id: user.id,
    });

    if (error) {
      console.error("approve_shift_swap RPC error:", error);
      return NextResponse.json(
        { error: "Error al procesar el intercambio" },
        { status: 500 }
      );
    }

    if (data?.error) {
      return NextResponse.json({ error: data.error }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Swap approval error:", err);
    return NextResponse.json(
      { error: "Error interno del servidor" },
      { status: 500 }
    );
  }
}
```

- [ ] **Step 4: Verify build passes**

Run: `npm run build`
Expected: Build succeeds with no errors.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/007_swap_approval_rpc.sql src/app/api/swaps/approve/route.ts
git commit -m "fix(security): atomic swap approval via RPC, remove reviewer_id from body, add input validation"
```

---

## Phase 2: Core Infrastructure

### Task 3: Stabilize Supabase client — fix infinite re-render bug

**Files:**
- Modify: `src/lib/supabase/client.ts`

**Why:** `createClient()` is already a singleton (returns cached `client`), but the current pattern in hooks (`const supabase = createClient()` at render time + `[supabase]` in deps) creates confusion. The fix: the singleton already works, but hooks should NOT include `supabase` in dependency arrays since the reference is stable.

- [ ] **Step 1: Update all hooks to remove `supabase` from dependency arrays**

Modify `src/hooks/use-auth.ts`:
- Line 45: Change `}, [supabase]);` to `}, []);` (supabase is a stable singleton)

Modify `src/hooks/use-notifications.ts`:
- Line 58: Change `}, [supabase]);` to `}, []);`

Modify `src/hooks/use-settings.ts`:
- Line 30: Change `}, [supabase]);` to `}, []);`

- [ ] **Step 2: Verify build passes**

Run: `npm run build`

- [ ] **Step 3: Commit**

```bash
git add src/hooks/use-auth.ts src/hooks/use-notifications.ts src/hooks/use-settings.ts
git commit -m "fix(hooks): remove supabase from useEffect deps — client is a singleton, was causing re-render loops"
```

---

### Task 4: Create AuthProvider context — eliminate duplicate fetches

**Files:**
- Create: `src/contexts/auth-context.tsx`
- Modify: `src/app/(authenticated)/layout.tsx`
- Modify: `src/hooks/use-auth.ts`

- [ ] **Step 1: Create AuthProvider**

Create `src/contexts/auth-context.tsx`:

```typescript
"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Profile } from "@/lib/types";
import type { User } from "@supabase/supabase-js";

interface AuthContextType {
  user: User | null;
  profile: Profile | null;
  loading: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const supabase = createClient();

  useEffect(() => {
    async function getUser() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      setUser(user);

      if (user) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("*, position:positions(*), location:locations(*)")
          .eq("id", user.id)
          .single();
        setProfile(profile);
      }

      setLoading(false);
    }

    getUser();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      if (!session?.user) {
        setProfile(null);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
    window.location.href = "/login";
  };

  return (
    <AuthContext.Provider value={{ user, profile, loading, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
```

- [ ] **Step 2: Add AuthProvider to authenticated layout**

Modify `src/app/(authenticated)/layout.tsx` — wrap children with `AuthProvider`:

```typescript
"use client";

import { useState } from "react";
import { AuthProvider } from "@/contexts/auth-context";
import { Sidebar } from "@/components/layout/sidebar";
import { Navbar } from "@/components/layout/navbar";
import { cn } from "@/lib/utils";

export default function AuthenticatedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <AuthProvider>
      <div className="flex h-screen overflow-hidden">
        {sidebarOpen && (
          <div
            className="fixed inset-0 z-50 bg-black/50 lg:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        )}
        <div
          className={cn(
            "fixed inset-y-0 left-0 z-50 transform transition-transform duration-200 ease-in-out lg:static lg:translate-x-0",
            sidebarOpen ? "translate-x-0" : "-translate-x-full"
          )}
        >
          <Sidebar />
        </div>
        <div className="flex flex-1 flex-col overflow-hidden">
          <Navbar onMenuClick={() => setSidebarOpen(true)} />
          <main className="flex-1 overflow-y-auto p-4 lg:p-6">
            {children}
          </main>
        </div>
      </div>
    </AuthProvider>
  );
}
```

- [ ] **Step 3: Update `use-auth.ts` to re-export from context**

Replace `src/hooks/use-auth.ts` with:

```typescript
export { useAuth } from "@/contexts/auth-context";
```

- [ ] **Step 4: Verify build passes**

Run: `npm run build`

- [ ] **Step 5: Commit**

```bash
git add src/contexts/auth-context.tsx src/app/\(authenticated\)/layout.tsx src/hooks/use-auth.ts
git commit -m "refactor: centralize auth in AuthProvider context — eliminates duplicate Supabase fetches across components"
```

---

### Task 5: Generate Supabase types

**Files:**
- Create: `src/lib/supabase/database.types.ts`
- Modify: `src/lib/supabase/client.ts`
- Modify: `src/lib/supabase/server.ts`
- Modify: `src/lib/supabase/admin.ts`
- Modify: `src/lib/supabase/middleware.ts`

- [ ] **Step 1: Generate types using Supabase MCP**

Use the Supabase MCP tool `generate_typescript_types` for the project. Save output to `src/lib/supabase/database.types.ts`.

- [ ] **Step 2: Add `Database` generic to all clients**

Modify `src/lib/supabase/client.ts`:
```typescript
import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "./database.types";

let client: ReturnType<typeof createBrowserClient<Database>> | null = null;

export function createClient() {
  if (!client) {
    client = createBrowserClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
  }
  return client;
}
```

Apply same `Database` generic to `server.ts`, `admin.ts`, `middleware.ts`.

- [ ] **Step 3: Verify build**

Run: `npm run build`

- [ ] **Step 4: Commit**

```bash
git add src/lib/supabase/
git commit -m "feat: add generated Supabase types with Database generic on all clients"
```

---

## Phase 3: Error Boundaries & Loading States

### Task 6: Add error boundaries and loading files

**Files:**
- Create: `src/app/global-error.tsx`
- Create: `src/app/not-found.tsx`
- Create: `src/app/(authenticated)/error.tsx`
- Create: `src/app/(authenticated)/loading.tsx`

- [ ] **Step 1: Create global error boundary**

`src/app/global-error.tsx`:
```typescript
"use client";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="es">
      <body className="flex min-h-screen items-center justify-center bg-background text-foreground">
        <div className="text-center space-y-4">
          <h2 className="text-2xl font-bold">Algo salió mal</h2>
          <p className="text-muted-foreground">
            Ha ocurrido un error inesperado.
          </p>
          <button
            onClick={reset}
            className="rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground hover:bg-primary/90"
          >
            Intentar de nuevo
          </button>
        </div>
      </body>
    </html>
  );
}
```

- [ ] **Step 2: Create not-found page**

`src/app/not-found.tsx`:
```typescript
import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="text-center space-y-4">
        <h1 className="text-6xl font-bold text-muted-foreground">404</h1>
        <h2 className="text-xl font-semibold">Página no encontrada</h2>
        <p className="text-muted-foreground">
          La página que buscas no existe.
        </p>
        <Link
          href="/dashboard"
          className="inline-block rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground hover:bg-primary/90"
        >
          Ir al inicio
        </Link>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Create authenticated error boundary**

`src/app/(authenticated)/error.tsx`:
```typescript
"use client";

import { Button } from "@/components/ui/button";
import { AlertCircle } from "lucide-react";

export default function AuthenticatedError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center space-y-4">
      <AlertCircle className="h-12 w-12 text-destructive" />
      <h2 className="text-xl font-semibold">Error</h2>
      <p className="text-muted-foreground max-w-md">
        Ha ocurrido un error al cargar esta página. Por favor intenta de nuevo.
      </p>
      <Button onClick={reset}>Intentar de nuevo</Button>
    </div>
  );
}
```

- [ ] **Step 4: Create authenticated loading state**

`src/app/(authenticated)/loading.tsx`:
```typescript
import { Loader2 } from "lucide-react";

export default function AuthenticatedLoading() {
  return (
    <div className="flex items-center justify-center py-12">
      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
    </div>
  );
}
```

- [ ] **Step 5: Verify build**

Run: `npm run build`

- [ ] **Step 6: Commit**

```bash
git add src/app/global-error.tsx src/app/not-found.tsx src/app/\(authenticated\)/error.tsx src/app/\(authenticated\)/loading.tsx
git commit -m "feat: add error boundaries, loading states, and 404 page"
```

---

## Phase 4: Data Fetching Optimization

### Task 7: Parallelize sequential queries in dashboard and schedule

**Files:**
- Modify: `src/app/(authenticated)/dashboard/page.tsx`
- Modify: `src/app/(authenticated)/schedule/page.tsx`

- [ ] **Step 1: Parallelize dashboard queries**

In `src/app/(authenticated)/dashboard/page.tsx`, replace the sequential queries inside `fetchStats()` (lines 59-114) with `Promise.all`:

```typescript
// Replace the sequential try block with:
try {
  const [shiftsResult, weekResult, ...managementResults] = await Promise.all([
    // 1. My shifts this month
    supabase
      .from("schedule_entries")
      .select("id, schedule:schedules!inner(status, month, year)", { count: "exact", head: true })
      .eq("employee_id", user.id)
      .eq("schedule.status", "published")
      .eq("schedule.month", currentMonth)
      .eq("schedule.year", currentYear),
    // 2. Hours this week
    supabase
      .from("schedule_entries")
      .select("start_time, end_time, schedule:schedules!inner(status)")
      .eq("employee_id", user.id)
      .eq("schedule.status", "published")
      .gte("date", weekStartStr)
      .lte("date", weekEndStr),
    // 3. Active employees (admin/manager)
    ...(canManage
      ? [
          supabase
            .from("profiles")
            .select("id", { count: "exact", head: true })
            .eq("is_active", true),
          supabase
            .from("time_off_requests")
            .select("id", { count: "exact", head: true })
            .eq("status", "pending"),
        ]
      : []),
    // 5. Upcoming shifts
    supabase
      .from("schedule_entries")
      .select("id, date, start_time, end_time, position:positions(name, color), schedule:schedules!inner(status)")
      .eq("employee_id", user.id)
      .eq("schedule.status", "published")
      .gte("date", today)
      .order("date")
      .limit(5),
  ]);

  setMyShiftsCount(shiftsResult.count || 0);

  // Calculate weekly hours
  let totalHours = 0;
  for (const entry of weekResult.data || []) {
    const [sh, sm] = entry.start_time.split(":").map(Number);
    const [eh, em] = entry.end_time.split(":").map(Number);
    let mins = eh * 60 + em - (sh * 60 + sm);
    if (mins < 0) mins += 24 * 60;
    totalHours += mins / 60;
  }
  setWeeklyHours(Math.round(totalHours * 10) / 10);

  if (canManage && managementResults.length >= 2) {
    setActiveEmployees(managementResults[0].count || 0);
    setPendingRequests(managementResults[1].count || 0);
  }

  // Upcoming shifts is the last result
  const upcomingResult = canManage
    ? managementResults[managementResults.length - 1]
    : managementResults[0] || { data: [] };
  setUpcomingShifts(upcomingResult?.data || []);
} catch {
  // Dashboard is non-critical
}
```

- [ ] **Step 2: Parallelize schedule queries**

In `src/app/(authenticated)/schedule/page.tsx`, inside `fetchScheduleData` (lines 88-134), replace sequential queries with `Promise.all`:

```typescript
const fetchScheduleData = useCallback(async () => {
  if (!selectedLocationId) return;
  setLoading(true);

  try {
    // Fetch all independent data in parallel
    const [scheduleResult, empResult, posResult, shiftResult] = await Promise.all([
      supabase
        .from("schedules")
        .select("*")
        .eq("location_id", selectedLocationId)
        .eq("month", month + 1)
        .eq("year", year)
        .maybeSingle(),
      supabase
        .from("profiles")
        .select("*, position:positions(*), location:locations(*)")
        .eq("location_id", selectedLocationId)
        .eq("is_active", true)
        .order("last_name"),
      supabase
        .from("positions")
        .select("*, department:departments!inner(location_id)")
        .eq("department.location_id", selectedLocationId)
        .order("name"),
      supabase
        .from("shift_templates")
        .select("*")
        .eq("location_id", selectedLocationId)
        .order("name"),
    ]);

    const scheduleData = scheduleResult.data;
    setSchedule(scheduleData);
    setEmployees(empResult.data || []);
    setPositions(posResult.data || []);
    setShiftTemplates(shiftResult.data || []);

    // Entries depend on schedule existing
    if (scheduleData) {
      const { data: entryData } = await supabase
        .from("schedule_entries")
        .select("*, employee:profiles(id, first_name, last_name), position:positions(*), shift_template:shift_templates(*)")
        .eq("schedule_id", scheduleData.id);
      setEntries(entryData || []);
    } else {
      setEntries([]);
    }
  } catch (err) {
    toast.error("Error al cargar datos del horario");
  }

  setLoading(false);
}, [selectedLocationId, month, year]);
```

- [ ] **Step 3: Remove eslint-disable comments**

Remove all `// eslint-disable-next-line react-hooks/exhaustive-deps` from both files since the deps are now correct.

- [ ] **Step 4: Verify build**

Run: `npm run build`

- [ ] **Step 5: Commit**

```bash
git add src/app/\(authenticated\)/dashboard/page.tsx src/app/\(authenticated\)/schedule/page.tsx
git commit -m "perf: parallelize sequential Supabase queries in dashboard and schedule pages"
```

---

## Phase 5: Component Decomposition & Memoization

### Task 8: Fix Fragment key + memoize ScheduleCell

**Files:**
- Modify: `src/components/schedule/schedule-calendar-grid.tsx`
- Modify: `src/components/schedule/schedule-cell.tsx`

- [ ] **Step 1: Add Fragment key and stabilize callback**

In `schedule-calendar-grid.tsx`:
- Line 1: Add `import { Fragment, useCallback } from "react";`
- Line 60: Change `<>` to `<Fragment key={employee.id}>`
- Line 102: Change `</>` to `</Fragment>`
- Line 90: Change `min-h-[48px]` to `min-h-12`

- [ ] **Step 2: Wrap ScheduleCell in React.memo**

In `schedule-cell.tsx`, wrap the component:

```typescript
import { memo } from "react";
// ... rest of imports

function ScheduleCellInner({ entry, canEdit, onClick }: ScheduleCellProps) {
  // ... existing implementation unchanged
}

export const ScheduleCell = memo(ScheduleCellInner);
```

- [ ] **Step 3: Verify build**

Run: `npm run build`

- [ ] **Step 4: Commit**

```bash
git add src/components/schedule/schedule-calendar-grid.tsx src/components/schedule/schedule-cell.tsx
git commit -m "fix: add missing Fragment key, memoize ScheduleCell, use Tailwind min-h-12"
```

---

### Task 9: Fix DataTable key usage

**Files:**
- Modify: `src/components/shared/data-table.tsx`

- [ ] **Step 1: Add `keyAccessor` prop for stable row keys**

Update `DataTableProps` interface to add an optional `keyAccessor`:

```typescript
interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  loading: boolean;
  emptyMessage?: string;
  searchPlaceholder?: string;
  searchValue?: string;
  onSearchChange?: (value: string) => void;
  keyAccessor?: (row: T) => string;
}
```

Update the row rendering (line 94-99):
```typescript
data.map((row, rowIndex) => (
  <TableRow key={keyAccessor ? keyAccessor(row) : rowIndex}>
    {columns.map((column, colIndex) => (
      <TableCell key={colIndex} className={column.className}>
        {column.cell(row)}
      </TableCell>
    ))}
  </TableRow>
))
```

- [ ] **Step 2: Verify build**

Run: `npm run build`

- [ ] **Step 3: Commit**

```bash
git add src/components/shared/data-table.tsx
git commit -m "fix: add keyAccessor prop to DataTable for stable row keys"
```

---

## Phase 6: Accessibility, SEO & Tailwind Cleanup

### Task 10: Add aria-labels to all icon-only buttons

**Files:**
- Modify: `src/components/layout/navbar.tsx`
- Modify: `src/components/schedule/schedule-cell.tsx`
- Modify: `src/components/schedule/schedule-toolbar.tsx`
- Modify: `src/app/login/page.tsx`

- [ ] **Step 1: Fix navbar buttons**

In `navbar.tsx`:
- Line 20-27: Add `aria-label="Abrir menú"` to the menu Button
- Line 33: Add `aria-label={unreadCount > 0 ? \`Notificaciones (${unreadCount} sin leer)\` : "Notificaciones"}` to the notifications Button
- Lines 46-49: Replace custom avatar div with proper `aria-label`
- Add `aria-hidden="true"` to `Menu` and `Bell` icons

- [ ] **Step 2: Fix schedule cell buttons**

In `schedule-cell.tsx`:
- Line 16: Add `aria-label={`Turno ${formatTime(entry.start_time)}-${formatTime(entry.end_time)}${entry.position ? `, ${entry.position.name}` : ''}`}`
- Line 37-43: Add `aria-label="Agregar turno"`

- [ ] **Step 3: Fix schedule toolbar navigation buttons**

In `schedule-toolbar.tsx`:
- Line 73: Add `aria-label="Mes anterior"` to prev button
- Line 79: Add `aria-label="Mes siguiente"` to next button

- [ ] **Step 4: Fix login page error**

In `login/page.tsx`:
- Line 84: Add `role="alert"` to the error `<p>` element
- Line 52: Add `aria-hidden="true"` to the decorative Calendar icon

- [ ] **Step 5: Verify build**

Run: `npm run build`

- [ ] **Step 6: Commit**

```bash
git add src/components/layout/navbar.tsx src/components/schedule/schedule-cell.tsx src/components/schedule/schedule-toolbar.tsx src/app/login/page.tsx
git commit -m "a11y: add aria-labels to icon-only buttons, role=alert on errors"
```

---

### Task 11: Add root metadata template and dark mode CSS variables

**Files:**
- Modify: `src/app/layout.tsx`
- Modify: `src/app/globals.css`

- [ ] **Step 1: Improve root metadata**

In `src/app/layout.tsx`, replace the metadata export:

```typescript
export const metadata: Metadata = {
  title: {
    default: "Horarios - Gestión de Horarios",
    template: "%s | Horarios",
  },
  description: "Aplicación para gestionar y repartir horarios de empleados",
  robots: { index: false, follow: false },
};
```

- [ ] **Step 2: Add dark mode CSS variables**

In `src/app/globals.css`, add after the `:root` block (line 27), inside the same `@layer base`:

```css
  .dark {
    --background: 222.2 84% 4.9%;
    --foreground: 210 40% 98%;
    --card: 222.2 84% 4.9%;
    --card-foreground: 210 40% 98%;
    --popover: 222.2 84% 4.9%;
    --popover-foreground: 210 40% 98%;
    --primary: 217.2 91.2% 59.8%;
    --primary-foreground: 222.2 47.4% 11.2%;
    --secondary: 217.2 32.6% 17.5%;
    --secondary-foreground: 210 40% 98%;
    --muted: 217.2 32.6% 17.5%;
    --muted-foreground: 215 20.2% 65.1%;
    --accent: 217.2 32.6% 17.5%;
    --accent-foreground: 210 40% 98%;
    --destructive: 0 62.8% 30.6%;
    --destructive-foreground: 210 40% 98%;
    --border: 217.2 32.6% 17.5%;
    --input: 217.2 32.6% 17.5%;
    --ring: 224.3 76.3% 48%;
  }
```

- [ ] **Step 3: Merge the two `@layer base` blocks into one**

Combine both `@layer base` blocks in `globals.css` into a single block.

- [ ] **Step 4: Verify build**

Run: `npm run build`

- [ ] **Step 5: Commit**

```bash
git add src/app/layout.tsx src/app/globals.css
git commit -m "feat: add dark mode CSS variables, metadata template, robots noindex"
```

---

### Task 12: Add robots.txt and login page metadata

**Files:**
- Create: `src/app/robots.ts`
- Modify: `src/app/login/page.tsx` (convert metadata portion to server component or add via `generateMetadata`)

- [ ] **Step 1: Create robots.ts**

```typescript
import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      disallow: "/",
    },
  };
}
```

- [ ] **Step 2: Verify build**

Run: `npm run build`

- [ ] **Step 3: Commit**

```bash
git add src/app/robots.ts
git commit -m "feat: add robots.txt to disallow crawling of authenticated app"
```

---

### Task 13: Tailwind cleanup — `size-*` shorthand and search input a11y

**Files:**
- Modify: `src/components/layout/navbar.tsx`
- Modify: `src/components/shared/data-table.tsx`
- Modify: `src/app/login/page.tsx`

- [ ] **Step 1: Replace `h-X w-X` with `size-X` across files**

In `navbar.tsx`:
- `h-5 w-5` → `size-5` (lines 26, 34, 36)
- `h-8 w-8` → `size-8` (line 46)

In `data-table.tsx`:
- `h-4 w-4` → `size-4` (line 56)
- Add `aria-label="Buscar"` to the search Input (line 57)

In `login/page.tsx`:
- `h-12 w-12` → `size-12` (line 51)
- `h-6 w-6` → `size-6` (line 52)

- [ ] **Step 2: Verify build**

Run: `npm run build`

- [ ] **Step 3: Commit**

```bash
git add src/components/layout/navbar.tsx src/components/shared/data-table.tsx src/app/login/page.tsx
git commit -m "cleanup: use Tailwind size-* shorthand, add aria-label to search input"
```

---

## Summary

| Phase | Tasks | Commits | Focus |
|-------|-------|---------|-------|
| 1 — Security | 1-2 | 2 | RLS, atomic swaps, input validation |
| 2 — Infrastructure | 3-5 | 3 | Singleton fix, AuthProvider, generated types |
| 3 — Error Boundaries | 6 | 1 | global-error, not-found, error, loading |
| 4 — Data Fetching | 7 | 1 | Promise.all for parallel queries |
| 5 — Components | 8-9 | 2 | Fragment key, memo, DataTable keys |
| 6 — A11y/SEO/Cleanup | 10-13 | 4 | aria-labels, metadata, dark mode, Tailwind |

**Total: 13 tasks, 13 commits**

Findings NOT included (intentionally deferred):
- Converting pages from `"use client"` to Server Components (#7 in audit) — this is a major architectural change that requires rethinking the entire data fetching strategy and should be its own project
- Extracting monolithic page components (#10 in audit, `employees/page.tsx` at 991 lines) — requires its own plan with careful dialog extraction
- `employee_secondary_positions` table gap (#22) — needs product decision on whether it's needed
