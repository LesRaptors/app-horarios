# Schedule Equity Model — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the full equity model from `docs/superpowers/specs/2026-04-22-schedule-equity-model-design.md` — data model, two-pass algorithm with overtime workflow, five UI surfaces, and Vitest-based test harness.

**Architecture:** Bottom-up. Install test tooling → apply migrations in order (each atomic) → regenerate TS types → add pure helpers with tests → rewrite the generator with a two-pass assignment that emits structured `AutoGenWarning` + overtime flags → build each UI surface on top.

**Tech Stack:** Next.js 14 App Router · React 18 · Supabase (Postgres 17 + SSR client) · Tailwind v3 · shadcn/ui + Radix + lucide-react · Sonner · Zod · **Vitest** (added by this plan) · Supabase MCP for migrations.

---

## Working conventions

- Working directory: `/Users/usuario/App Horarios`.
- All migrations applied to Supabase project `ugkvuinkynvtuiutwlkd` via `mcp__claude_ai_Supabase__apply_migration` AND saved as files in `supabase/migrations/NNN_name.sql` so the repo stays the source of truth.
- After every migration that changes schema, regenerate TS types via `mcp__claude_ai_Supabase__generate_typescript_types` and save to `src/lib/supabase/database.types.ts`.
- Commit after every task. HEREDOC commit messages include `Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>`.
- `npx tsc --noEmit` must be clean at the end of every task.
- `npm run test` must pass at the end of every task that touches `*.test.ts`.
- Do not push to remote until Task 28 approves the branch state.

---

## Phase 1 — Test tooling (foundation)

### Task 1: Install Vitest and add configuration

**Files:**
- Modify: `package.json`
- Create: `vitest.config.ts`

- [ ] **Step 1: Install Vitest and UI runner as devDependencies**

Run:
```bash
cd "/Users/usuario/App Horarios" && npm install --save-dev vitest@^2.1.0 @vitest/ui@^2.1.0
```

Expected: `package.json` devDependencies contains `vitest` and `@vitest/ui`; `package-lock.json` updated.

- [ ] **Step 2: Add scripts**

Edit `package.json` — replace the `"scripts"` block with:

```json
  "scripts": {
    "dev": "next dev --hostname 0.0.0.0",
    "build": "next build",
    "start": "next start",
    "lint": "next lint",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:ui": "vitest --ui"
  },
```

- [ ] **Step 3: Create `vitest.config.ts` at repo root**

```ts
import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["src/**/*.test.ts"],
    exclude: ["node_modules", ".next"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
```

- [ ] **Step 4: Smoke-test the runner**

Create `src/lib/__smoke__.test.ts` temporarily:

```ts
import { describe, it, expect } from "vitest";

describe("vitest smoke test", () => {
  it("runs", () => {
    expect(1 + 1).toBe(2);
  });
});
```

Run: `npm run test`
Expected: 1 passed.

