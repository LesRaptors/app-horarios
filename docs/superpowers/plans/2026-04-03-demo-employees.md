# Demo Employees Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow admins/managers to create placeholder "demo" employees for schedule planning, then convert or transfer their shifts to real employees.

**Architecture:** Add `is_demo` boolean column to `profiles`. Demo employees are inserted directly (no auth user). Two conversion paths: in-place convert (creates auth user, migrates shifts) and transfer (moves shifts to existing employee). Visual identification via Badge + italic styling.

**Tech Stack:** Next.js 14, Supabase (Postgres + Auth), TypeScript, shadcn/ui, Tailwind CSS

**Important notes:**
- No test runner configured. Verify with `npm run build`.
- All UI text in Spanish.
- API routes use `createAdminClient()` from `src/lib/supabase/admin.ts` for service_role operations.
- The `profiles_insert` RLS policy is `WITH CHECK (false)` — all inserts must use service_role.

---

## Task 1: Database migration — add `is_demo` column

**Files:**
- Create: `supabase/migrations/009_demo_employees.sql`
- Modify: `src/lib/types.ts`
- Modify: `src/lib/supabase/database.types.ts` (regenerate)

- [ ] **Step 1: Create migration file**

Create `supabase/migrations/009_demo_employees.sql`:

```sql
-- Add is_demo flag to profiles
ALTER TABLE profiles ADD COLUMN is_demo BOOLEAN NOT NULL DEFAULT false;

-- Partial index for quick demo lookups
CREATE INDEX idx_profiles_is_demo ON profiles (is_demo) WHERE is_demo = true;
```

- [ ] **Step 2: Apply migration to Supabase**

Run via Supabase MCP `execute_sql` with the SQL above.

- [ ] **Step 3: Add `is_demo` to Profile type**

In `src/lib/types.ts`, add `is_demo: boolean;` to the `Profile` interface after `is_active`:

```typescript
export interface Profile {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string | null;
  role: UserRole;
  position_id: string | null;
  location_id: string | null;
  max_hours_per_week: number;
  is_active: boolean;
  is_demo: boolean;
  created_at: string;
  updated_at: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  position?: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  location?: any;
}
```

- [ ] **Step 4: Regenerate Supabase types**

Use Supabase MCP `generate_typescript_types` and overwrite `src/lib/supabase/database.types.ts`.

- [ ] **Step 5: Verify build**

Run: `npm run build`

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/009_demo_employees.sql src/lib/types.ts src/lib/supabase/database.types.ts
git commit -m "feat(demo): add is_demo column to profiles"
```

---

## Task 2: API route — create demo employee

**Files:**
- Create: `src/app/api/employees/demo/route.ts`

- [ ] **Step 1: Create the route handler**

Create `src/app/api/employees/demo/route.ts`:

```typescript
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";

