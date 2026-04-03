# Demo Employees — Design Spec

**Goal:** Allow admins/managers to create placeholder "demo" employees for schedule planning before real employees are hired or confirmed, then convert or transfer their shifts to real employees.

**Context:** Currently, creating an employee requires a real email (Supabase Auth `inviteUserByEmail`). Demo employees bypass auth entirely — they exist only as `profiles` rows with a flag.

---

## Data Model

### New column on `profiles`

```sql
ALTER TABLE profiles ADD COLUMN is_demo BOOLEAN NOT NULL DEFAULT false;
```

- Real employees: `is_demo = false` (default, backward-compatible)
- Demo employees: `is_demo = true`, no corresponding `auth.users` row
- Demo `id`: server-generated UUID (not linked to auth)
- Demo `email`: `demo-{uuid}@placeholder.local` (satisfies NOT NULL constraint, never used for login)

### No changes to other tables

`schedule_entries`, `time_off_requests`, `shift_swap_requests`, `notifications` — all reference `profiles.id`. Demo employees can be assigned shifts like any other employee. They cannot create requests or receive notifications (no auth session).

---

## Creation Flow

### UI

- **Page:** `/employees`
- **New button:** "Crear empleado demo" next to existing "Invitar empleado"
- **Form fields:** first_name, last_name, position (Select), location (Select), max_hours_per_week (Input, default 40)
- **No email field** — email is auto-generated as `demo-{uuid}@placeholder.local`
- **No invitation sent** — direct insert to `profiles`

### API

- **New route:** `POST /api/employees/demo`
- Auth check: caller must be admin or manager
- Generates UUID, inserts into `profiles` with `is_demo: true`
- Uses admin client (service_role) to bypass RLS (`profiles_insert` policy is `WITH CHECK (false)`)
- Returns `{ success: true, employee_id: string }`

---

## Visual Identification

### In employee tables (`/employees`)

- Yellow `Badge` with text "Demo" next to the employee name
- Filter options: "Todos" (default) / "Solo reales" / "Solo demos"

### In schedule grid (`/schedule`)

- Employee name rendered in italic with reduced opacity (`italic text-muted-foreground/70`)
- Shift cells render normally (same colors) so planners can see the schedule realistically

### In any other list where employees appear

- Badge "Demo" appended to name whenever `is_demo === true`

---

## Conversion: Demo to Real Employee

Two paths available from the employee edit/detail UI:

### Path A: Convert In-Place

Turns a demo into a real employee. Preserves all assigned shifts.

1. Admin opens demo profile, clicks "Convertir a empleado real"
2. Dialog asks for: **email** (required)
3. System flow:
   a. Create auth user via `adminSupabase.auth.admin.inviteUserByEmail(email, { data: { first_name, last_name, role } })`
   b. Get new user ID from response
   c. Update all `schedule_entries` where `employee_id = old_demo_id` → set to `new_user_id`
   d. Update all `employee_secondary_positions` where `employee_id = old_demo_id` → set to `new_user_id`
   e. Delete the old demo profile row
   f. Update the new profile (created by auth trigger) with the demo's data: position_id, location_id, max_hours_per_week, phone, is_demo=false
4. Invitation email is sent automatically by Supabase
5. All previously assigned shifts now belong to the real employee

**API:** `POST /api/employees/demo/convert`
- Body: `{ demo_id: string, email: string }`
- Should be atomic (RPC function or transaction)

### Path B: Transfer Shifts

Moves all shifts from a demo to an existing real employee. Demo is archived.

1. Admin selects demo employee, clicks "Transferir turnos"
2. Dialog shows a Select with all real employees (filtered by same location)
3. On confirm:
   a. Update all `schedule_entries` where `employee_id = demo_id` → set to `target_employee_id`
   b. Set demo profile `is_active = false` (archived, not deleted — preserves audit trail)
4. Toast confirmation with count of transferred entries

**API:** `POST /api/employees/demo/transfer`
- Body: `{ demo_id: string, target_employee_id: string }`

---

## RLS Considerations

- Demo profiles have no `auth.uid()` — they can never authenticate
- Existing `profiles_select` policy allows everyone to read all profiles (needed for schedule views) — no change needed
- `profiles_insert` is `WITH CHECK (false)` — demo creation uses service_role which bypasses RLS
- `profiles_update_admin` allows admin/manager to update any profile — covers demo updates
- No new RLS policies required

---

## Scope Exclusions

- Demos do NOT receive notifications (no auth user)
- Demos do NOT appear in login
- Demos CANNOT create time-off requests or shift swaps
- No "bulk create demos" — one at a time via form
- No "template" system — each demo is a unique profile
- Demos CAN exist in published schedules (no restriction)

---

## Migration

```sql
-- 009_demo_employees.sql
ALTER TABLE profiles ADD COLUMN is_demo BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX idx_profiles_is_demo ON profiles (is_demo) WHERE is_demo = true;
```

## Files to Create/Modify

| Action | File | Purpose |
|--------|------|---------|
| Create | `supabase/migrations/009_demo_employees.sql` | Add `is_demo` column + index |
| Create | `supabase/migrations/010_convert_demo_rpc.sql` | Atomic convert RPC function |
| Create | `src/app/api/employees/demo/route.ts` | Create demo employee |
| Create | `src/app/api/employees/demo/convert/route.ts` | Convert demo → real |
| Create | `src/app/api/employees/demo/transfer/route.ts` | Transfer shifts to real |
| Modify | `src/app/(authenticated)/employees/page.tsx` | Add demo button, badge, filter, convert/transfer dialogs |
| Modify | `src/components/schedule/schedule-calendar-grid.tsx` | Italic + muted style for demo employees |
| Modify | `src/lib/types.ts` | Add `is_demo` to Profile interface |