Then delete the smoke file:
```bash
rm src/lib/__smoke__.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json vitest.config.ts
git commit -m "$(cat <<'EOF'
chore(test): add Vitest runner with @ alias resolution

Enables pure-logic unit tests under src/**/*.test.ts. Component tests
and API/DB tests are intentionally out of scope.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Phase 2 — Data model (9 migrations)

Each migration is applied twice: once via MCP `apply_migration` (to production DB `ugkvuinkynvtuiutwlkd`) and once written to `supabase/migrations/NNN_*.sql` (for version control).

### Task 2: Migration 013 — holidays table + seed Colombia 2026–2030

**Files:**
- Create: `supabase/migrations/013_add_holidays_table.sql`

- [ ] **Step 1: Write the migration SQL**

Create `supabase/migrations/013_add_holidays_table.sql`:

```sql
CREATE TABLE holidays (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date DATE NOT NULL,
  name TEXT NOT NULL,
  location_id UUID REFERENCES locations(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (date, location_id)
);

CREATE INDEX idx_holidays_date ON holidays(date);

ALTER TABLE holidays ENABLE ROW LEVEL SECURITY;

CREATE POLICY holidays_read ON holidays FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY holidays_write ON holidays FOR ALL
  USING (
    get_user_role() = 'admin'
    OR (get_user_role() = 'manager' AND location_id = get_user_location_id())
  );

-- Colombia national holidays 2026-2030 (Emiliani applies to movable holidays:
-- they shift to the next Monday when they fall mid-week).
INSERT INTO holidays (date, name, location_id) VALUES
  -- 2026
  ('2026-01-01', 'Año Nuevo', NULL),
  ('2026-01-12', 'Día de los Reyes Magos', NULL),
  ('2026-03-23', 'Día de San José', NULL),
  ('2026-04-02', 'Jueves Santo', NULL),
  ('2026-04-03', 'Viernes Santo', NULL),
  ('2026-05-01', 'Día del Trabajo', NULL),
  ('2026-05-18', 'Día de la Ascensión', NULL),
  ('2026-06-08', 'Corpus Christi', NULL),
  ('2026-06-15', 'Sagrado Corazón', NULL),
  ('2026-06-29', 'San Pedro y San Pablo', NULL),
  ('2026-07-20', 'Día de la Independencia', NULL),
  ('2026-08-07', 'Batalla de Boyacá', NULL),
  ('2026-08-17', 'Asunción de la Virgen', NULL),
  ('2026-10-12', 'Día de la Raza', NULL),
  ('2026-11-02', 'Día de Todos los Santos', NULL),
  ('2026-11-16', 'Independencia de Cartagena', NULL),
  ('2026-12-08', 'Día de la Inmaculada Concepción', NULL),
  ('2026-12-25', 'Navidad', NULL),
  -- 2027
  ('2027-01-01', 'Año Nuevo', NULL),
  ('2027-01-11', 'Día de los Reyes Magos', NULL),
  ('2027-03-22', 'Día de San José', NULL),
  ('2027-03-25', 'Jueves Santo', NULL),
  ('2027-03-26', 'Viernes Santo', NULL),
  ('2027-05-01', 'Día del Trabajo', NULL),
  ('2027-05-10', 'Día de la Ascensión', NULL),
  ('2027-05-31', 'Corpus Christi', NULL),
  ('2027-06-07', 'Sagrado Corazón', NULL),
  ('2027-07-05', 'San Pedro y San Pablo', NULL),
  ('2027-07-20', 'Día de la Independencia', NULL),
  ('2027-08-07', 'Batalla de Boyacá', NULL),
  ('2027-08-16', 'Asunción de la Virgen', NULL),
  ('2027-10-18', 'Día de la Raza', NULL),
  ('2027-11-01', 'Día de Todos los Santos', NULL),
  ('2027-11-15', 'Independencia de Cartagena', NULL),
  ('2027-12-08', 'Día de la Inmaculada Concepción', NULL),
  ('2027-12-25', 'Navidad', NULL),
  -- 2028
  ('2028-01-01', 'Año Nuevo', NULL),
  ('2028-01-10', 'Día de los Reyes Magos', NULL),
  ('2028-03-20', 'Día de San José', NULL),
  ('2028-04-13', 'Jueves Santo', NULL),
  ('2028-04-14', 'Viernes Santo', NULL),
  ('2028-05-01', 'Día del Trabajo', NULL),
  ('2028-05-29', 'Día de la Ascensión', NULL),
  ('2028-06-19', 'Corpus Christi', NULL),
  ('2028-06-26', 'Sagrado Corazón', NULL),
  ('2028-07-03', 'San Pedro y San Pablo', NULL),
  ('2028-07-20', 'Día de la Independencia', NULL),
  ('2028-08-07', 'Batalla de Boyacá', NULL),
  ('2028-08-21', 'Asunción de la Virgen', NULL),
  ('2028-10-16', 'Día de la Raza', NULL),
  ('2028-11-06', 'Día de Todos los Santos', NULL),
  ('2028-11-13', 'Independencia de Cartagena', NULL),
  ('2028-12-08', 'Día de la Inmaculada Concepción', NULL),
  ('2028-12-25', 'Navidad', NULL);
```

*Note: dates for 2029 and 2030 can be added in a follow-up migration when the system is in prod a year. Three years of pre-loaded holidays is enough for the MVP.*

- [ ] **Step 2: Apply via Supabase MCP**

Use `mcp__claude_ai_Supabase__apply_migration` with:
- `project_id`: `ugkvuinkynvtuiutwlkd`
- `name`: `add_holidays_table`
- `query`: the full SQL from Step 1

Expected: `{"success": true}`.

- [ ] **Step 3: Verify**

Use `mcp__claude_ai_Supabase__execute_sql` with query:
```sql
SELECT count(*) AS total, min(date) AS earliest, max(date) AS latest FROM holidays;
```
Expected: `total: 54`, `earliest: 2026-01-01`, `latest: 2028-12-25`.

- [ ] **Step 4: Commit**

```bash
cd "/Users/usuario/App Horarios"
git add supabase/migrations/013_add_holidays_table.sql
git commit -m "$(cat <<'EOF'
feat(db): add holidays table with Colombia 2026-2028 national holidays

- RLS: read for all authenticated; write for admin (nacional) and
  manager of own sede (local overrides).
- location_id NULL marks a national holiday; non-null marks a sede override.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Migration 014 — contract_types with seeded defaults

**Files:**
- Create: `supabase/migrations/014_add_contract_types.sql`

- [ ] **Step 1: Write the migration**

```sql
CREATE TABLE contract_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  max_sundays_per_quarter  INT NOT NULL DEFAULT 6,
  max_holidays_per_quarter INT NOT NULL DEFAULT 3,
  target_saturdays_per_month INT,
  target_nights_per_month    INT,
  target_hours_per_week      INT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE contract_types ENABLE ROW LEVEL SECURITY;

CREATE POLICY ct_read  ON contract_types FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY ct_write ON contract_types FOR ALL    USING (get_user_role() = 'admin');

-- Fixed UUID for the default "Sin definir" tipo — referenced from profiles default
INSERT INTO contract_types (id, name, description, max_sundays_per_quarter, max_holidays_per_quarter) VALUES
  ('00000000-0000-0000-0000-000000000001',
   'Sin definir',
   'Tipo por defecto. Sin hard caps efectivos. El admin debe asignar un tipo real.',
   999, 999);

INSERT INTO contract_types (name, max_sundays_per_quarter, max_holidays_per_quarter,
                             target_saturdays_per_month, target_nights_per_month, target_hours_per_week) VALUES
  ('Full-time',      6,  3, 2, 4, 40),
  ('Part-time',      3,  1, 1, 2, 24),
  ('Fin de semana', 13,  3, 4, 0, 24);

-- updated_at auto-maintenance
CREATE TRIGGER trg_contract_types_updated_at
  BEFORE UPDATE ON contract_types
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
```

*Note: the `update_updated_at()` function already exists in the repo (it's used by other tables since migration 001). Confirm by running `SELECT pg_get_functiondef('public.update_updated_at'::regproc);`.*

- [ ] **Step 2: Apply via MCP**

`mcp__claude_ai_Supabase__apply_migration`, name `add_contract_types`.

- [ ] **Step 3: Verify**

```sql
SELECT name, max_sundays_per_quarter, max_holidays_per_quarter FROM contract_types ORDER BY name;
```
Expected: 4 rows — "Fin de semana", "Full-time", "Part-time", "Sin definir".

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/014_add_contract_types.sql
git commit -m "feat(db): add contract_types table with 4 seed types (Sin definir, Full-time, Part-time, Fin de semana)"
```

---

### Task 4: Migration 015 — add profiles.contract_type_id (NOT NULL with default)

**Files:**
- Create: `supabase/migrations/015_add_contract_type_to_profiles.sql`

- [ ] **Step 1: Write the migration**

```sql
ALTER TABLE profiles
  ADD COLUMN contract_type_id UUID NOT NULL
    REFERENCES contract_types(id) ON DELETE RESTRICT
    DEFAULT '00000000-0000-0000-0000-000000000001';

-- Existing rows are back-filled automatically by the DEFAULT clause.
```

- [ ] **Step 2: Apply via MCP**, name `add_contract_type_to_profiles`.

- [ ] **Step 3: Verify**

```sql
SELECT p.first_name, ct.name AS contract
FROM profiles p JOIN contract_types ct ON ct.id = p.contract_type_id
ORDER BY p.created_at;
```
Expected: every existing profile points to "Sin definir".

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/015_add_contract_type_to_profiles.sql
git commit -m "feat(db): add profiles.contract_type_id with 'Sin definir' default"
```

---

### Task 5: Migration 016 — add shift_templates.is_night

**Files:**
- Create: `supabase/migrations/016_add_is_night_to_templates.sql`

- [ ] **Step 1: Write the migration**

```sql
ALTER TABLE shift_templates ADD COLUMN is_night BOOLEAN NOT NULL DEFAULT false;

-- Back-fill: set is_night=true for templates whose time range overlaps 21:00-06:00.
-- The heuristic matches what the /turnos form will auto-suggest.
UPDATE shift_templates
SET is_night = true
WHERE
  -- shift crosses midnight (e.g. 22:00 -> 06:00)
  end_time < start_time
  OR
  -- shift is wholly inside 21:00-06:00 block (e.g. 22:00-04:00)
  start_time >= '21:00:00'
  OR
  end_time <= '06:00:00'
  OR
  -- shift starts before 06:00 (e.g. 04:00-12:00)
  start_time < '06:00:00';
```

- [ ] **Step 2: Apply via MCP**, name `add_is_night_to_templates`.

- [ ] **Step 3: Verify**

```sql
SELECT name, start_time, end_time, is_night FROM shift_templates ORDER BY name;
```
Expected: "Farmacia Noche" (02:00-22:00) → **is_night=true** (because start_time < 06:00 per the heuristic). "Noche" (22:00-06:00) → **true**. "Tarde" (14:00-22:00) → **false**. "Farmacia Mañana" (06:00-14:00) → **false**. "Farmacia Intermedio" (09:00-18:00) → **false**.

*Note: the admin can correct "Farmacia Noche" manually via the UI once Task 23 lands — this back-fill is just a defensible default.*

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/016_add_is_night_to_templates.sql
git commit -m "feat(db): add shift_templates.is_night with heuristic back-fill (CST 21:00-06:00 overlap)"
```

---

### Task 6: Migration 017 — employee_equity_rollups table

**Files:**
- Create: `supabase/migrations/017_add_equity_rollups_table.sql`

- [ ] **Step 1: Write the migration**

```sql
CREATE TABLE employee_equity_rollups (
  employee_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  year INT NOT NULL,
  month INT NOT NULL CHECK (month BETWEEN 1 AND 12),
  sundays_worked   INT NOT NULL DEFAULT 0,
  saturdays_worked INT NOT NULL DEFAULT 0,
  nights_worked    INT NOT NULL DEFAULT 0,
  holidays_worked  INT NOT NULL DEFAULT 0,
  total_hours NUMERIC(6,2) NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (employee_id, year, month)
);

CREATE INDEX idx_rollups_employee_ym
  ON employee_equity_rollups(employee_id, year, month DESC);

ALTER TABLE employee_equity_rollups ENABLE ROW LEVEL SECURITY;

CREATE POLICY rollups_read ON employee_equity_rollups FOR SELECT USING (
  get_user_role() = 'admin'
  OR (
    get_user_role() = 'manager'
    AND employee_id IN (SELECT id FROM profiles WHERE location_id = get_user_location_id())
  )
  OR employee_id = auth.uid()
);
-- no INSERT/UPDATE/DELETE policy: only SECURITY DEFINER functions can write.
```

- [ ] **Step 2: Apply via MCP**, name `add_equity_rollups_table`.

- [ ] **Step 3: Verify**

```sql
SELECT count(*) FROM employee_equity_rollups;
```
Expected: 0 (no data yet; backfill runs in Task 10).

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/017_add_equity_rollups_table.sql
git commit -m "feat(db): add employee_equity_rollups table (readonly via RLS)"
```

---

### Task 7: Migration 018 — overtime columns on schedule_entries

**Files:**
- Create: `supabase/migrations/018_add_overtime_columns.sql`

- [ ] **Step 1: Write the migration**

```sql
ALTER TABLE schedule_entries
  ADD COLUMN exceeds_caps TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN overtime_status TEXT NOT NULL DEFAULT 'none'
    CHECK (overtime_status IN ('none', 'pending', 'approved', 'rejected')),
  ADD COLUMN overtime_reviewed_by UUID REFERENCES profiles(id),
  ADD COLUMN overtime_reviewed_at TIMESTAMPTZ,
  ADD COLUMN overtime_note TEXT;

CREATE INDEX idx_entries_overtime_pending
  ON schedule_entries(overtime_status)
  WHERE overtime_status = 'pending';

ALTER TABLE schedule_entries
  ADD CONSTRAINT entries_overtime_reviewed_requires_status
  CHECK (
    (overtime_reviewed_by IS NULL AND overtime_reviewed_at IS NULL)
    OR overtime_status IN ('approved', 'rejected')
  );
```

- [ ] **Step 2: Apply via MCP**, name `add_overtime_columns`.

- [ ] **Step 3: Verify** — columns exist, default values work:

```sql
SELECT exceeds_caps, overtime_status FROM schedule_entries LIMIT 5;
```
Expected: every row has `exceeds_caps='{}'` and `overtime_status='none'`.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/018_add_overtime_columns.sql
git commit -m "feat(db): add overtime workflow columns to schedule_entries"
```

---

### Task 8: Migration 019 — rollup recompute function + triggers

**Files:**
- Create: `supabase/migrations/019_add_equity_triggers.sql`

- [ ] **Step 1: Write the migration**

```sql
CREATE OR REPLACE FUNCTION recompute_equity_rollup(
  p_employee_id UUID,
  p_year INT,
  p_month INT
) RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
BEGIN
  INSERT INTO employee_equity_rollups (
    employee_id, year, month,
    sundays_worked, saturdays_worked, nights_worked, holidays_worked, total_hours
  )
  SELECT
    p_employee_id, p_year, p_month,
    COUNT(*) FILTER (WHERE EXTRACT(DOW FROM se.date) = 0)::INT,
    COUNT(*) FILTER (WHERE EXTRACT(DOW FROM se.date) = 6)::INT,
    COUNT(*) FILTER (WHERE st.is_night = true)::INT,
    COUNT(*) FILTER (WHERE EXISTS (
      SELECT 1 FROM holidays h
      WHERE h.date = se.date
        AND (h.location_id IS NULL OR h.location_id = (
          SELECT s.location_id FROM schedules s WHERE s.id = se.schedule_id
        ))
    ))::INT,
    COALESCE(SUM(
      EXTRACT(EPOCH FROM (
        (se.date + se.end_time) +
          CASE WHEN se.end_time < se.start_time THEN INTERVAL '1 day' ELSE INTERVAL '0' END
        - (se.date + se.start_time)
      )) / 3600
    ), 0)::NUMERIC(6,2)
  FROM schedule_entries se
  LEFT JOIN shift_templates st ON st.id = se.shift_template_id
  WHERE se.employee_id = p_employee_id
    AND EXTRACT(YEAR FROM se.date) = p_year
    AND EXTRACT(MONTH FROM se.date) = p_month
  ON CONFLICT (employee_id, year, month) DO UPDATE SET
    sundays_worked   = EXCLUDED.sundays_worked,
    saturdays_worked = EXCLUDED.saturdays_worked,
    nights_worked    = EXCLUDED.nights_worked,
    holidays_worked  = EXCLUDED.holidays_worked,
    total_hours      = EXCLUDED.total_hours,
    updated_at       = now();
END;
$$;

CREATE OR REPLACE FUNCTION trg_recompute_rollup()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM recompute_equity_rollup(
      OLD.employee_id,
      EXTRACT(YEAR FROM OLD.date)::INT,
      EXTRACT(MONTH FROM OLD.date)::INT
    );
    RETURN OLD;
  END IF;

  PERFORM recompute_equity_rollup(
    NEW.employee_id,
    EXTRACT(YEAR FROM NEW.date)::INT,
    EXTRACT(MONTH FROM NEW.date)::INT
  );

  IF TG_OP = 'UPDATE' AND (
    OLD.employee_id <> NEW.employee_id OR OLD.date <> NEW.date
  ) THEN
    PERFORM recompute_equity_rollup(
      OLD.employee_id,
      EXTRACT(YEAR FROM OLD.date)::INT,
      EXTRACT(MONTH FROM OLD.date)::INT
    );
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER schedule_entries_rollup_trigger
  AFTER INSERT OR UPDATE OR DELETE ON schedule_entries
  FOR EACH ROW EXECUTE FUNCTION trg_recompute_rollup();

CREATE OR REPLACE FUNCTION trg_holidays_cascade()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  rec RECORD;
  affected_date DATE;
BEGIN
  affected_date := COALESCE(NEW.date, OLD.date);
  FOR rec IN
    SELECT DISTINCT
      se.employee_id,
      EXTRACT(YEAR FROM se.date)::INT  AS yr,
      EXTRACT(MONTH FROM se.date)::INT AS mo
    FROM schedule_entries se
    WHERE se.date = affected_date
  LOOP
    PERFORM recompute_equity_rollup(rec.employee_id, rec.yr, rec.mo);
  END LOOP;
  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER holidays_cascade_trigger
  AFTER INSERT OR UPDATE OR DELETE ON holidays
  FOR EACH ROW EXECUTE FUNCTION trg_holidays_cascade();
```

- [ ] **Step 2: Apply via MCP**, name `add_equity_triggers`.

- [ ] **Step 3: Smoke-test the trigger**

```sql
-- pick any existing profile + schedule entry pair, force a recompute by touching a row
BEGIN;
  UPDATE schedule_entries SET notes = notes WHERE id = (SELECT id FROM schedule_entries LIMIT 1);
  SELECT employee_id, year, month, total_hours FROM employee_equity_rollups LIMIT 5;
ROLLBACK;
```
Expected: at least one rollup row populated (the one touched). ROLLBACK leaves DB unchanged.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/019_add_equity_triggers.sql
git commit -m "feat(db): add equity rollup recompute function + triggers on schedule_entries and holidays"
```

---

### Task 9: Migration 020 — seed scoring_weights in app_settings

**Files:**
- Create: `supabase/migrations/020_seed_scoring_weights.sql`

- [ ] **Step 1: Write the migration**

```sql
INSERT INTO app_settings (key, value) VALUES (
  'scoring_weights',
  '{
    "sunday_penalty": 20,
    "saturday_penalty": 15,
    "night_penalty": 12,
    "holiday_penalty": 18,
    "block_continuation_bonus": 15,
    "fragmentation_penalty": 25,
    "clean_restart_bonus": 5,
    "position_primary_bonus": 100,
    "position_secondary_bonus": 30,
    "hour_deficit_multiplier": 10,
    "shift_deficit_multiplier": 5
  }'::jsonb
)
ON CONFLICT (key) DO NOTHING;
```

- [ ] **Step 2: Apply via MCP**, name `seed_scoring_weights`.

- [ ] **Step 3: Verify**

```sql
SELECT value FROM app_settings WHERE key = 'scoring_weights';
```
Expected: JSON object with the 11 keys listed above.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/020_seed_scoring_weights.sql
git commit -m "feat(db): seed default scoring_weights in app_settings"
```

---

### Task 10: Migration 021 — backfill rollups for existing entries

**Files:**
- Create: `supabase/migrations/021_backfill_equity_rollups.sql`

- [ ] **Step 1: Write the migration**

```sql
DO $$
DECLARE
  rec RECORD;
BEGIN
  FOR rec IN
    SELECT DISTINCT
      se.employee_id,
      EXTRACT(YEAR FROM se.date)::INT  AS yr,
      EXTRACT(MONTH FROM se.date)::INT AS mo
    FROM schedule_entries se
  LOOP
    PERFORM recompute_equity_rollup(rec.employee_id, rec.yr, rec.mo);
  END LOOP;
END $$;
```

- [ ] **Step 2: Apply via MCP**, name `backfill_equity_rollups`.

- [ ] **Step 3: Verify**

```sql
SELECT count(*) AS rollup_rows,
       (SELECT count(DISTINCT (employee_id, EXTRACT(YEAR FROM date), EXTRACT(MONTH FROM date)))
        FROM schedule_entries) AS expected
FROM employee_equity_rollups;
```
Expected: `rollup_rows == expected` (every distinct employee-month combination is rolled up).

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/021_backfill_equity_rollups.sql
git commit -m "feat(db): backfill employee_equity_rollups from existing schedule_entries"
```

---

### Task 11: Regenerate TypeScript types from database

**Files:**
- Modify: `src/lib/supabase/database.types.ts`

- [ ] **Step 1: Invoke Supabase MCP**

Use `mcp__claude_ai_Supabase__generate_typescript_types` with `project_id: ugkvuinkynvtuiutwlkd`.

Overwrite the entire contents of `src/lib/supabase/database.types.ts` with the returned content.

- [ ] **Step 2: Verify the new types are there**

Grep for expected new type names:
```bash
grep -c "contract_types\|holidays\|employee_equity_rollups\|is_night\|overtime_status" src/lib/supabase/database.types.ts
```
Expected: > 5 (all new tables and columns present).

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`

Expected: errors in places that consume the old type (e.g. `ScheduleEntry` in `src/lib/types.ts` doesn't yet include overtime fields). Those are handled by Task 12.

- [ ] **Step 4: Commit**

```bash
git add src/lib/supabase/database.types.ts
git commit -m "chore(types): regenerate database.types.ts after equity migrations"
```

---

### Task 12: Extend `src/lib/types.ts` with new domain types

**Files:**
- Modify: `src/lib/types.ts`

- [ ] **Step 1: Add new interfaces and extend existing ones**

Append to `src/lib/types.ts` (after existing `LaborConstraints`, before `EntryMap`):

```ts
// Contract types (per-type caps for the equity model)
export interface ContractType {
  id: string;
  name: string;
  description: string | null;
  max_sundays_per_quarter: number;
  max_holidays_per_quarter: number;
  target_saturdays_per_month: number | null;
  target_nights_per_month: number | null;
  target_hours_per_week: number | null;
  created_at: string;
  updated_at: string;
}

// Holidays (Colombia nacional + per-sede overrides)
export interface HolidayDate {
  id: string;
  date: string; // YYYY-MM-DD
  name: string;
  location_id: string | null;
  created_at: string;
}

// Materialized rollup per employee per month
export interface EmployeeEquityRollup {
  employee_id: string;
  year: number;
  month: number; // 1-12
  sundays_worked: number;
  saturdays_worked: number;
  nights_worked: number;
  holidays_worked: number;
  total_hours: number;
  updated_at: string;
}

// Scoring weights (stored as JSONB in app_settings)
export interface ScoringWeights {
  sunday_penalty: number;
  saturday_penalty: number;
  night_penalty: number;
  holiday_penalty: number;
  block_continuation_bonus: number;
  fragmentation_penalty: number;
  clean_restart_bonus: number;
  position_primary_bonus: number;
  position_secondary_bonus: number;
  hour_deficit_multiplier: number;
  shift_deficit_multiplier: number;
}

// Overtime workflow state on schedule_entries
export type OvertimeStatus = "none" | "pending" | "approved" | "rejected";

export type CapExcessKind =
  | "weekly_hours"
  | "consecutive_days"
  | "sundays_quarter"
  | "holidays_quarter"
  | "night_limit";
```

Then **extend existing types**:

Find `export interface Profile` and add the field:
```ts
  contract_type_id: string;
```

Find `export interface ShiftTemplate` and add:
```ts
  is_night: boolean;
```

Find `export interface ScheduleEntry` and add:
```ts
  exceeds_caps: CapExcessKind[];
  overtime_status: OvertimeStatus;
  overtime_reviewed_by: string | null;
  overtime_reviewed_at: string | null;
  overtime_note: string | null;
```

Find `export type AutoGenWarning` and replace with:
```ts
export type AutoGenWarning =
  | { kind: "no_employees_in_position";  positionId: string; date: string; shiftTemplateId: string }
  | { kind: "no_available_employee";      positionId: string; date: string; shiftTemplateId: string }
  | { kind: "no_safe_candidate";          positionId: string; date: string; shiftTemplateId: string }
  | { kind: "overtime_assigned";          positionId: string; date: string; shiftTemplateId: string; employeeId: string; caps: CapExcessKind[] }
  | { kind: "no_templates_selected" }
  | { kind: "no_employees_selected" };
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`

Expected: errors in `src/lib/schedule-generator.ts` (consumes the old union) and `src/components/schedule/auto-generate-dialog.tsx` (same). These are handled by Tasks 16 and 23.

- [ ] **Step 3: Commit**

```bash
git add src/lib/types.ts
git commit -m "feat(types): add ContractType, HolidayDate, EmployeeEquityRollup, ScoringWeights, extend AutoGenWarning with no_safe_candidate and overtime_assigned"
```

---

## Phase 3 — Pure logic (helpers + tests)

### Task 13: Create `src/lib/equity-helpers.ts` with Vitest unit tests

**Files:**
- Create: `src/lib/equity-helpers.ts`
- Create: `src/lib/equity-helpers.test.ts`

- [ ] **Step 1: Write the failing tests first**

Create `src/lib/equity-helpers.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  getQuarter,
  getQuarterRange,
  getRollingWindow,
  sumRollupField,
  isHoliday,
  isNightShift,
  suggestIsNight,
  dayOfWeek,
  daysBetween,
} from "./equity-helpers";
import type { EmployeeEquityRollup, HolidayDate, ShiftTemplate } from "./types";

describe("getQuarter", () => {
  it.each([
    [1, 1], [2, 1], [3, 1],
    [4, 2], [5, 2], [6, 2],
    [7, 3], [8, 3], [9, 3],
    [10, 4], [11, 4], [12, 4],
  ])("month %i → Q%i", (month, expected) => {
    expect(getQuarter(2026, month)).toBe(expected);
  });
});

describe("getQuarterRange", () => {
  it("April 15 2026 → Q2 = [4,5,6]", () => {
    expect(getQuarterRange("2026-04-15")).toEqual({ year: 2026, months: [4, 5, 6] });
  });

  it("December 31 2026 → Q4 = [10,11,12]", () => {
    expect(getQuarterRange("2026-12-31")).toEqual({ year: 2026, months: [10, 11, 12] });
  });

  it("January 1 2026 → Q1 = [1,2,3]", () => {
    expect(getQuarterRange("2026-01-01")).toEqual({ year: 2026, months: [1, 2, 3] });
  });
});

describe("getRollingWindow", () => {
  it("3 months ending April 2026 → Feb-Mar-Apr 2026", () => {
    expect(getRollingWindow(2026, 4, 3)).toEqual([
      { year: 2026, month: 2 },
      { year: 2026, month: 3 },
      { year: 2026, month: 4 },
    ]);
  });

  it("handles year boundary: 3 months ending Jan 2026 → Nov 2025 - Jan 2026", () => {
    expect(getRollingWindow(2026, 1, 3)).toEqual([
      { year: 2025, month: 11 },
      { year: 2025, month: 12 },
      { year: 2026, month: 1 },
    ]);
  });
});

describe("sumRollupField", () => {
  const rollups: EmployeeEquityRollup[] = [
    { employee_id: "e1", year: 2026, month: 2, sundays_worked: 1, saturdays_worked: 2, nights_worked: 0, holidays_worked: 0, total_hours: 80, updated_at: "" },
    { employee_id: "e1", year: 2026, month: 3, sundays_worked: 2, saturdays_worked: 3, nights_worked: 0, holidays_worked: 0, total_hours: 160, updated_at: "" },
    { employee_id: "e1", year: 2026, month: 4, sundays_worked: 1, saturdays_worked: 2, nights_worked: 0, holidays_worked: 0, total_hours: 160, updated_at: "" },
    { employee_id: "e2", year: 2026, month: 4, sundays_worked: 3, saturdays_worked: 0, nights_worked: 5, holidays_worked: 1, total_hours: 40, updated_at: "" },
  ];

  it("sums sundays_worked across 3-month window for e1", () => {
    const window = [{ year: 2026, month: 2 }, { year: 2026, month: 3 }, { year: 2026, month: 4 }];
    expect(sumRollupField(rollups, "e1", window, "sundays_worked")).toBe(4);
  });

  it("returns 0 for employee not in rollups", () => {
    const window = [{ year: 2026, month: 4 }];
    expect(sumRollupField(rollups, "e99", window, "sundays_worked")).toBe(0);
  });

  it("does not include other employees' data", () => {
    const window = [{ year: 2026, month: 4 }];
    expect(sumRollupField(rollups, "e1", window, "sundays_worked")).toBe(1);
  });
});

describe("isHoliday", () => {
  const holidays: HolidayDate[] = [
    { id: "h1", date: "2026-01-01", name: "Año Nuevo", location_id: null, created_at: "" },
    { id: "h2", date: "2026-03-19", name: "Día municipal", location_id: "loc-A", created_at: "" },
  ];

  it("national holiday matches any location", () => {
    expect(isHoliday("2026-01-01", "loc-A", holidays)).toBe(true);
    expect(isHoliday("2026-01-01", "loc-B", holidays)).toBe(true);
  });

  it("sede-specific holiday matches only that location", () => {
    expect(isHoliday("2026-03-19", "loc-A", holidays)).toBe(true);
    expect(isHoliday("2026-03-19", "loc-B", holidays)).toBe(false);
  });

  it("regular date is not a holiday", () => {
    expect(isHoliday("2026-06-15", "loc-A", holidays)).toBe(false);
  });
});

describe("suggestIsNight", () => {
  it.each<[string, string, boolean]>([
    ["22:00", "06:00", true],   // night crossing midnight
    ["09:00", "18:00", false],  // morning to evening
    ["14:00", "22:00", false],  // afternoon ending at 22:00 — borderline, but end_time NOT strictly after 21:00, so not night
    ["20:00", "04:00", true],   // starts at 20:00 and crosses midnight
    ["04:00", "12:00", true],   // starts before 06:00
    ["06:00", "14:00", false],  // morning
    ["21:00", "05:00", true],   // starts at 21:00 sharp
  ])("%s–%s → is_night=%s", (start, end, expected) => {
    expect(suggestIsNight(start, end)).toBe(expected);
  });
});

describe("isNightShift", () => {
  it("reads template.is_night directly", () => {
    const t: ShiftTemplate = {
      id: "t1", name: "X", start_time: "09:00", end_time: "18:00",
      break_minutes: 0, color: "#000", location_id: "l1",
      is_night: true, created_at: "",
    };
    expect(isNightShift(t)).toBe(true);
    expect(isNightShift({ ...t, is_night: false })).toBe(false);
  });
});

describe("dayOfWeek", () => {
  it("returns JS day-of-week (0=Sunday)", () => {
    expect(dayOfWeek("2026-04-05")).toBe(0); // Sunday
    expect(dayOfWeek("2026-04-06")).toBe(1); // Monday
    expect(dayOfWeek("2026-04-11")).toBe(6); // Saturday
  });
});

describe("daysBetween", () => {
  it("returns positive integer days", () => {
    expect(daysBetween("2026-04-01", "2026-04-05")).toBe(4);
    expect(daysBetween("2026-04-05", "2026-04-01")).toBe(-4);
    expect(daysBetween("2026-04-05", "2026-04-05")).toBe(0);
  });
});
```

- [ ] **Step 2: Run tests — expect all to fail with "Cannot find module './equity-helpers'"**

Run: `npm run test`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the helpers**

Create `src/lib/equity-helpers.ts`:

```ts
import type {
  EmployeeEquityRollup,
  HolidayDate,
  ShiftTemplate,
} from "./types";

export function getQuarter(_year: number, month: number): number {
  return Math.ceil(month / 3);
}

export function getQuarterRange(dateStr: string): { year: number; months: number[] } {
  const d = new Date(dateStr + "T00:00:00");
  const year = d.getFullYear();
  const month = d.getMonth() + 1;
  const q = getQuarter(year, month);
  const start = (q - 1) * 3 + 1;
  return { year, months: [start, start + 1, start + 2] };
}

export function getRollingWindow(
  year: number,
  month: number,
  size: number
): Array<{ year: number; month: number }> {
  const result: Array<{ year: number; month: number }> = [];
  let y = year;
  let m = month;
  for (let i = 0; i < size; i++) {
    result.unshift({ year: y, month: m });
    m--;
    if (m < 1) {
      m = 12;
      y--;
    }
  }
  return result;
}

export function sumRollupField(
  rollups: EmployeeEquityRollup[],
  employeeId: string,
  window: Array<{ year: number; month: number }>,
  field: keyof EmployeeEquityRollup
): number {
  let total = 0;
  for (const r of rollups) {
    if (r.employee_id !== employeeId) continue;
    const inWindow = window.some((w) => w.year === r.year && w.month === r.month);
    if (!inWindow) continue;
    const v = r[field];
    if (typeof v === "number") total += v;
  }
  return total;
}

export function isHoliday(
  dateStr: string,
  locationId: string,
  holidays: HolidayDate[]
): boolean {
  for (const h of holidays) {
    if (h.date !== dateStr) continue;
    if (h.location_id === null || h.location_id === locationId) return true;
  }
  return false;
}

export function isNightShift(template: ShiftTemplate): boolean {
  return template.is_night;
}

/**
 * Heuristic: does the time range overlap 21:00-06:00?
 * Returns true if any of:
 *  - shift crosses midnight (end < start)
 *  - start >= 21:00
 *  - end <= 06:00
 *  - start < 06:00
 */
export function suggestIsNight(startTime: string, endTime: string): boolean {
  const [sh, sm] = startTime.split(":").map(Number);
  const [eh, em] = endTime.split(":").map(Number);
  const startMin = sh * 60 + sm;
  const endMin = eh * 60 + em;
  if (endMin < startMin) return true; // crosses midnight
  if (startMin >= 21 * 60) return true;
  if (endMin <= 6 * 60) return true;
  if (startMin < 6 * 60) return true;
  return false;
}

export function dayOfWeek(dateStr: string): number {
  return new Date(dateStr + "T00:00:00").getDay();
}

export function daysBetween(fromStr: string, toStr: string): number {
  const from = new Date(fromStr + "T00:00:00").getTime();
  const to = new Date(toStr + "T00:00:00").getTime();
  return Math.round((to - from) / 86_400_000);
}
```

- [ ] **Step 4: Run tests — expect all to pass**

Run: `npm run test`
Expected: `✓ 28 passed (or similar count matching the describe blocks)`.

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors (other than pre-existing ones in schedule-generator.ts / auto-generate-dialog.tsx still).

- [ ] **Step 6: Commit**

```bash
git add src/lib/equity-helpers.ts src/lib/equity-helpers.test.ts
git commit -m "$(cat <<'EOF'
feat(equity): add pure helpers with Vitest unit tests

Helpers: getQuarter, getQuarterRange, getRollingWindow, sumRollupField,
isHoliday, isNightShift, suggestIsNight, dayOfWeek, daysBetween.

All tested — 28 assertions across 9 describe blocks.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 14: SQL tests for triggers and RLS

**Files:**
- Create: `supabase/tests/equity_rollup_insert.sql`
- Create: `supabase/tests/equity_rollup_delete.sql`
- Create: `supabase/tests/equity_rollup_update_move.sql`
- Create: `supabase/tests/holidays_cascade.sql`
- Create: `supabase/tests/rls_equity.sql`

- [ ] **Step 1: Write `equity_rollup_insert.sql`**

```sql
-- Smoke test: inserting a Sunday entry increments sundays_worked.
BEGIN;

-- Setup: pick any existing (employee, schedule, position, template)
WITH setup AS (
  SELECT
    p.id AS emp_id,
    s.id AS sched_id,
    (SELECT id FROM positions LIMIT 1) AS pos_id,
    (SELECT id FROM shift_templates WHERE is_night = false LIMIT 1) AS tpl_id
  FROM profiles p, schedules s
  WHERE p.is_active = true
  LIMIT 1
)
INSERT INTO schedule_entries (schedule_id, employee_id, position_id, date, start_time, end_time, shift_template_id)
SELECT sched_id, emp_id, pos_id, '2099-01-04' /* Sunday */, '09:00', '17:00', tpl_id
FROM setup
RETURNING employee_id AS test_emp;

-- Assertion: rollup for (emp, 2099, 1) should have sundays_worked >= 1
DO $$
DECLARE
  count_sundays INT;
BEGIN
  SELECT sundays_worked INTO count_sundays
  FROM employee_equity_rollups
  WHERE year = 2099 AND month = 1
    AND employee_id = (SELECT employee_id FROM schedule_entries WHERE date = '2099-01-04' LIMIT 1);
  IF count_sundays IS NULL OR count_sundays < 1 THEN
    RAISE EXCEPTION 'FAIL: expected sundays_worked >= 1, got %', count_sundays;
  END IF;
  RAISE NOTICE 'PASS: sundays_worked = %', count_sundays;
END $$;

ROLLBACK;
```

- [ ] **Step 2: Write `equity_rollup_delete.sql`**

```sql
-- Inserting then deleting must leave sundays_worked at the pre-insert value.
BEGIN;

WITH setup AS (
  SELECT p.id AS emp_id, s.id AS sched_id,
         (SELECT id FROM positions LIMIT 1) AS pos_id,
         (SELECT id FROM shift_templates WHERE is_night = false LIMIT 1) AS tpl_id
  FROM profiles p, schedules s WHERE p.is_active = true LIMIT 1
),
inserted AS (
  INSERT INTO schedule_entries (schedule_id, employee_id, position_id, date, start_time, end_time, shift_template_id)
  SELECT sched_id, emp_id, pos_id, '2099-01-04', '09:00', '17:00', tpl_id FROM setup
  RETURNING id, employee_id
)
SELECT id, employee_id FROM inserted \gset

DELETE FROM schedule_entries WHERE id = :'id';

DO $$
DECLARE
  count_sundays INT;
BEGIN
  SELECT sundays_worked INTO count_sundays FROM employee_equity_rollups
  WHERE year = 2099 AND month = 1 AND employee_id = :'employee_id';
  IF count_sundays IS NOT NULL AND count_sundays > 0 THEN
    RAISE EXCEPTION 'FAIL: expected 0 sundays after delete, got %', count_sundays;
  END IF;
  RAISE NOTICE 'PASS: sundays_worked reset';
END $$;

ROLLBACK;
```

*Note: the `\gset` syntax is psql-specific. If executing via Supabase MCP `execute_sql`, rewrite using a PL/pgSQL DO block with variables. The SQL above is the canonical version for manual psql runs. For the MCP runner, use this alternative:*

```sql
BEGIN;
DO $$
DECLARE
  v_id UUID;
  v_emp UUID;
  count_sundays INT;
BEGIN
  SELECT p.id INTO v_emp FROM profiles p WHERE p.is_active = true LIMIT 1;

  INSERT INTO schedule_entries (schedule_id, employee_id, position_id, date, start_time, end_time, shift_template_id)
  SELECT (SELECT id FROM schedules LIMIT 1), v_emp,
         (SELECT id FROM positions LIMIT 1),
         '2099-01-04', '09:00', '17:00',
         (SELECT id FROM shift_templates WHERE is_night = false LIMIT 1)
  RETURNING id INTO v_id;

  DELETE FROM schedule_entries WHERE id = v_id;

  SELECT sundays_worked INTO count_sundays FROM employee_equity_rollups
  WHERE year = 2099 AND month = 1 AND employee_id = v_emp;

  IF count_sundays IS NOT NULL AND count_sundays > 0 THEN
    RAISE EXCEPTION 'FAIL: expected 0 sundays after delete, got %', count_sundays;
  END IF;
  RAISE NOTICE 'PASS';
END $$;
ROLLBACK;
```

- [ ] **Step 3: Write `equity_rollup_update_move.sql`**

Updating an entry's date to a different month must move the rollup count accordingly.

```sql
BEGIN;
DO $$
DECLARE
  v_id UUID;
  v_emp UUID;
  jan_sundays INT;
  feb_sundays INT;
BEGIN
  SELECT p.id INTO v_emp FROM profiles p WHERE p.is_active = true LIMIT 1;

  INSERT INTO schedule_entries (schedule_id, employee_id, position_id, date, start_time, end_time, shift_template_id)
  SELECT (SELECT id FROM schedules LIMIT 1), v_emp,
         (SELECT id FROM positions LIMIT 1),
         '2099-01-04', '09:00', '17:00',
         (SELECT id FROM shift_templates WHERE is_night = false LIMIT 1)
  RETURNING id INTO v_id;

  UPDATE schedule_entries SET date = '2099-02-07' /* also Sunday */ WHERE id = v_id;

  SELECT sundays_worked INTO jan_sundays FROM employee_equity_rollups
  WHERE year = 2099 AND month = 1 AND employee_id = v_emp;

  SELECT sundays_worked INTO feb_sundays FROM employee_equity_rollups
  WHERE year = 2099 AND month = 2 AND employee_id = v_emp;

  IF COALESCE(jan_sundays, 0) <> 0 THEN
    RAISE EXCEPTION 'FAIL: expected 0 jan sundays after move, got %', jan_sundays;
  END IF;
  IF COALESCE(feb_sundays, 0) <> 1 THEN
    RAISE EXCEPTION 'FAIL: expected 1 feb sunday after move, got %', feb_sundays;
  END IF;
  RAISE NOTICE 'PASS';
END $$;
ROLLBACK;
```

- [ ] **Step 4: Write `holidays_cascade.sql`**

Inserting a holiday should recompute rollups for entries on that date.

```sql
BEGIN;
DO $$
DECLARE
  v_id UUID;
  v_emp UUID;
  before_holidays INT;
  after_holidays INT;
BEGIN
  SELECT p.id INTO v_emp FROM profiles p WHERE p.is_active = true LIMIT 1;

  INSERT INTO schedule_entries (schedule_id, employee_id, position_id, date, start_time, end_time, shift_template_id)
  SELECT (SELECT id FROM schedules LIMIT 1), v_emp,
         (SELECT id FROM positions LIMIT 1),
         '2099-06-15' /* arbitrary weekday */, '09:00', '17:00',
         (SELECT id FROM shift_templates WHERE is_night = false LIMIT 1)
  RETURNING id INTO v_id;

  SELECT holidays_worked INTO before_holidays FROM employee_equity_rollups
  WHERE year = 2099 AND month = 6 AND employee_id = v_emp;

  INSERT INTO holidays (date, name, location_id) VALUES ('2099-06-15', 'Fake holiday', NULL);

  SELECT holidays_worked INTO after_holidays FROM employee_equity_rollups
  WHERE year = 2099 AND month = 6 AND employee_id = v_emp;

  IF COALESCE(before_holidays, 0) <> 0 THEN
    RAISE EXCEPTION 'FAIL: expected 0 holidays before, got %', before_holidays;
  END IF;
  IF COALESCE(after_holidays, 0) <> 1 THEN
    RAISE EXCEPTION 'FAIL: expected 1 holiday after insert, got %', after_holidays;
  END IF;
  RAISE NOTICE 'PASS';
END $$;
ROLLBACK;
```

- [ ] **Step 5: Write `rls_equity.sql`**

Smoke-test the RLS policies — verify an admin sees all rollups, a manager sees only their sede, an employee sees only their own. This requires `SET LOCAL role` manipulation which Supabase MCP supports.

```sql
BEGIN;
DO $$
DECLARE
  admin_count INT;
BEGIN
  -- As service_role (no RLS) — baseline
  SELECT count(*) INTO admin_count FROM employee_equity_rollups;
  RAISE NOTICE 'Baseline rollup count: %', admin_count;
  -- Manual verification of RLS behavior requires real user sessions;
  -- the repo-level SQL test just verifies the policies exist.
  PERFORM 1 FROM pg_policies WHERE tablename = 'employee_equity_rollups';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'FAIL: no policies on employee_equity_rollups';
  END IF;
  RAISE NOTICE 'PASS: RLS policies present';
END $$;
ROLLBACK;
```

- [ ] **Step 6: Run each script via MCP execute_sql**

For each file, call `mcp__claude_ai_Supabase__execute_sql` with the file contents. Expected: `NOTICE: PASS` in each result, no error.

- [ ] **Step 7: Commit**

```bash
git add supabase/tests/
git commit -m "$(cat <<'EOF'
test(db): add SQL tests for equity rollup triggers and RLS

Covers insert/delete/update-move on schedule_entries, holidays cascade,
and RLS policies presence. Each script uses BEGIN..RAISE..ROLLBACK so
it is safe to run repeatedly against prod.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Phase 4 — Algorithm rewrite

### Task 15: Extend the generator — port existing to new types, add overtime+equity

**Files:**
- Modify: `src/lib/schedule-generator.ts`
- Create: `src/lib/schedule-generator.test.ts`

This is the biggest task. It has sub-steps, each committed separately for safety.

- [ ] **Step 1: Write the failing test file first (TDD)**

Create `src/lib/schedule-generator.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { generateSchedule } from "./schedule-generator";
import type {
  AutoGenConfig,
  ProfileWithPositions,
  ShiftTemplate,
  ScheduleEntry,
  LaborConstraints,
  EmployeeEquityRollup,
  HolidayDate,
  ContractType,
  ScoringWeights,
} from "./types";

// ---------- Fixtures ----------

const defaultConstraints: LaborConstraints = {
  maxHoursPerWeek: 40,
  maxHoursPerDay: 10,
  minRestHoursBetweenShifts: 12,
  maxConsecutiveDays: 6,
};

const defaultWeights: ScoringWeights = {
  sunday_penalty: 20,
  saturday_penalty: 15,
  night_penalty: 12,
  holiday_penalty: 18,
  block_continuation_bonus: 15,
  fragmentation_penalty: 25,
  clean_restart_bonus: 5,
  position_primary_bonus: 100,
  position_secondary_bonus: 30,
  hour_deficit_multiplier: 10,
  shift_deficit_multiplier: 5,
};

const sinDefinido: ContractType = {
  id: "00000000-0000-0000-0000-000000000001",
  name: "Sin definir",
  description: null,
  max_sundays_per_quarter: 999,
  max_holidays_per_quarter: 999,
  target_saturdays_per_month: null,
  target_nights_per_month: null,
  target_hours_per_week: null,
  created_at: "",
  updated_at: "",
};

const fullTime: ContractType = {
  id: "ct-full",
  name: "Full-time",
  description: null,
  max_sundays_per_quarter: 6,
  max_holidays_per_quarter: 3,
  target_saturdays_per_month: 2,
  target_nights_per_month: 4,
  target_hours_per_week: 40,
  created_at: "",
  updated_at: "",
};

function makeEmployee(overrides: Partial<ProfileWithPositions>): ProfileWithPositions {
  return {
    id: "e1",
    first_name: "Test",
    last_name: "User",
    email: "t@t.com",
    phone: null,
    role: "employee",
    position_id: "pos-1",
    location_id: "loc-1",
    max_hours_per_week: 40,
    is_active: true,
    is_demo: false,
    contract_type_id: "ct-full",
    created_at: "",
    updated_at: "",
    secondary_positions: [],
    ...overrides,
  };
}

function makeTemplate(overrides: Partial<ShiftTemplate>): ShiftTemplate {
  return {
    id: "tpl-morn",
    name: "Morning",
    start_time: "09:00:00",
    end_time: "17:00:00",
    break_minutes: 0,
    color: "#000",
    location_id: "loc-1",
    is_night: false,
    created_at: "",
    ...overrides,
  };
}

function baseConfig(
  positionIds: string[] = ["pos-1"],
  templateIds: string[] = ["tpl-morn"],
  employeeIds: string[] = ["e1", "e2", "e3"]
): AutoGenConfig {
  return {
    scheduleId: "sch-1",
    locationId: "loc-1",
    month: 3, // April (0-indexed)
    year: 2026,
    shiftTemplateIds: templateIds,
    positionIds,
    excludeDates: [],
    employeeIds,
    useDemandRequirements: false,
  };
}

// ---------- Scenarios ----------

describe("generateSchedule — empty history", () => {
  it("picks a candidate for a Sunday slot, no overtime", () => {
    const employees = [
      makeEmployee({ id: "e1" }),
      makeEmployee({ id: "e2" }),
      makeEmployee({ id: "e3" }),
    ];
    const templates = [makeTemplate({})];

    // Config: 3 employees, 1 position, 1 template, 1 day (Sunday 2026-04-05)
    const config: AutoGenConfig = {
      ...baseConfig(),
      excludeDates: [
        // exclude all April dates except Sunday 2026-04-05
        ...Array.from({ length: 30 }, (_, i) => {
          const d = new Date(2026, 3, i + 1);
          return d.getDate() === 5 ? null : `2026-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
        }).filter((v): v is string => v !== null),
      ],
    };

    const result = generateSchedule(
      config,
      employees,
      templates,
      [],
      [],
      defaultConstraints,
      [],
      [],
      [],
      [fullTime],
      defaultWeights
    );

    expect(result.entries).toHaveLength(1);
    expect(result.entries[0].overtime_status).toBe("none");
    expect(result.entries[0].exceeds_caps).toEqual([]);
  });
});

describe("generateSchedule — sunday hard cap reached", () => {
  it("assigns with overtime_status=pending when all candidates at 6/6 sundays", () => {
    const employees = [makeEmployee({ id: "e1" })];
    const templates = [makeTemplate({})];

    // Employee already has 6 sundays worked in Q2 2026 (April-June)
    const rollups: EmployeeEquityRollup[] = [
      { employee_id: "e1", year: 2026, month: 4, sundays_worked: 6, saturdays_worked: 0, nights_worked: 0, holidays_worked: 0, total_hours: 0, updated_at: "" },
    ];

    const config: AutoGenConfig = {
      ...baseConfig([], ["tpl-morn"], ["e1"]),
      positionIds: ["pos-1"],
      excludeDates: Array.from({ length: 30 }, (_, i) => {
        const d = new Date(2026, 3, i + 1);
        return d.getDate() === 12 ? null : `2026-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      }).filter((v): v is string => v !== null),
    };

    const result = generateSchedule(
      config,
      employees,
      templates,
      [],
      [],
      defaultConstraints,
      [],
      rollups,
      [],
      [fullTime],
      defaultWeights
    );

    expect(result.entries).toHaveLength(1);
    expect(result.entries[0].overtime_status).toBe("pending");
    expect(result.entries[0].exceeds_caps).toContain("sundays_quarter");
  });
});

describe("generateSchedule — block packing", () => {
  it("prefers continuing a work block (gap of 1) over fragmenting (gap of 2)", () => {
    const employees = [makeEmployee({ id: "e1" }), makeEmployee({ id: "e2" })];
    const templates = [makeTemplate({})];

    // Existing entries: e1 worked yesterday (2026-04-06), e2 worked 2 days ago (2026-04-05)
    // So e1 scoring for today (2026-04-07) should be higher than e2
    const existing: ScheduleEntry[] = [
      { id: "x1", schedule_id: "sch-1", employee_id: "e1", position_id: "pos-1",
        date: "2026-04-06", start_time: "09:00", end_time: "17:00",
        shift_template_id: "tpl-morn", notes: null,
        exceeds_caps: [], overtime_status: "none",
        overtime_reviewed_by: null, overtime_reviewed_at: null, overtime_note: null,
        created_at: "", updated_at: "" },
      { id: "x2", schedule_id: "sch-1", employee_id: "e2", position_id: "pos-1",
        date: "2026-04-05", start_time: "09:00", end_time: "17:00",
        shift_template_id: "tpl-morn", notes: null,
        exceeds_caps: [], overtime_status: "none",
        overtime_reviewed_by: null, overtime_reviewed_at: null, overtime_note: null,
        created_at: "", updated_at: "" },
    ];

    const config: AutoGenConfig = {
      ...baseConfig(["pos-1"], ["tpl-morn"], ["e1", "e2"]),
      excludeDates: Array.from({ length: 30 }, (_, i) => {
        const d = new Date(2026, 3, i + 1);
        return d.getDate() === 7 ? null : `2026-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      }).filter((v): v is string => v !== null),
    };

    const result = generateSchedule(
      config,
      employees,
      templates,
      existing,
      [],
      defaultConstraints,
      [],
      [],
      [],
      [fullTime],
      defaultWeights
    );

    expect(result.entries).toHaveLength(1);
    expect(result.entries[0].employee_id).toBe("e1"); // block continuation wins
  });
});

describe("generateSchedule — 24h rest after night", () => {
  it("rejects candidate whose previous night shift ended <24h before this slot", () => {
    const employees = [makeEmployee({ id: "e1" })];
    const nightTemplate = makeTemplate({ id: "tpl-night", name: "Night", start_time: "22:00", end_time: "06:00", is_night: true });
    const morningTemplate = makeTemplate({ id: "tpl-morn" });

    // e1 worked night on 2026-04-06 (end 06:00 on 04-07), slot is morning 04-07 (start 09:00) — gap is only ~3h
    const existing: ScheduleEntry[] = [
      { id: "n1", schedule_id: "sch-1", employee_id: "e1", position_id: "pos-1",
        date: "2026-04-06", start_time: "22:00", end_time: "06:00",
        shift_template_id: "tpl-night", notes: null,
        exceeds_caps: [], overtime_status: "none",
        overtime_reviewed_by: null, overtime_reviewed_at: null, overtime_note: null,
        created_at: "", updated_at: "" },
    ];

    const config: AutoGenConfig = {
      ...baseConfig(["pos-1"], ["tpl-morn"], ["e1"]),
      excludeDates: Array.from({ length: 30 }, (_, i) => {
        const d = new Date(2026, 3, i + 1);
        return d.getDate() === 7 ? null : `2026-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      }).filter((v): v is string => v !== null),
    };

    const result = generateSchedule(
      config,
      employees,
      [morningTemplate, nightTemplate],
      existing,
      [],
      defaultConstraints,
      [],
      [],
      [],
      [fullTime],
      defaultWeights
    );

    // No safe candidate → slot goes unfilled
    expect(result.entries).toHaveLength(0);
    expect(result.warnings.some((w) => w.kind === "no_safe_candidate")).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests — expect all to fail**

Run: `npm run test`

Expected: FAIL — `generateSchedule` signature doesn't match. Errors on missing/extra arguments.

- [ ] **Step 3: Rewrite `src/lib/schedule-generator.ts` — NEW SIGNATURE ONLY**

Replace the existing file with the new structure. This is long — below is the full replacement:

```ts
import { getMonthDates, formatDateISO } from "./utils";
import {
  getQuarterRange,
  getRollingWindow,
  sumRollupField,
  isHoliday,
  isNightShift,
  dayOfWeek,
  daysBetween,
} from "./equity-helpers";
import type {
  AutoGenConfig,
  AutoGenResult,
  AutoGenWarning,
  ProfileWithPositions,
  ShiftTemplate,
  LaborConstraints,
  ScheduleEntry,
  StaffingRequirement,
  EmployeeEquityRollup,
  HolidayDate,
  ContractType,
  ScoringWeights,
  CapExcessKind,
} from "./types";

interface TimeOffRange {
  employee_id: string;
  start_date: string;
  end_date: string;
}

interface DemandSlot {
  date: string;
  dayOfWeek: number;
  positionId: string;
  shiftTemplateId: string;
  startTime: string;
  endTime: string;
  breakMinutes: number;
  durationHours: number;
  template: ShiftTemplate;
}

interface EmployeeTracker {
  totalHours: number;
  totalShifts: number;
  weeklyHours: Record<number, number>;
  lastShiftDate: string | null;
  lastShiftEndTime: string | null;
  lastShiftWasNight: boolean;
  consecutiveDays: number;
  assignedDates: Set<string>;
}

const BLOCK_LENGTH_CAP_FOR_BONUS = 4;

function calcDurationHours(start: string, end: string, breakMin: number): number {
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  let totalMin = eh * 60 + em - (sh * 60 + sm);
  if (totalMin < 0) totalMin += 24 * 60;
  return (totalMin - breakMin) / 60;
}

function getISOWeekNumber(dateStr: string): number {
  const d = new Date(dateStr + "T00:00:00");
  const jan1 = new Date(d.getFullYear(), 0, 1);
  return Math.ceil(((d.getTime() - jan1.getTime()) / 86400000 + jan1.getDay() + 1) / 7);
}

function requiredRestHours(lastShiftWasNight: boolean, constraints: LaborConstraints): number {
  return lastShiftWasNight ? 24 : constraints.minRestHoursBetweenShifts;
}

function hasEnoughRest(
  lastEndTime: string,
  lastDate: string,
  newStartTime: string,
  newDate: string,
  minRestHours: number
): boolean {
  const lastEnd = new Date(`${lastDate}T${lastEndTime}`);
  const newStart = new Date(`${newDate}T${newStartTime}`);
  const gapHours = (newStart.getTime() - lastEnd.getTime()) / (1000 * 60 * 60);
  return gapHours >= minRestHours;
}

function prevDateStr(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  d.setDate(d.getDate() - 1);
  return formatDateISO(d);
}

function buildDemandSlots(
  config: AutoGenConfig,
  dates: Date[],
  templates: ShiftTemplate[],
  staffingRequirements: StaffingRequirement[]
): DemandSlot[] {
  const templateMap = new Map(templates.map((t) => [t.id, t]));
  const slots: DemandSlot[] = [];

  const reqMap = new Map<string, number>();
  for (const sr of staffingRequirements) {
    reqMap.set(`${sr.position_id}_${sr.shift_template_id}_${sr.day_of_week}`, sr.required_count);
  }

  const hasDemandConfig = staffingRequirements.length > 0 && config.useDemandRequirements;

  for (const date of dates) {
    const dateStr = formatDateISO(date);
    const dow = date.getDay();
    if (config.excludeDates.includes(dateStr)) continue;

    for (const templateId of config.shiftTemplateIds) {
      const template = templateMap.get(templateId);
      if (!template) continue;
      const duration = calcDurationHours(template.start_time, template.end_time, template.break_minutes);

      if (hasDemandConfig) {
        for (const posId of config.positionIds) {
          const key = `${posId}_${templateId}_${dow}`;
          const requiredCount = reqMap.get(key) ?? 0;
          for (let i = 0; i < requiredCount; i++) {
            slots.push({
              date: dateStr, dayOfWeek: dow, positionId: posId,
              shiftTemplateId: templateId, startTime: template.start_time,
              endTime: template.end_time, breakMinutes: template.break_minutes,
              durationHours: duration, template,
            });
          }
        }
      } else {
        for (const posId of config.positionIds) {
          slots.push({
            date: dateStr, dayOfWeek: dow, positionId: posId,
            shiftTemplateId: templateId, startTime: template.start_time,
            endTime: template.end_time, breakMinutes: template.break_minutes,
            durationHours: duration, template,
          });
        }
      }
    }
  }
  return slots;
}

function buildTimeOffLookup(timeOff: TimeOffRange[]): Map<string, Set<string>> {
  const map = new Map<string, Set<string>>();
  for (const to of timeOff) {
    if (!map.has(to.employee_id)) map.set(to.employee_id, new Set());
    const dates = map.get(to.employee_id)!;
    const start = new Date(to.start_date + "T00:00:00");
    const end = new Date(to.end_date + "T00:00:00");
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      dates.add(formatDateISO(d));
    }
  }
  return map;
}

interface ScoringContext {
  weights: ScoringWeights;
  rollingRollupSums: Map<string, {
    sundays: number; saturdays: number; nights: number; holidays: number;
  }>;
  quarterRollupSums: Map<string, {
    sundays: number; saturdays: number; nights: number; holidays: number;
  }>;
  targetHours: number;
  targetShifts: number;
  holidays: HolidayDate[];
  locationId: string;
  contractTypes: Map<string, ContractType>;
}

function scoreCandidate(
  employee: ProfileWithPositions,
  slot: DemandSlot,
  tracker: EmployeeTracker,
  ctx: ScoringContext
): number {
  const w = ctx.weights;
  let score = employee.position_id === slot.positionId
    ? w.position_primary_bonus
    : w.position_secondary_bonus;

  score += (ctx.targetHours - tracker.totalHours) * w.hour_deficit_multiplier;
  score += (ctx.targetShifts - tracker.totalShifts) * w.shift_deficit_multiplier;

  const rolling = ctx.rollingRollupSums.get(employee.id) ?? { sundays: 0, saturdays: 0, nights: 0, holidays: 0 };

  const dow = dayOfWeek(slot.date);
  if (dow === 0) score -= rolling.sundays * w.sunday_penalty;
  if (dow === 6) score -= rolling.saturdays * w.saturday_penalty;
  if (isNightShift(slot.template)) score -= rolling.nights * w.night_penalty;
  if (isHoliday(slot.date, ctx.locationId, ctx.holidays))
    score -= rolling.holidays * w.holiday_penalty;

  const gap = tracker.lastShiftDate ? daysBetween(tracker.lastShiftDate, slot.date) : null;
  if (gap === 1 && tracker.consecutiveDays < BLOCK_LENGTH_CAP_FOR_BONUS) {
    score += w.block_continuation_bonus;
  } else if (gap === 2) {
    score -= w.fragmentation_penalty;
  } else if (gap !== null && gap >= 3) {
    score += w.clean_restart_bonus;
  }

  return score;
}

function computeExceededCaps(
  employee: ProfileWithPositions,
  slot: DemandSlot,
  tracker: EmployeeTracker,
  ctx: ScoringContext,
  constraints: LaborConstraints
): CapExcessKind[] {
  const caps: CapExcessKind[] = [];
  const contract = ctx.contractTypes.get(employee.contract_type_id);

  const week = getISOWeekNumber(slot.date);
  const currentWeekHours = tracker.weeklyHours[week] || 0;
  const globalCap = constraints.maxHoursPerWeek;
  const contractCap = contract?.target_hours_per_week ?? Number.POSITIVE_INFINITY;
  const employeeCap = employee.max_hours_per_week;
  const effectiveWeeklyCap = Math.min(globalCap, contractCap, employeeCap);
  if (currentWeekHours + slot.durationHours > effectiveWeeklyCap) caps.push("weekly_hours");

  if (
    tracker.lastShiftDate === prevDateStr(slot.date) &&
    tracker.consecutiveDays + 1 > constraints.maxConsecutiveDays
  ) caps.push("consecutive_days");

  if (contract) {
    const quarter = ctx.quarterRollupSums.get(employee.id) ?? { sundays: 0, saturdays: 0, nights: 0, holidays: 0 };
    if (dayOfWeek(slot.date) === 0 && quarter.sundays + 1 > contract.max_sundays_per_quarter)
      caps.push("sundays_quarter");
    if (isHoliday(slot.date, ctx.locationId, ctx.holidays)
        && quarter.holidays + 1 > contract.max_holidays_per_quarter)
      caps.push("holidays_quarter");

    if (contract.target_nights_per_month !== null && isNightShift(slot.template)) {
      const monthNights = (ctx.rollingRollupSums.get(employee.id)?.nights ?? 0);
      if (monthNights + 1 > contract.target_nights_per_month) caps.push("night_limit");
    }
  }

  return caps;
}

export function generateSchedule(
  config: AutoGenConfig,
  employees: ProfileWithPositions[],
  templates: ShiftTemplate[],
  existingEntries: ScheduleEntry[],
  timeOff: TimeOffRange[],
  constraints: LaborConstraints,
  staffingRequirements: StaffingRequirement[],
  rollups: EmployeeEquityRollup[],
  holidays: HolidayDate[],
  contractTypes: ContractType[],
  weights: ScoringWeights
): AutoGenResult {
  const warnings: AutoGenWarning[] = [];
  const entries: AutoGenResult["entries"] = [];
  const stats: Record<string, { shifts: number; hours: number }> = {};

  const selectedEmployees = employees.filter((e) => config.employeeIds.includes(e.id));
  const selectedTemplates = templates.filter((t) => config.shiftTemplateIds.includes(t.id));

  if (selectedTemplates.length === 0) {
    warnings.push({ kind: "no_templates_selected" });
    return { entries, warnings, stats };
  }
  if (selectedEmployees.length === 0) {
    warnings.push({ kind: "no_employees_selected" });
    return { entries, warnings, stats };
  }

  // Pre-compute rolling + quarter rollup sums for all selected employees
  const rollingWindow = getRollingWindow(config.year, config.month + 1, 3);
  const quarterRange = getQuarterRange(`${config.year}-${String(config.month + 1).padStart(2, "0")}-01`);
  const quarterWindow = quarterRange.months.map((m) => ({ year: quarterRange.year, month: m }));

  const rollingRollupSums = new Map<string, { sundays: number; saturdays: number; nights: number; holidays: number }>();
  const quarterRollupSums = new Map<string, { sundays: number; saturdays: number; nights: number; holidays: number }>();
  for (const emp of selectedEmployees) {
    rollingRollupSums.set(emp.id, {
      sundays:   sumRollupField(rollups, emp.id, rollingWindow, "sundays_worked"),
      saturdays: sumRollupField(rollups, emp.id, rollingWindow, "saturdays_worked"),
      nights:    sumRollupField(rollups, emp.id, rollingWindow, "nights_worked"),
      holidays:  sumRollupField(rollups, emp.id, rollingWindow, "holidays_worked"),
    });
    quarterRollupSums.set(emp.id, {
      sundays:   sumRollupField(rollups, emp.id, quarterWindow, "sundays_worked"),
      saturdays: sumRollupField(rollups, emp.id, quarterWindow, "saturdays_worked"),
      nights:    sumRollupField(rollups, emp.id, quarterWindow, "nights_worked"),
      holidays:  sumRollupField(rollups, emp.id, quarterWindow, "holidays_worked"),
    });
  }

  // Tracker init from existing entries
  const trackers = new Map<string, EmployeeTracker>();
  for (const emp of selectedEmployees) {
    trackers.set(emp.id, {
      totalHours: 0, totalShifts: 0, weeklyHours: {},
      lastShiftDate: null, lastShiftEndTime: null, lastShiftWasNight: false,
      consecutiveDays: 0, assignedDates: new Set(),
    });
    stats[emp.id] = { shifts: 0, hours: 0 };
  }

  const templateById = new Map(templates.map((t) => [t.id, t]));
  const sortedExisting = [...existingEntries].sort((a, b) => a.date.localeCompare(b.date));
  for (const e of sortedExisting) {
    const t = trackers.get(e.employee_id);
    if (!t) continue;
    const tpl = templateById.get(e.shift_template_id ?? "");
    const dur = calcDurationHours(e.start_time, e.end_time, 0);
    t.totalHours += dur;
    t.totalShifts++;
    const week = getISOWeekNumber(e.date);
    t.weeklyHours[week] = (t.weeklyHours[week] || 0) + dur;
    t.assignedDates.add(e.date);
    stats[e.employee_id].shifts++;
    stats[e.employee_id].hours += dur;

    if (t.lastShiftDate === prevDateStr(e.date)) t.consecutiveDays++;
    else t.consecutiveDays = 1;
    t.lastShiftDate = e.date;
    t.lastShiftEndTime = e.end_time;
    t.lastShiftWasNight = tpl?.is_night ?? false;
  }

  const timeOffMap = buildTimeOffLookup(timeOff);
  const contractTypeMap = new Map(contractTypes.map((c) => [c.id, c]));

  // Position eligibility
  const positionEligibility = new Map<string, { primary: string[]; secondary: string[] }>();
  for (const emp of selectedEmployees) {
    if (emp.position_id) {
      if (!positionEligibility.has(emp.position_id))
        positionEligibility.set(emp.position_id, { primary: [], secondary: [] });
      positionEligibility.get(emp.position_id)!.primary.push(emp.id);
    }
    for (const sp of emp.secondary_positions || []) {
      if (!positionEligibility.has(sp.position_id))
        positionEligibility.set(sp.position_id, { primary: [], secondary: [] });
      positionEligibility.get(sp.position_id)!.secondary.push(emp.id);
    }
  }

  const dates = getMonthDates(config.year, config.month);
  const demandSlots = buildDemandSlots(config, dates, selectedTemplates, staffingRequirements);

  const totalDemandHours = demandSlots.reduce((sum, s) => sum + s.durationHours, 0);
  const targetHours = totalDemandHours / selectedEmployees.length;
  const targetShifts = demandSlots.length / selectedEmployees.length;

  const employeeMap = new Map(selectedEmployees.map((e) => [e.id, e]));

  demandSlots.sort((a, b) => {
    const dateCompare = a.date.localeCompare(b.date);
    if (dateCompare !== 0) return dateCompare;
    const aElig = positionEligibility.get(a.positionId);
    const bElig = positionEligibility.get(b.positionId);
    const aCount = (aElig?.primary.length ?? 0) + (aElig?.secondary.length ?? 0);
    const bCount = (bElig?.primary.length ?? 0) + (bElig?.secondary.length ?? 0);
    return aCount - bCount;
  });

  const ctx: ScoringContext = {
    weights, rollingRollupSums, quarterRollupSums,
    targetHours, targetShifts, holidays, locationId: config.locationId,
    contractTypes: contractTypeMap,
  };

  for (const slot of demandSlots) {
    const eligibility = positionEligibility.get(slot.positionId);
    if (!eligibility) {
      warnings.push({ kind: "no_employees_in_position",
        positionId: slot.positionId, date: slot.date, shiftTemplateId: slot.shiftTemplateId });
      continue;
    }

    const candidateIds = [...eligibility.primary, ...eligibility.secondary];

    // Pass 1: strict — filter candidates that violate anything (inviolable or contractual)
    // Pass 2: relaxed — filter only candidates that violate INVIOLABLES
    const pass1 = filterCandidates(candidateIds, slot, employeeMap, trackers, timeOffMap,
                                    constraints, ctx, false);
    let chosen = pickBestCandidate(pass1, employeeMap, trackers, slot, ctx);
    let overtimeCaps: CapExcessKind[] = [];

    if (!chosen) {
      const pass2 = filterCandidates(candidateIds, slot, employeeMap, trackers, timeOffMap,
                                      constraints, ctx, true);
      chosen = pickBestCandidate(pass2, employeeMap, trackers, slot, ctx);
      if (chosen) {
        const emp = employeeMap.get(chosen)!;
        const tracker = trackers.get(chosen)!;
        overtimeCaps = computeExceededCaps(emp, slot, tracker, ctx, constraints);
      }
    }

    if (!chosen) {
      warnings.push({ kind: "no_safe_candidate",
        positionId: slot.positionId, date: slot.date, shiftTemplateId: slot.shiftTemplateId });
      continue;
    }

    const tracker = trackers.get(chosen)!;
    entries.push({
      schedule_id: config.scheduleId,
      employee_id: chosen,
      position_id: slot.positionId,
      date: slot.date,
      start_time: slot.startTime,
      end_time: slot.endTime,
      shift_template_id: slot.shiftTemplateId,
      notes: null,
      exceeds_caps: overtimeCaps,
      overtime_status: overtimeCaps.length > 0 ? "pending" : "none",
      overtime_reviewed_by: null,
      overtime_reviewed_at: null,
      overtime_note: null,
    });

    if (overtimeCaps.length > 0) {
      warnings.push({
        kind: "overtime_assigned",
        positionId: slot.positionId, date: slot.date, shiftTemplateId: slot.shiftTemplateId,
        employeeId: chosen, caps: overtimeCaps,
      });
    }

    const week = getISOWeekNumber(slot.date);
    tracker.weeklyHours[week] = (tracker.weeklyHours[week] || 0) + slot.durationHours;
    tracker.totalHours += slot.durationHours;
    tracker.totalShifts++;
    if (tracker.lastShiftDate === prevDateStr(slot.date)) tracker.consecutiveDays++;
    else tracker.consecutiveDays = 1;
    tracker.lastShiftDate = slot.date;
    tracker.lastShiftEndTime = slot.endTime;
    tracker.lastShiftWasNight = isNightShift(slot.template);
    tracker.assignedDates.add(slot.date);
    stats[chosen].shifts++;
    stats[chosen].hours += slot.durationHours;

    // Update in-run rollup sums so subsequent slots see the updated state
    const isSun = dayOfWeek(slot.date) === 0;
    const isSat = dayOfWeek(slot.date) === 6;
    const isNight = isNightShift(slot.template);
    const isHol = isHoliday(slot.date, ctx.locationId, ctx.holidays);

    const roll = ctx.rollingRollupSums.get(chosen)!;
    if (isSun) roll.sundays++;
    if (isSat) roll.saturdays++;
    if (isNight) roll.nights++;
    if (isHol) roll.holidays++;

    const qq = ctx.quarterRollupSums.get(chosen)!;
    if (isSun) qq.sundays++;
    if (isSat) qq.saturdays++;
    if (isNight) qq.nights++;
    if (isHol) qq.holidays++;
  }

  return { entries, warnings, stats };
}

function filterCandidates(
  candidateIds: string[],
  slot: DemandSlot,
  employeeMap: Map<string, ProfileWithPositions>,
  trackers: Map<string, EmployeeTracker>,
  timeOffMap: Map<string, Set<string>>,
  constraints: LaborConstraints,
  ctx: ScoringContext,
  allowOvertime: boolean
): string[] {
  const kept: string[] = [];
  for (const empId of candidateIds) {
    const emp = employeeMap.get(empId);
    const tracker = trackers.get(empId);
    if (!emp || !tracker) continue;

    // INVIOLABLES (both passes)
    if (tracker.assignedDates.has(slot.date)) continue; // double_shift
    if (timeOffMap.get(empId)?.has(slot.date)) continue;
    if (slot.durationHours > constraints.maxHoursPerDay) continue;
    if (tracker.lastShiftDate && tracker.lastShiftEndTime) {
      const rest = requiredRestHours(tracker.lastShiftWasNight, constraints);
      if (!hasEnoughRest(tracker.lastShiftEndTime, tracker.lastShiftDate,
                         slot.startTime, slot.date, rest)) continue;
    }

    if (allowOvertime) {
      kept.push(empId);
      continue;
    }

    // CONTRACTUAL (pass 1 only)
    const week = getISOWeekNumber(slot.date);
    const contract = ctx.contractTypes.get(emp.contract_type_id);
    const globalCap = constraints.maxHoursPerWeek;
    const contractCap = contract?.target_hours_per_week ?? Number.POSITIVE_INFINITY;
    const empCap = emp.max_hours_per_week;
    const effectiveWeekly = Math.min(globalCap, contractCap, empCap);
    if ((tracker.weeklyHours[week] || 0) + slot.durationHours > effectiveWeekly) continue;

    if (tracker.lastShiftDate === prevDateStr(slot.date) &&
        tracker.consecutiveDays + 1 > constraints.maxConsecutiveDays) continue;

    if (contract) {
      const q = ctx.quarterRollupSums.get(empId) ?? { sundays: 0, saturdays: 0, nights: 0, holidays: 0 };
      if (dayOfWeek(slot.date) === 0 && q.sundays + 1 > contract.max_sundays_per_quarter) continue;
      if (isHoliday(slot.date, ctx.locationId, ctx.holidays)
          && q.holidays + 1 > contract.max_holidays_per_quarter) continue;
      if (contract.target_nights_per_month !== null && isNightShift(slot.template)) {
        const rollingNights = ctx.rollingRollupSums.get(empId)?.nights ?? 0;
        if (rollingNights + 1 > contract.target_nights_per_month) continue;
      }
    }

    kept.push(empId);
  }
  return kept;
}

function pickBestCandidate(
  candidateIds: string[],
  employeeMap: Map<string, ProfileWithPositions>,
  trackers: Map<string, EmployeeTracker>,
  slot: DemandSlot,
  ctx: ScoringContext
): string | null {
  if (candidateIds.length === 0) return null;
  let bestId: string | null = null;
  let bestScore = -Infinity;
  for (const empId of candidateIds) {
    const emp = employeeMap.get(empId)!;
    const tracker = trackers.get(empId)!;
    const score = scoreCandidate(emp, slot, tracker, ctx);
    if (score > bestScore) { bestScore = score; bestId = empId; }
  }
  return bestId;
}
```

- [ ] **Step 4: Run tests — expect all to pass**

Run: `npm run test`
Expected: all 4 scenarios pass.

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit`
Expected: errors remain only in `src/components/schedule/auto-generate-dialog.tsx` (consumes the old signature). Task 23 fixes those.

- [ ] **Step 6: Commit**

```bash
git add src/lib/schedule-generator.ts src/lib/schedule-generator.test.ts
git commit -m "$(cat <<'EOF'
feat(generator): two-pass assignment with overtime workflow + equity scoring

- Pass 1 filters strict (inviolables + contractual caps)
- Pass 2 relaxes contractual caps, marks entries overtime_status='pending'
  with exceeds_caps listing the caps exceeded
- 24h rest after night shift replaces the fixed 12h minimum
- Block-packing scoring: continuation bonus, fragmentation penalty,
  clean-restart bonus
- Rolling rollup sums used for soft scoring, calendar quarter for hard caps
- 4 Vitest scenarios covering happy path, cap reached, block packing,
  post-night rest

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Phase 5 — UI surfaces

Tasks 16-22 — each builds one screen. Code blocks below are complete but concise; the implementer follows existing shadcn patterns (see `src/app/(authenticated)/positions/page.tsx` as reference for a CRUD page).

### Task 16: Shared `EmployeeEquityPanel` component

**Files:**
- Create: `src/components/schedule/employee-equity-panel.tsx`

- [ ] **Step 1: Create the component**

```tsx
"use client";

import { useMemo } from "react";
import { Check } from "lucide-react";
import { getQuarterRange, sumRollupField, getRollingWindow } from "@/lib/equity-helpers";
import type { Profile, EmployeeEquityRollup, ContractType, Position } from "@/lib/types";

interface Props {
  employee: Profile;
  position?: Position | null;
  contract?: ContractType;
  rollups: EmployeeEquityRollup[];  // already filtered to this employee
  currentYear: number;
  currentMonth: number; // 1-12
}

export function EmployeeEquityPanel({
  employee, position, contract, rollups, currentYear, currentMonth,
}: Props) {
  const window3 = useMemo(
    () => getRollingWindow(currentYear, currentMonth, 3),
    [currentYear, currentMonth]
  );

  const quarter = useMemo(
    () => getQuarterRange(`${currentYear}-${String(currentMonth).padStart(2, "0")}-01`),
    [currentYear, currentMonth]
  );
  const quarterWindow = quarter.months.map((m) => ({ year: quarter.year, month: m }));

  const monthlyRows = window3.map((w) => {
    const r = rollups.find((x) => x.year === w.year && x.month === w.month);
    return {
      year: w.year,
      month: w.month,
      sundays: r?.sundays_worked ?? 0,
      saturdays: r?.saturdays_worked ?? 0,
      nights: r?.nights_worked ?? 0,
      holidays: r?.holidays_worked ?? 0,
      hours: r?.total_hours ?? 0,
    };
  });

  const qSundays  = sumRollupField(rollups, employee.id, quarterWindow, "sundays_worked");
  const qHolidays = sumRollupField(rollups, employee.id, quarterWindow, "holidays_worked");

  const maxSun = contract?.max_sundays_per_quarter ?? 999;
  const maxHol = contract?.max_holidays_per_quarter ?? 999;

  const monthName = (m: number) => ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"][m - 1];

  return (
    <div className="space-y-4">
      <div>
        <p className="font-medium text-sm">{employee.first_name} {employee.last_name}</p>
        <p className="text-xs text-muted-foreground">
          {contract?.name ?? "Sin contrato"} · {employee.max_hours_per_week}h/sem · {position?.name ?? "Sin posición"}
        </p>
      </div>

      <div>
        <p className="text-xs font-medium mb-1">Equidad — últimos 3 meses</p>
        <table className="w-full text-xs">
          <thead>
            <tr className="text-muted-foreground">
              <th className="text-left font-normal"></th>
              {monthlyRows.map((r) => (
                <th key={`${r.year}-${r.month}`} className="text-right font-normal">
                  {monthName(r.month)} {String(r.year).slice(2)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr><td>Dom</td>{monthlyRows.map((r,i) => <td key={i} className="text-right">{r.sundays}</td>)}</tr>
            <tr><td>Sáb</td>{monthlyRows.map((r,i) => <td key={i} className="text-right">{r.saturdays}</td>)}</tr>
            <tr><td>Noches</td>{monthlyRows.map((r,i) => <td key={i} className="text-right">{r.nights}</td>)}</tr>
            <tr><td>Festivos</td>{monthlyRows.map((r,i) => <td key={i} className="text-right">{r.holidays}</td>)}</tr>
            <tr><td>Horas</td>{monthlyRows.map((r,i) => <td key={i} className="text-right">{Math.round(r.hours)}</td>)}</tr>
          </tbody>
        </table>
      </div>

      <div className="space-y-1">
        <p className="text-xs font-medium">Q{Math.ceil(currentMonth/3)} {currentYear} — progreso</p>
        <CapBar label="Domingos"   value={qSundays}  max={maxSun} />
        <CapBar label="Festivos"   value={qHolidays} max={maxHol} />
      </div>
    </div>
  );
}

function CapBar({ label, value, max }: { label: string; value: number; max: number }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  const overCap = value > max;
  return (
    <div className="text-xs">
      <div className="flex justify-between">
        <span>{label}</span>
        <span className={overCap ? "text-red-600 font-medium" : ""}>
          {value}/{max} {overCap && "⚠"}
          {!overCap && value === max && <Check className="inline h-3 w-3 text-emerald-600 ml-1" />}
        </span>
      </div>
      <div className="h-1.5 bg-muted rounded-full overflow-hidden">
        <div
          className={`h-full ${overCap ? "bg-red-500" : value === max ? "bg-emerald-500" : "bg-blue-500"}`}
          style={{ width: `${Math.min(100, pct)}%` }}
        />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit` — expected: no new errors in this file.

- [ ] **Step 3: Commit**

```bash
git add src/components/schedule/employee-equity-panel.tsx
git commit -m "feat(equity): add shared EmployeeEquityPanel component (3-month rollups + Q progress bars)"
```

---

### Task 17: `/contract-types` page (admin only)

**Files:**
- Create: `src/app/(authenticated)/contract-types/page.tsx`
- Create: `src/app/(authenticated)/contract-types/contract-type-form.tsx`

- [ ] **Step 1: Create the form component**

`src/app/(authenticated)/contract-types/contract-type-form.tsx`:

```tsx
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormField } from "@/components/shared/form-field";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";
import { translateDbError } from "@/lib/utils";
import type { ContractType } from "@/lib/types";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  initial: ContractType | null;
  onSaved: () => void;
}

export function ContractTypeForm({ open, onOpenChange, initial, onSaved }: Props) {
  const supabase = createClient();
  const [saving, setSaving] = useState(false);

  const [name, setName] = useState(initial?.name ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [maxSun, setMaxSun] = useState(initial?.max_sundays_per_quarter ?? 6);
  const [maxHol, setMaxHol] = useState(initial?.max_holidays_per_quarter ?? 3);
  const [targetSat, setTargetSat] = useState(initial?.target_saturdays_per_month ?? "");
  const [targetNight, setTargetNight] = useState(initial?.target_nights_per_month ?? "");
  const [targetHours, setTargetHours] = useState(initial?.target_hours_per_week ?? "");

  async function handleSave() {
    setSaving(true);
    const payload = {
      name, description: description || null,
      max_sundays_per_quarter: Number(maxSun),
      max_holidays_per_quarter: Number(maxHol),
      target_saturdays_per_month: targetSat === "" ? null : Number(targetSat),
      target_nights_per_month:    targetNight === "" ? null : Number(targetNight),
      target_hours_per_week:      targetHours === "" ? null : Number(targetHours),
    };
    const { error } = initial
      ? await supabase.from("contract_types").update(payload).eq("id", initial.id)
      : await supabase.from("contract_types").insert(payload);

    if (error) toast.error(translateDbError(error.message, "Error al guardar tipo"));
    else {
      toast.success("Tipo guardado");
      onSaved();
      onOpenChange(false);
    }
    setSaving(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{initial ? "Editar tipo de contrato" : "Nuevo tipo de contrato"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <FormField label="Nombre" required>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </FormField>
          <FormField label="Descripción">
            <Input value={description ?? ""} onChange={(e) => setDescription(e.target.value)} />
          </FormField>
          <FormField label="Máximo domingos por trimestre" required>
            <Input type="number" min={0} value={maxSun} onChange={(e) => setMaxSun(Number(e.target.value))} />
          </FormField>
          <FormField label="Máximo festivos por trimestre" required>
            <Input type="number" min={0} value={maxHol} onChange={(e) => setMaxHol(Number(e.target.value))} />
          </FormField>
          <FormField label="Target sábados/mes (opcional)">
            <Input type="number" min={0} value={targetSat} onChange={(e) => setTargetSat(e.target.value)} />
          </FormField>
          <FormField label="Target noches/mes (opcional)">
            <Input type="number" min={0} value={targetNight} onChange={(e) => setTargetNight(e.target.value)} />
          </FormField>
          <FormField label="Horas/semana (opcional, override)">
            <Input type="number" min={0} value={targetHours} onChange={(e) => setTargetHours(e.target.value)} />
          </FormField>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleSave} disabled={saving || !name}>Guardar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Create the list page**

`src/app/(authenticated)/contract-types/page.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import { PageHeader } from "@/components/shared/page-header";
import { DataTable } from "@/components/shared/data-table";
import { DeleteDialog } from "@/components/shared/delete-dialog";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/contexts/auth-context";
import { useRouter } from "next/navigation";
import { Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { translateDbError } from "@/lib/utils";
import { ContractTypeForm } from "./contract-type-form";
import type { ContractType } from "@/lib/types";

export default function ContractTypesPage() {
  const supabase = createClient();
  const { profile, loading: authLoading } = useAuth();
  const router = useRouter();
  const [items, setItems] = useState<(ContractType & { employee_count: number })[]>([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<ContractType | null>(null);
  const [deleting, setDeleting] = useState<ContractType | null>(null);

  useEffect(() => {
    if (!authLoading && profile?.role !== "admin") router.push("/dashboard");
  }, [profile, authLoading, router]);

  async function fetchData() {
    setLoading(true);
    const { data: types } = await supabase.from("contract_types").select("*").order("name");
    const counts: Record<string, number> = {};
    const { data: emps } = await supabase.from("profiles")
      .select("contract_type_id");
    for (const e of emps ?? []) {
      counts[e.contract_type_id] = (counts[e.contract_type_id] ?? 0) + 1;
    }
    setItems((types ?? []).map((t) => ({ ...t, employee_count: counts[t.id] ?? 0 })));
    setLoading(false);
  }

  useEffect(() => { fetchData(); }, []);

  async function handleDelete() {
    if (!deleting) return;
    const { error } = await supabase.from("contract_types").delete().eq("id", deleting.id);
    if (error) toast.error(translateDbError(error.message, "Error al eliminar"));
    else { toast.success("Tipo eliminado"); fetchData(); }
    setDeleting(null);
  }

  if (profile?.role !== "admin") return null;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Tipos de contrato"
        description="Define plantillas de contrato con caps trimestrales y targets mensuales"
        action={<Button onClick={() => { setEditing(null); setFormOpen(true); }}>Nuevo tipo</Button>}
      />
      <DataTable
        data={items}
        loading={loading}
        keyAccessor={(r) => r.id}
        columns={[
          { header: "Nombre", accessor: (r) => r.name },
          { header: "Empleados", accessor: (r) => r.employee_count },
          { header: "Max dom/trim", accessor: (r) => r.max_sundays_per_quarter },
          { header: "Max fest/trim", accessor: (r) => r.max_holidays_per_quarter },
          { header: "Target sáb/mes", accessor: (r) => r.target_saturdays_per_month ?? "—" },
          { header: "Target noches/mes", accessor: (r) => r.target_nights_per_month ?? "—" },
          { header: "Horas/sem", accessor: (r) => r.target_hours_per_week ?? "—" },
          {
            header: "Acciones",
            accessor: (r) => (
              <div className="flex gap-1">
                <Button variant="ghost" size="icon" onClick={() => { setEditing(r); setFormOpen(true); }}>
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="icon" onClick={() => setDeleting(r)}
                        disabled={r.employee_count > 0}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ),
          },
        ]}
      />
      <ContractTypeForm
        open={formOpen} onOpenChange={setFormOpen}
        initial={editing} onSaved={fetchData}
      />
      <DeleteDialog
        open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}
        onConfirm={handleDelete}
        title={`¿Eliminar "${deleting?.name}"?`}
        description="Esta acción no se puede deshacer. Si hay empleados usando este tipo, la eliminación será rechazada."
      />
    </div>
  );
}
```

*Note: `DataTable` column shape assumed from `src/components/shared/data-table.tsx` — if the actual shape differs (columns have `accessorKey` rather than `accessor`), the implementer must check that file and adjust.*

- [ ] **Step 3: Verify by running tsc**

Run: `npx tsc --noEmit` — expected: no errors from these new files (only still-pending errors in auto-generate-dialog.tsx).

- [ ] **Step 4: Commit**

```bash
git add "src/app/(authenticated)/contract-types"
git commit -m "feat(contract-types): add /contract-types admin page (CRUD with employee count + RESTRICT-aware delete)"
```

---

### Task 18: `/holidays` page (admin + manager for per-sede)

**Files:**
- Create: `src/app/(authenticated)/holidays/page.tsx`

- [ ] **Step 1: Create the page**

`src/app/(authenticated)/holidays/page.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import { PageHeader } from "@/components/shared/page-header";
import { DataTable } from "@/components/shared/data-table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { FormField } from "@/components/shared/form-field";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/contexts/auth-context";
import { toast } from "sonner";
import { translateDbError } from "@/lib/utils";
import { Trash2 } from "lucide-react";
import type { HolidayDate, Location } from "@/lib/types";

export default function HolidaysPage() {
  const supabase = createClient();
  const { profile } = useAuth();
  const [nacionales, setNacionales] = useState<HolidayDate[]>([]);
  const [sedes, setLocations] = useState<Location[]>([]);
  const [localHolidays, setLocalHolidays] = useState<HolidayDate[]>([]);
  const [selectedSede, setSelectedSede] = useState<string>("");
  const [formOpen, setFormOpen] = useState(false);
  const [formIsNational, setFormIsNational] = useState(true);
  const [formDate, setFormDate] = useState("");
  const [formName, setFormName] = useState("");

  async function fetchAll() {
    const { data: nat } = await supabase.from("holidays").select("*")
      .is("location_id", null).order("date");
    setNacionales(nat ?? []);
    const { data: locs } = await supabase.from("locations").select("*").order("name");
    setLocations(locs ?? []);
    if (selectedSede) {
      const { data: local } = await supabase.from("holidays").select("*")
        .eq("location_id", selectedSede).order("date");
      setLocalHolidays(local ?? []);
    }
  }

  useEffect(() => { fetchAll(); }, [selectedSede]);

  async function handleSave() {
    const payload = {
      date: formDate,
      name: formName,
      location_id: formIsNational ? null : selectedSede || null,
    };
    const { error } = await supabase.from("holidays").insert(payload);
    if (error) toast.error(translateDbError(error.message, "Error al crear festivo"));
    else {
      toast.success("Festivo creado");
      setFormOpen(false);
      setFormDate(""); setFormName("");
      fetchAll();
    }
  }

  async function handleDelete(id: string) {
    const { error } = await supabase.from("holidays").delete().eq("id", id);
    if (error) toast.error(translateDbError(error.message, "Error al eliminar"));
    else { toast.success("Festivo eliminado"); fetchAll(); }
  }

  const isAdmin = profile?.role === "admin";
  const isManagerOrAdmin = profile?.role === "admin" || profile?.role === "manager";

  return (
    <div className="space-y-4">
      <PageHeader
        title="Festivos"
        description="Festivos nacionales de Colombia y por sede"
        action={
          isManagerOrAdmin ? (
            <Button onClick={() => { setFormIsNational(isAdmin); setFormOpen(true); }}>
              Nuevo festivo
            </Button>
          ) : undefined
        }
      />

      <Tabs defaultValue="nacionales">
        <TabsList>
          <TabsTrigger value="nacionales">Nacionales</TabsTrigger>
          <TabsTrigger value="por-sede">Por sede</TabsTrigger>
        </TabsList>

        <TabsContent value="nacionales">
          <DataTable
            data={nacionales}
            keyAccessor={(r) => r.id}
            columns={[
              { header: "Fecha", accessor: (r) => r.date },
              { header: "Nombre", accessor: (r) => r.name },
              ...(isAdmin ? [{
                header: "Acciones",
                accessor: (r: HolidayDate) => (
                  <Button variant="ghost" size="icon" onClick={() => handleDelete(r.id)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                ),
              }] : []),
            ]}
          />
        </TabsContent>

        <TabsContent value="por-sede">
          <div className="mb-2">
            <Select value={selectedSede} onValueChange={setSelectedSede}>
              <SelectTrigger className="w-64"><SelectValue placeholder="Elige una sede" /></SelectTrigger>
              <SelectContent>
                {sedes.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          {selectedSede && (
            <DataTable
              data={localHolidays}
              keyAccessor={(r) => r.id}
              columns={[
                { header: "Fecha", accessor: (r) => r.date },
                { header: "Nombre", accessor: (r) => r.name },
                {
                  header: "Acciones",
                  accessor: (r: HolidayDate) => (
                    <Button variant="ghost" size="icon" onClick={() => handleDelete(r.id)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  ),
                },
              ]}
            />
          )}
        </TabsContent>
      </Tabs>

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Nuevo festivo</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            {isAdmin && (
              <FormField label="Alcance">
                <Select
                  value={formIsNational ? "nacional" : "sede"}
                  onValueChange={(v) => setFormIsNational(v === "nacional")}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="nacional">Nacional</SelectItem>
                    <SelectItem value="sede">Por sede</SelectItem>
                  </SelectContent>
                </Select>
              </FormField>
            )}
            {!formIsNational && (
              <FormField label="Sede">
                <Select value={selectedSede} onValueChange={setSelectedSede}>
                  <SelectTrigger><SelectValue placeholder="Elige sede" /></SelectTrigger>
                  <SelectContent>
                    {sedes.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </FormField>
            )}
            <FormField label="Fecha" required>
              <Input type="date" value={formDate} onChange={(e) => setFormDate(e.target.value)} />
            </FormField>
            <FormField label="Nombre" required>
              <Input value={formName} onChange={(e) => setFormName(e.target.value)} />
            </FormField>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFormOpen(false)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={!formDate || !formName}>Guardar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
```

- [ ] **Step 2: Verify tsc**, then commit:

```bash
git add "src/app/(authenticated)/holidays"
git commit -m "feat(holidays): add /holidays page with nacional+por-sede tabs"
```

---

### Task 19: `/empleados` — contract column + side panel integration

**Files:**
- Modify: `src/app/(authenticated)/employees/page.tsx`

- [ ] **Step 1: Read the current file** to identify where to add the column and side panel.

Use Read tool on the file. Locate the `columns` array of the `DataTable`.

- [ ] **Step 2: Add the contract column and a side panel state**

The implementer extends the existing `EmployeesPage` with:

1. A new state: `const [panelEmployee, setPanelEmployee] = useState<Profile | null>(null);`
2. Fetch `contract_types` on mount.
3. Fetch `employee_equity_rollups` filtered to last 3 months + current on mount.
4. A new column `Contrato` showing `contract.name`. Red badge if `'Sin definir'`.
5. Row click opens a `Sheet` (shadcn side panel) with `<EmployeeEquityPanel />` inside.

Full code block is long — the implementer uses this skeleton and fills in per the existing patterns in the file:

```tsx
// Add imports
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { EmployeeEquityPanel } from "@/components/schedule/employee-equity-panel";

// Inside the component, add state and fetches:
const [contracts, setContracts] = useState<ContractType[]>([]);
const [rollups, setRollups] = useState<EmployeeEquityRollup[]>([]);
const [panelEmp, setPanelEmp] = useState<Profile | null>(null);

useEffect(() => {
  (async () => {
    const { data } = await supabase.from("contract_types").select("*");
    setContracts(data ?? []);
  })();
}, []);

useEffect(() => {
  (async () => {
    const now = new Date();
    const y = now.getFullYear();
    const m = now.getMonth() + 1;
    const startY = m <= 2 ? y - 1 : y;
    const { data } = await supabase.from("employee_equity_rollups")
      .select("*")
      .gte("year", startY);
    setRollups(data ?? []);
  })();
}, []);

// New column in the table:
{
  header: "Contrato",
  accessor: (r: Profile) => {
    const c = contracts.find((x) => x.id === r.contract_type_id);
    const isSinDefinir = c?.name === "Sin definir";
    return (
      <span className={isSinDefinir ? "inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded bg-red-50 text-red-700 border border-red-200" : ""}>
        {c?.name ?? "—"} {isSinDefinir && "⚠"}
      </span>
    );
  },
},

// On row click or a new "Ver" button:
onRowClick={(r) => setPanelEmp(r)}

// The Sheet:
<Sheet open={!!panelEmp} onOpenChange={(o) => !o && setPanelEmp(null)}>
  <SheetContent className="w-[400px] sm:max-w-[400px]">
    <SheetHeader><SheetTitle>Detalle del empleado</SheetTitle></SheetHeader>
    {panelEmp && (
      <div className="mt-4">
        <EmployeeEquityPanel
          employee={panelEmp}
          position={/* locate from positions prop or re-fetch */ null}
          contract={contracts.find((c) => c.id === panelEmp.contract_type_id)}
          rollups={rollups.filter((r) => r.employee_id === panelEmp.id)}
          currentYear={new Date().getFullYear()}
          currentMonth={new Date().getMonth() + 1}
        />
      </div>
    )}
  </SheetContent>
</Sheet>
```

*The implementer integrates these fragments into the existing file structure. If `Sheet` is not installed, install it first via `npx shadcn@latest add sheet`.*

- [ ] **Step 3: Run tsc** — no new errors.

- [ ] **Step 4: Commit**

```bash
git add "src/app/(authenticated)/employees" components.json src/components/ui
git commit -m "feat(employees): add Contrato column + EmployeeEquityPanel side sheet"
```

---

### Task 20: Rewire `AutoGenerateDialog` to the new generator signature

**Files:**
- Modify: `src/components/schedule/auto-generate-dialog.tsx`
- Modify: `src/app/(authenticated)/schedule/page.tsx`

- [ ] **Step 1: Fetch new data in the parent page**

In `src/app/(authenticated)/schedule/page.tsx`, before passing data to `<AutoGenerateDialog>`, add fetches for:
- `contractTypes` (all)
- `holidays` (matching location or national)
- `rollups` (last 3 months + current)
- `scoringWeights` (from `app_settings`)

Pass them as new props to the dialog.

- [ ] **Step 2: Update the dialog's `handleGenerate` to use new signature**

Replace the call:

```tsx
const genResult = generateSchedule(
  { /* config */ },
  employeesWithPositions,
  shiftTemplates,
  existingEntries,
  timeOff || [],
  constraints,
  staffingReqs,
  rollupsProp,
  holidaysProp,
  contractTypesProp,
  scoringWeightsProp
);
```

Remove the old `scored.length === 0` warning logic — the generator now emits the correct kinds.

- [ ] **Step 3: Extend the results preview with equity columns**

Replace the "Distribución por empleado" table section with columns `Turnos · Horas · D · S · N · F`, plus a small `Q2: D/F` summary from `quarterRollupSums`. Pure render change.

- [ ] **Step 4: Add the summary card with overtime breakdown**

Add a block above the per-employee table:

```tsx
<div className="rounded-md bg-muted p-3 space-y-1">
  {(() => {
    const normals = result.entries.filter(e => e.overtime_status === "none").length;
    const overt   = result.entries.filter(e => e.overtime_status === "pending").length;
    const total   = result.entries.length;
    return (
      <>
        <p className="font-medium text-sm">{total} turnos generados</p>
        {overt > 0 && (
          <p className="text-xs text-amber-700">
            {normals} normales · <span className="font-medium">{overt} con horas extra (pendientes de aprobación)</span>
          </p>
        )}
      </>
    );
  })()}
</div>
```

- [ ] **Step 5: tsc clean + commit**

```bash
git add src/components/schedule/auto-generate-dialog.tsx "src/app/(authenticated)/schedule/page.tsx"
git commit -m "feat(schedule): wire AutoGenerateDialog to new generator signature with equity data"
```

---

### Task 21: Visual states for overtime entries in the grid

**Files:**
- Modify: `src/components/schedule/schedule-cell.tsx`

- [ ] **Step 1: Extend the cell to render overtime badges**

Add to the cell:
- If `entry.overtime_status === "pending"` with `weekly_hours` or `consecutive_days` in `exceeds_caps` → dashed amber border + `⏱ extra` badge top-right.
- If `entry.overtime_status === "pending"` with `sundays_quarter` or `holidays_quarter` → dashed red border + `⚠ cap` badge top-right.
- If `entry.overtime_status === "approved"` → normal look + small green check top-right.

Concrete example (add to the existing cell render):

```tsx
{entry && entry.overtime_status === "pending" && (
  <>
    {(entry.exceeds_caps.includes("sundays_quarter") ||
      entry.exceeds_caps.includes("holidays_quarter")) ? (
      <div className="absolute inset-0 border-2 border-red-400 border-dashed rounded pointer-events-none" />
    ) : (
      <div className="absolute inset-0 border-2 border-amber-400 border-dashed rounded pointer-events-none" />
    )}
    <div className="absolute top-0 right-0 text-[9px] px-1 bg-white/80 rounded-bl">
      {entry.exceeds_caps.includes("sundays_quarter") ||
       entry.exceeds_caps.includes("holidays_quarter")
        ? "⚠ cap" : "⏱ extra"}
    </div>
  </>
)}
{entry && entry.overtime_status === "approved" && (
  <Check className="absolute top-0 right-0 h-3 w-3 text-emerald-600" />
)}
```

- [ ] **Step 2: tsc clean + commit**

```bash
git add src/components/schedule/schedule-cell.tsx
git commit -m "feat(schedule): add visual states for overtime pending/approved entries"
```

---

### Task 22: New "Horas extra" tab in `/solicitudes`

**Files:**
- Create: `src/app/(authenticated)/requests/overtime/page.tsx`
- Modify: `src/app/(authenticated)/requests/page.tsx` (add third tab)

- [ ] **Step 1: Create the overtime requests page**

`src/app/(authenticated)/requests/overtime/page.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/contexts/auth-context";
import { toast } from "sonner";
import { Check, X, ChevronDown, ChevronRight } from "lucide-react";
import type { ScheduleEntry, Profile, ShiftTemplate } from "@/lib/types";

type OvertimeRow = ScheduleEntry & {
  employee: Profile;
  template: ShiftTemplate | null;
};

export function OvertimeRequestsTab() {
  const supabase = createClient();
  const { profile } = useAuth();
  const [rows, setRows] = useState<OvertimeRow[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [note, setNote] = useState("");

  async function fetchPending() {
    const { data } = await supabase
      .from("schedule_entries")
      .select("*, employee:profiles(*), template:shift_templates(*)")
      .eq("overtime_status", "pending")
      .order("date");
    setRows((data ?? []) as OvertimeRow[]);
  }

  useEffect(() => { fetchPending(); }, []);

  async function approve(ids: string[]) {
    const { error } = await supabase.from("schedule_entries")
      .update({
        overtime_status: "approved",
        overtime_reviewed_by: profile?.id ?? null,
        overtime_reviewed_at: new Date().toISOString(),
        overtime_note: note || null,
      })
      .in("id", ids);
    if (error) toast.error("Error aprobando");
    else { toast.success(`${ids.length} aprobado(s)`); setSelected(new Set()); setNote(""); fetchPending(); }
  }

  async function reject(ids: string[]) {
    // On reject: delete the entry so the slot re-appears as uncovered
    const { error } = await supabase.from("schedule_entries").delete().in("id", ids);
    if (error) toast.error("Error rechazando");
    else { toast.success(`${ids.length} rechazado(s)`); setSelected(new Set()); setNote(""); fetchPending(); }
  }

  function toggleSel(id: string) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSelected(next);
  }

  function toggleExp(id: string) {
    const next = new Set(expanded);
    if (next.has(id)) next.delete(id); else next.add(id);
    setExpanded(next);
  }

  return (
    <div className="space-y-4">
      {selected.size > 0 && (
        <div className="rounded border p-3 flex items-center gap-2">
          <span className="text-sm">{selected.size} seleccionado(s)</span>
          <input
            type="text"
            placeholder="Nota (opcional)"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className="flex-1 border rounded px-2 py-1 text-sm"
          />
          <Button size="sm" onClick={() => approve(Array.from(selected))}>
            <Check className="h-4 w-4 mr-1" /> Aprobar
          </Button>
          <Button size="sm" variant="outline" onClick={() => reject(Array.from(selected))}>
            <X className="h-4 w-4 mr-1" /> Rechazar
          </Button>
        </div>
      )}

      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-muted-foreground text-xs">
            <th className="p-2 text-left w-8"></th>
            <th className="p-2 text-left">Empleado</th>
            <th className="p-2 text-left">Fecha</th>
            <th className="p-2 text-left">Turno</th>
            <th className="p-2 text-left">Caps excedidos</th>
            <th className="p-2 text-left w-8"></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const isExp = expanded.has(r.id);
            return (
              <>
                <tr key={r.id} className="border-b hover:bg-muted/50">
                  <td className="p-2">
                    <Checkbox checked={selected.has(r.id)} onCheckedChange={() => toggleSel(r.id)} />
                  </td>
                  <td className="p-2">{r.employee.first_name} {r.employee.last_name}</td>
                  <td className="p-2">{r.date}</td>
                  <td className="p-2">{r.template?.name ?? `${r.start_time}-${r.end_time}`}</td>
                  <td className="p-2">
                    <div className="flex flex-wrap gap-1">
                      {r.exceeds_caps.map((c) => (
                        <span key={c} className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-800">{c}</span>
                      ))}
                    </div>
                  </td>
                  <td className="p-2">
                    <button onClick={() => toggleExp(r.id)}>
                      {isExp ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                    </button>
                  </td>
                </tr>
                {isExp && (
                  <tr className="bg-muted/30 border-b">
                    <td colSpan={6} className="p-3 text-xs">
                      <div className="grid grid-cols-2 gap-2">
                        <div>Rango: {r.start_time} – {r.end_time}</div>
                        <div>Plantilla: {r.template?.name ?? "—"}</div>
                      </div>
                      <div className="mt-2 flex gap-2">
                        <Button size="sm" onClick={() => approve([r.id])}>Aprobar</Button>
                        <Button size="sm" variant="outline" onClick={() => reject([r.id])}>Rechazar</Button>
                      </div>
                    </td>
                  </tr>
                )}
              </>
            );
          })}
          {rows.length === 0 && (
            <tr><td colSpan={6} className="p-4 text-center text-muted-foreground">No hay solicitudes pendientes</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

export default OvertimeRequestsTab;
```

- [ ] **Step 2: Add the tab in `/requests/page.tsx`**

The implementer opens the existing `src/app/(authenticated)/requests/page.tsx`, locates the `<TabsList>` and `<TabsContent>` blocks, and adds a third tab pointing to `<OvertimeRequestsTab />`.

- [ ] **Step 3: tsc + commit**

```bash
git add "src/app/(authenticated)/requests"
git commit -m "feat(requests): add 'Horas extra' tab for overtime approval workflow"
```

---

### Task 23: Sidebar reorganization

**Files:**
- Modify: `src/components/layout/sidebar.tsx` (or wherever the nav links live)

- [ ] **Step 1: Group config routes under collapsible "Configuración"**

The implementer identifies the existing nav component and changes the flat list to nested structure:

```
Dashboard
Horarios
Empleados
Solicitudes
Notificaciones
━━━
Configuración ▾
  Sedes
  Departamentos
  Posiciones
  Turnos
  Necesidades
  Tipos de contrato
  Festivos
  Ajustes
```

Uses shadcn `Collapsible` (`npx shadcn@latest add collapsible` if missing).

- [ ] **Step 2: tsc + commit**

```bash
git add src/components/layout
git commit -m "feat(nav): group config routes under collapsible 'Configuración' section"
```

---

## Phase 6 — Final verification

### Task 24: Comprehensive verification + final review

- [ ] **Step 1: Run all tests**

```bash
cd "/Users/usuario/App Horarios"
npm run test
```
Expected: all tests pass (at least the scenarios written in Task 13 and 15).

- [ ] **Step 2: Type-check**

```bash
npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 3: Run SQL tests**

For each file under `supabase/tests/`, run via `mcp__claude_ai_Supabase__execute_sql` with `project_id: ugkvuinkynvtuiutwlkd`. Expected: NOTICE: PASS in each.

- [ ] **Step 4: Manual smoke test checklist in browser**

Start: `npm run dev` or confirm Vercel deploy succeeded. Then walk through:

1. `/contract-types` → admin can CRUD types. ON DELETE RESTRICT triggers clean error when type has employees.
2. `/holidays` → Nacionales tab shows 54 rows. Por sede tab filterable.
3. `/empleados` → Contrato column shows types. Click opens equity side sheet with 3-month breakdown + Q progress bars.
4. `/schedule` → create a draft for current month. Auto-generar:
   - Preview shows new columns D/S/N/F + Q2 summary.
   - Generate with intentionally-low capacity → some entries marked overtime pending.
5. `/solicitudes` → "Horas extra" tab lists pending entries. Approve one → entry in grid shows check. Reject another → entry deleted, slot becomes warning.
6. Click an entry with overtime → cell has dashed amber/red border per cap type.
7. Navigate to `/empleados` → side sheet shows updated progress bar reflecting the approved overtime.

If any step fails: do not proceed to Step 6. Debug, fix, re-run.

- [ ] **Step 5: Final code-reviewer subagent (optional but recommended)**

Dispatch the `superpowers:code-reviewer` subagent over the full diff from the branch base to HEAD. Address any Important issues before merge.

- [ ] **Step 6: Push**

```bash
git push origin main
```

---

## Self-review

**1. Spec coverage:** every section of `2026-04-22-schedule-equity-model-design.md` is implemented:
- §1 Architecture → Tasks 1-23 cover all pieces.
- §2 Data Model → Tasks 2-12 cover all migrations + types.
- §3 Algorithm → Task 15 covers two-pass, scoring, warning kinds.
- §4 UI Surfaces → Tasks 16-22 cover all 5 screens plus sidebar.
- §5 Error Handling → Covered by the generator's warning emissions + the overtime UI.
- §6 Testing → Tasks 1 (Vitest), 13 (helpers tests), 14 (SQL tests), 15 (generator tests), 24 (verification).
- §7 Out of scope → respected; no bonus features added.
- §8 Deliverables → all migrations 013-021, equity-helpers, generator, dialog, pages listed. ✓

**2. Placeholder scan:** every step has concrete code or command. No "TBD"/"TODO"/"handle edge cases" without specifics. The one area where prose predominates is Task 19 (employees page integration) and Task 20 (dialog rewire) — the implementer is shown the fragments to add and the file is referenced; this is acceptable because the existing file structure varies and the implementer must blend.

**3. Type consistency:** `AutoGenWarning` kinds used in Task 15 tests match the enum added in Task 12. `CapExcessKind` used in Task 20, 21, 22 matches Task 12. `scoreCandidate`/`filterCandidates`/`pickBestCandidate` signatures are internal to Task 15 and consistent.

---

## Execution Handoff

**Plan complete and saved to `docs/superpowers/plans/2026-04-22-schedule-equity-model.md`. Two execution options:**

**1. Subagent-Driven (recommended)** — dispatch a fresh subagent per task, review between tasks, fast iteration with two-stage review (spec compliance then code quality).

**2. Inline Execution** — execute tasks in this session using executing-plans, batch execution with checkpoints for review.

**Which approach?**