export async function POST(request: NextRequest) {
  try {
    // 1. Verify caller is admin or manager
    const supabase = await createClient();
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

    // 2. Parse body
    const body = await request.json();
    const { first_name, last_name, role, position_id, location_id, max_hours_per_week } = body as {
      first_name?: string;
      last_name?: string;
      role?: string;
      position_id?: string;
      location_id?: string;
      max_hours_per_week?: number;
    };

    if (!first_name || !last_name) {
      return NextResponse.json(
        { error: "Nombre y apellido son requeridos" },
        { status: 400 }
      );
    }

    // 3. Insert demo profile directly (no auth user)
    const demoId = randomUUID();
    const adminSupabase = createAdminClient();

    const { error: insertError } = await adminSupabase
      .from("profiles")
      .insert({
        id: demoId,
        first_name,
        last_name,
        email: `demo-${demoId}@placeholder.local`,
        role: (role as "admin" | "manager" | "employee") || "employee",
        position_id: position_id || null,
        location_id: location_id || null,
        max_hours_per_week: max_hours_per_week ?? 40,
        is_active: true,
        is_demo: true,
      } as Record<string, unknown>);

    if (insertError) {
      console.error("Demo employee insert error:", insertError);
      return NextResponse.json(
        { error: "Error al crear el empleado demo" },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, employee_id: demoId });
  } catch (error) {
    console.error("Demo employee creation error:", error);
    return NextResponse.json(
      { error: "Error interno del servidor" },
      { status: 500 }
    );
  }
}
```

- [ ] **Step 2: Verify build**

Run: `npm run build`

- [ ] **Step 3: Commit**

```bash
git add src/app/api/employees/demo/route.ts
git commit -m "feat(demo): add API route for creating demo employees"
```

---

## Task 3: API route — convert demo to real employee

**Files:**
- Create: `supabase/migrations/010_convert_demo_rpc.sql`
- Create: `src/app/api/employees/demo/convert/route.ts`

- [ ] **Step 1: Create RPC for atomic conversion**

Create `supabase/migrations/010_convert_demo_rpc.sql`:

```sql
-- Atomic demo-to-real conversion
-- Migrates all schedule_entries and secondary_positions from demo to real user
CREATE OR REPLACE FUNCTION convert_demo_to_real(
  p_demo_id UUID,
  p_real_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_demo RECORD;
  v_entries_count INT;
BEGIN
  -- 1. Verify demo exists and is actually a demo
  SELECT * INTO v_demo FROM profiles WHERE id = p_demo_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Empleado demo no encontrado');
  END IF;

  IF NOT v_demo.is_demo THEN
    RETURN jsonb_build_object('success', false, 'error', 'El empleado no es un demo');
  END IF;

  -- 2. Migrate schedule entries
  UPDATE schedule_entries SET employee_id = p_real_id WHERE employee_id = p_demo_id;
  GET DIAGNOSTICS v_entries_count = ROW_COUNT;

  -- 3. Migrate secondary positions
  UPDATE employee_secondary_positions SET employee_id = p_real_id WHERE employee_id = p_demo_id;

  -- 4. Update the real profile with demo's data
  UPDATE profiles SET
    position_id = COALESCE((SELECT position_id FROM profiles WHERE id = p_demo_id), position_id),
    location_id = COALESCE((SELECT location_id FROM profiles WHERE id = p_demo_id), location_id),
    max_hours_per_week = (SELECT max_hours_per_week FROM profiles WHERE id = p_demo_id)
  WHERE id = p_real_id;

  -- 5. Delete the demo profile
  DELETE FROM profiles WHERE id = p_demo_id;

  RETURN jsonb_build_object(
    'success', true,
    'entries_migrated', v_entries_count
  );
END;
$$;
```

- [ ] **Step 2: Apply migration**

Run via Supabase MCP `execute_sql`.

- [ ] **Step 3: Create the route handler**

Create `src/app/api/employees/demo/convert/route.ts`:

```typescript
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  try {
    // 1. Verify caller is admin or manager
    const supabase = await createClient();
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

    if (profileError || !callerProfile || !["admin", "manager"].includes(callerProfile.role)) {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }

    // 2. Parse body
    const body = await request.json();
    const { demo_id, email } = body as { demo_id?: string; email?: string };

    if (!demo_id || !email) {
      return NextResponse.json(
        { error: "demo_id y email son requeridos" },
        { status: 400 }
      );
    }

    // 3. Get demo profile data for the invitation metadata
    const adminSupabase = createAdminClient();
    const { data: demoProfile } = await adminSupabase
      .from("profiles")
      .select("first_name, last_name, role, is_demo")
      .eq("id", demo_id)
      .single();

    if (!demoProfile || !demoProfile.is_demo) {
      return NextResponse.json(
        { error: "Empleado demo no encontrado" },
        { status: 404 }
      );
    }

    // 4. Create real auth user via invitation
    const { data: newUser, error: inviteError } =
      await adminSupabase.auth.admin.inviteUserByEmail(email, {
        data: {
          first_name: demoProfile.first_name,
          last_name: demoProfile.last_name,
          role: demoProfile.role,
        },
      });

    if (inviteError) {
      console.error("Convert invite error:", inviteError);
      const msg = inviteError.message.toLowerCase();
      let userMessage = "Error al crear el usuario. Intenta de nuevo.";
      if (msg.includes("already") || msg.includes("exists")) {
        userMessage = "Ya existe un usuario con ese correo electrónico.";
      }
      return NextResponse.json({ error: userMessage }, { status: 400 });
    }

    if (!newUser?.user) {
      return NextResponse.json({ error: "Error al crear usuario" }, { status: 500 });
    }

    // 5. Atomic migration via RPC
    const { data: rpcResult, error: rpcError } = await (adminSupabase.rpc as Function)(
      "convert_demo_to_real",
      { p_demo_id: demo_id, p_real_id: newUser.user.id }
    );

    if (rpcError) {
      console.error("Convert RPC error:", rpcError);
      return NextResponse.json(
        { error: "Error al migrar datos del demo" },
        { status: 500 }
      );
    }

    if (rpcResult && !(rpcResult as Record<string, unknown>).success) {
      return NextResponse.json(
        { error: (rpcResult as Record<string, string>).error },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      user_id: newUser.user.id,
      entries_migrated: (rpcResult as Record<string, number>)?.entries_migrated ?? 0,
    });
  } catch (error) {
    console.error("Demo convert error:", error);
    return NextResponse.json(
      { error: "Error interno del servidor" },
      { status: 500 }
    );
  }
}
```

- [ ] **Step 4: Verify build**

Run: `npm run build`

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/010_convert_demo_rpc.sql src/app/api/employees/demo/convert/route.ts
git commit -m "feat(demo): add convert demo-to-real API with atomic RPC migration"
```

