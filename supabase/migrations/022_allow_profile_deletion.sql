-- Allow admin and manager to DELETE profiles via RLS.
-- Hard deletion is expected only for demo profiles (no auth.users, no schedule history
-- in most cases). Real employees should be soft-deleted by the app (is_active=false)
-- to preserve schedule history and rollups.

CREATE POLICY profiles_delete_admin ON profiles FOR DELETE
  USING (get_user_role() = ANY (ARRAY['admin'::user_role, 'manager'::user_role]));

-- Note on FK cascades (verified at time of writing this migration):
--   schedule_entries.employee_id            -> profiles(id) ON DELETE CASCADE (already set)
--   employee_secondary_positions.employee_id -> profiles(id) ON DELETE CASCADE (already set in 006)
--   notifications.user_id                   -> profiles(id) ON DELETE CASCADE (already set in 001)
-- No FK changes required in this migration.