---

## Task 4: API route — transfer shifts from demo to real employee

**Files:**
- Create: `src/app/api/employees/demo/transfer/route.ts`

- [ ] **Step 1: Create the route handler**

Create `src/app/api/employees/demo/transfer/route.ts`:

```typescript
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  try {
    // 1. Verify caller is admin or manager
    const supabase = await createClient();
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

    if (profileError || !callerProfile || !["admin", "manager"].includes(callerProfile.role)) {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }

    // 2. Parse body
    const body = await request.json();
    const { demo_id, target_employee_id } = body as {
      demo_id?: string;
      target_employee_id?: string;
    };

    if (!demo_id || !target_employee_id) {
      return NextResponse.json(
        { error: "demo_id y target_employee_id son requeridos" },
        { status: 400 }
      );
    }

    const adminSupabase = createAdminClient();

    // 3. Verify demo exists
    const { data: demoProfile } = await adminSupabase
      .from("profiles")
      .select("is_demo")
      .eq("id", demo_id)
      .single();

    if (!demoProfile || !demoProfile.is_demo) {
      return NextResponse.json(
        { error: "Empleado demo no encontrado" },
        { status: 404 }
      );
    }

    // 4. Verify target exists and is real
    const { data: targetProfile } = await adminSupabase
      .from("profiles")
      .select("is_demo, is_active")
      .eq("id", target_employee_id)
      .single();

    if (!targetProfile) {
      return NextResponse.json(
        { error: "Empleado destino no encontrado" },
        { status: 404 }
      );
    }

    if (targetProfile.is_demo) {
      return NextResponse.json(
        { error: "El empleado destino no puede ser un demo" },
        { status: 400 }
      );
    }

    // 5. Transfer all schedule entries
    const { count, error: transferError } = await adminSupabase
      .from("schedule_entries")
      .update({ employee_id: target_employee_id } as Record<string, unknown>)
      .eq("employee_id", demo_id)
      .select("id", { count: "exact", head: true });

    if (transferError) {
      console.error("Transfer error:", transferError);
      return NextResponse.json(
        { error: "Error al transferir turnos" },
        { status: 500 }
      );
    }

    // 6. Archive the demo (set inactive)
    await adminSupabase
      .from("profiles")
      .update({ is_active: false } as Record<string, unknown>)
      .eq("id", demo_id);

    return NextResponse.json({
      success: true,
      entries_transferred: count ?? 0,
    });
  } catch (error) {
    console.error("Demo transfer error:", error);
    return NextResponse.json(
      { error: "Error interno del servidor" },
      { status: 500 }
    );
  }
}
```

- [ ] **Step 2: Verify build**

Run: `npm run build`

- [ ] **Step 3: Commit**

```bash
git add src/app/api/employees/demo/transfer/route.ts
git commit -m "feat(demo): add transfer shifts API — moves demo entries to real employee"
```

---

## Task 5: UI — Demo badge, create dialog, filter, convert/transfer dialogs

**Files:**
- Modify: `src/app/(authenticated)/employees/page.tsx`

This is the largest task. It modifies the employees page to add:
1. `DemoBadge` component (yellow badge)
2. "Crear empleado demo" button
3. Demo create dialog (name, position, location, hours)
4. Demo filter (Todos / Solo reales / Solo demos)
5. "Convertir a real" action button on demo rows
6. "Transferir turnos" action button on demo rows
7. Convert dialog (email input)
8. Transfer dialog (employee select)

- [ ] **Step 1: Read the full current employees page**

Read `src/app/(authenticated)/employees/page.tsx` completely to understand all existing state, dialogs, and table rendering.

- [ ] **Step 2: Add DemoBadge component**

Add after the existing `StatusBadge` component (~line 142):

```typescript
function DemoBadge() {
  return (
    <Badge className="bg-yellow-100 text-yellow-800 hover:bg-yellow-100">
      Demo
    </Badge>
  );
}
```

- [ ] **Step 3: Add demo filter state and create dialog state**

Add to the state section (~after line 169):

```typescript
// ---- Demo filter -----------------------------------------------------------
const [demoFilter, setDemoFilter] = useState<"all" | "real" | "demo">("all");

// ---- Demo create dialog ----------------------------------------------------
const [demoOpen, setDemoOpen] = useState(false);
const [demoForm, setDemoForm] = useState({
  first_name: "",
  last_name: "",
  role: "employee" as UserRole,
  location_id: "",
  department_id: "",
  position_id: "",
  max_hours_per_week: 40,
});
const [demoLoading, setDemoLoading] = useState(false);

// ---- Convert dialog --------------------------------------------------------
const [convertOpen, setConvertOpen] = useState(false);
const [convertDemoId, setConvertDemoId] = useState("");
const [convertEmail, setConvertEmail] = useState("");
const [convertLoading, setConvertLoading] = useState(false);

// ---- Transfer dialog -------------------------------------------------------
const [transferOpen, setTransferOpen] = useState(false);
const [transferDemoId, setTransferDemoId] = useState("");
const [transferTargetId, setTransferTargetId] = useState("");
const [transferLoading, setTransferLoading] = useState(false);
```

- [ ] **Step 4: Update filteredEmployees to include demo filter**

Replace the existing `filteredEmployees` memo:

```typescript
const filteredEmployees = useMemo(() => {
  let result = employees;

  // Demo filter
  if (demoFilter === "real") {
    result = result.filter((e) => !e.is_demo);
  } else if (demoFilter === "demo") {
    result = result.filter((e) => e.is_demo);
  }

  // Search
  if (search.trim()) {
    const q = search.toLowerCase();
    result = result.filter((e) => {
      const fullName = `${e.first_name} ${e.last_name}`.toLowerCase();
      const email = e.email?.toLowerCase() ?? "";
      return fullName.includes(q) || email.includes(q);
    });
  }

  return result;
}, [employees, search, demoFilter]);
```

- [ ] **Step 5: Add handler functions**

Add demo create, convert, and transfer handlers:

```typescript
// ---- Demo create handler ---------------------------------------------------
async function handleDemoCreate() {
  setDemoLoading(true);
  try {
    const res = await fetch("/api/employees/demo", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        first_name: demoForm.first_name,
        last_name: demoForm.last_name,
        role: demoForm.role,
        position_id: demoForm.position_id || null,
        location_id: demoForm.location_id || null,
        max_hours_per_week: demoForm.max_hours_per_week,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      toast.error(data.error || "Error al crear empleado demo");
    } else {
      toast.success("Empleado demo creado exitosamente");
      setDemoOpen(false);
      setDemoForm({
        first_name: "", last_name: "", role: "employee",
        location_id: "", department_id: "", position_id: "",
        max_hours_per_week: 40,
      });
      fetchData();
    }
  } catch {
    toast.error("Error de conexión");
  }
  setDemoLoading(false);
}

// ---- Convert handler -------------------------------------------------------
async function handleConvert() {
  if (!convertEmail.trim()) {
    toast.error("El email es requerido");
    return;
  }
  setConvertLoading(true);
  try {
    const res = await fetch("/api/employees/demo/convert", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ demo_id: convertDemoId, email: convertEmail }),
    });
    const data = await res.json();
    if (!res.ok) {
      toast.error(data.error || "Error al convertir");
    } else {
      toast.success(
        `Empleado convertido. ${data.entries_migrated} turnos migrados. Invitación enviada.`
      );
      setConvertOpen(false);
      setConvertEmail("");
      fetchData();
    }
  } catch {
    toast.error("Error de conexión");
  }
  setConvertLoading(false);
}

// ---- Transfer handler ------------------------------------------------------
async function handleTransfer() {
  if (!transferTargetId) {
    toast.error("Selecciona un empleado destino");
    return;
  }
  setTransferLoading(true);
  try {
    const res = await fetch("/api/employees/demo/transfer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        demo_id: transferDemoId,
        target_employee_id: transferTargetId,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      toast.error(data.error || "Error al transferir");
    } else {
      toast.success(`${data.entries_transferred} turnos transferidos exitosamente`);
      setTransferOpen(false);
      setTransferTargetId("");
      fetchData();
    }
  } catch {
    toast.error("Error de conexión");
  }
  setTransferLoading(false);
}
```

- [ ] **Step 6: Add "Crear empleado demo" button to the page header**

Next to the existing "Invitar empleado" button, add:

```tsx
<Button variant="outline" onClick={() => setDemoOpen(true)}>
  <Plus className="mr-2 h-4 w-4" />
  Crear demo
</Button>
```

- [ ] **Step 7: Add demo filter Select in the search area**

After the search Input, add a filter select:

```tsx
<Select value={demoFilter} onValueChange={(v) => setDemoFilter(v as "all" | "real" | "demo")}>
  <SelectTrigger className="w-[160px]">
    <SelectValue />
  </SelectTrigger>
  <SelectContent>
    <SelectItem value="all">Todos</SelectItem>
    <SelectItem value="real">Solo reales</SelectItem>
    <SelectItem value="demo">Solo demos</SelectItem>
  </SelectContent>
</Select>
```

- [ ] **Step 8: Add DemoBadge to employee table rows**

In the table body where employee names are rendered, add `DemoBadge` when `is_demo` is true. Also add Convert and Transfer buttons to the actions column for demo employees.

In the name cell:
```tsx
<TableCell className="font-medium">
  {emp.first_name} {emp.last_name}
  {emp.is_demo && <DemoBadge />}
</TableCell>
```

In the actions cell, add buttons for demo employees:
```tsx
{emp.is_demo && (
  <>
    <Button
      variant="ghost"
      size="icon"
      title="Convertir a real"
      onClick={() => {
        setConvertDemoId(emp.id);
        setConvertEmail("");
        setConvertOpen(true);
      }}
    >
      <UserPlus className="h-4 w-4 text-green-600" />
    </Button>
    <Button
      variant="ghost"
      size="icon"
      title="Transferir turnos"
      onClick={() => {
        setTransferDemoId(emp.id);
        setTransferTargetId("");
        setTransferOpen(true);
      }}
    >
      <Repeat className="h-4 w-4 text-blue-600" />
    </Button>
  </>
)}
```

Add `Repeat` to the lucide-react imports at the top of the file.

- [ ] **Step 9: Add demo create dialog**

Add the Dialog JSX at the end (before the closing `</div>` of the page). The dialog should have the same cascading location→department→position selects as the invite dialog, with first_name, last_name, role, max_hours_per_week fields. Use the existing `filteredDepartments` and `filteredPositions` helpers. No email field.

- [ ] **Step 10: Add convert dialog**

```tsx
<Dialog open={convertOpen} onOpenChange={setConvertOpen}>
  <DialogContent>
    <DialogHeader>
      <DialogTitle>Convertir a empleado real</DialogTitle>
      <DialogDescription>
        Ingresa el email del empleado real. Se enviará una invitación y se migrarán todos los turnos asignados.
      </DialogDescription>
    </DialogHeader>
    <div className="space-y-4 py-2">
      <div className="space-y-2">
        <Label htmlFor="convert-email">Email</Label>
        <Input
          id="convert-email"
          type="email"
          placeholder="empleado@empresa.com"
          value={convertEmail}
          onChange={(e) => setConvertEmail(e.target.value)}
        />
      </div>
    </div>
    <DialogFooter>
      <Button variant="outline" onClick={() => setConvertOpen(false)} disabled={convertLoading}>
        Cancelar
      </Button>
      <Button onClick={handleConvert} disabled={convertLoading}>
        {convertLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        Convertir e invitar
      </Button>
    </DialogFooter>
  </DialogContent>
</Dialog>
```

- [ ] **Step 11: Add transfer dialog**

```tsx
<Dialog open={transferOpen} onOpenChange={setTransferOpen}>
  <DialogContent>
    <DialogHeader>
      <DialogTitle>Transferir turnos</DialogTitle>
      <DialogDescription>
        Selecciona el empleado real que recibirá los turnos. El empleado demo será archivado.
      </DialogDescription>
    </DialogHeader>
    <div className="space-y-4 py-2">
      <div className="space-y-2">
        <Label>Empleado destino</Label>
        <Select value={transferTargetId} onValueChange={setTransferTargetId}>
          <SelectTrigger>
            <SelectValue placeholder="Seleccionar empleado" />
          </SelectTrigger>
          <SelectContent>
            {employees
              .filter((e) => !e.is_demo && e.is_active && e.id !== transferDemoId)
              .map((e) => (
                <SelectItem key={e.id} value={e.id}>
                  {e.first_name} {e.last_name}
                </SelectItem>
              ))}
          </SelectContent>
        </Select>
      </div>
    </div>
    <DialogFooter>
      <Button variant="outline" onClick={() => setTransferOpen(false)} disabled={transferLoading}>
        Cancelar
      </Button>
      <Button onClick={handleTransfer} disabled={transferLoading}>
        {transferLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        Transferir turnos
      </Button>
    </DialogFooter>
  </DialogContent>
</Dialog>
```

- [ ] **Step 12: Verify build**

Run: `npm run build`

- [ ] **Step 13: Commit**

```bash
git add src/app/\(authenticated\)/employees/page.tsx
git commit -m "feat(demo): add demo employee UI — create, filter, badge, convert, transfer dialogs"
```

---

## Task 6: Visual identification in schedule grid

**Files:**
- Modify: `src/components/schedule/schedule-calendar-grid.tsx`

- [ ] **Step 1: Add demo styling to employee name cell**

In the employee name cell (inside the `employees.map`), add conditional styling:

Change:
```tsx
<div className="truncate text-sm">
  <div className="font-medium">
    {employee.first_name} {employee.last_name}
  </div>
```

To:
```tsx
<div className="truncate text-sm">
  <div className={cn("font-medium", employee.is_demo && "italic text-muted-foreground/70")}>
    {employee.first_name} {employee.last_name}
    {employee.is_demo && (
      <span className="ml-1 text-[10px] font-normal text-yellow-600">(Demo)</span>
    )}
  </div>
```

- [ ] **Step 2: Verify build**

Run: `npm run build`

- [ ] **Step 3: Commit**

```bash
git add src/components/schedule/schedule-calendar-grid.tsx
git commit -m "feat(demo): add italic + badge visual for demo employees in schedule grid"
```

---

## Summary

| Task | Files | Commits | Focus |
|------|-------|---------|-------|
| 1 — Migration | migration + types | 1 | `is_demo` column |
| 2 — Create API | route.ts | 1 | POST /api/employees/demo |
| 3 — Convert API | migration + route.ts | 1 | Atomic convert RPC |
| 4 — Transfer API | route.ts | 1 | Shift transfer |
| 5 — UI | employees/page.tsx | 1 | Dialogs, badge, filter |
| 6 — Grid visual | calendar-grid.tsx | 1 | Italic + demo label |

**Total: 6 tasks, 6 commits**
