-- ============================================
-- Row Level Security Policies
-- ============================================

-- Enable RLS on all tables
ALTER TABLE locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE departments ENABLE ROW LEVEL SECURITY;
ALTER TABLE positions ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE shift_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE schedule_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE time_off_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE shift_swap_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- ============================================
-- Helper function: get current user's role
-- ============================================
CREATE OR REPLACE FUNCTION get_user_role()
RETURNS user_role AS $$
    SELECT role FROM profiles WHERE id = auth.uid();
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Helper function: get current user's location_id
CREATE OR REPLACE FUNCTION get_user_location_id()
RETURNS UUID AS $$
    SELECT location_id FROM profiles WHERE id = auth.uid();
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- ============================================
-- LOCATIONS
-- ============================================
-- Everyone can read locations
CREATE POLICY "locations_select" ON locations
    FOR SELECT USING (true);

-- Only admins can insert/update/delete
CREATE POLICY "locations_insert" ON locations
    FOR INSERT WITH CHECK (get_user_role() = 'admin');

CREATE POLICY "locations_update" ON locations
    FOR UPDATE USING (get_user_role() = 'admin');

CREATE POLICY "locations_delete" ON locations
    FOR DELETE USING (get_user_role() = 'admin');

-- ============================================
-- DEPARTMENTS
-- ============================================
CREATE POLICY "departments_select" ON departments
    FOR SELECT USING (true);

CREATE POLICY "departments_insert" ON departments
    FOR INSERT WITH CHECK (get_user_role() IN ('admin', 'manager'));

CREATE POLICY "departments_update" ON departments
    FOR UPDATE USING (get_user_role() IN ('admin', 'manager'));

CREATE POLICY "departments_delete" ON departments
    FOR DELETE USING (get_user_role() = 'admin');

-- ============================================
-- POSITIONS
-- ============================================
CREATE POLICY "positions_select" ON positions
    FOR SELECT USING (true);

CREATE POLICY "positions_insert" ON positions
    FOR INSERT WITH CHECK (get_user_role() IN ('admin', 'manager'));

CREATE POLICY "positions_update" ON positions
    FOR UPDATE USING (get_user_role() IN ('admin', 'manager'));

CREATE POLICY "positions_delete" ON positions
    FOR DELETE USING (get_user_role() = 'admin');

-- ============================================
-- PROFILES
-- ============================================
-- Users can see all profiles (needed for schedule views)
CREATE POLICY "profiles_select" ON profiles
    FOR SELECT USING (true);

-- Users can update their own profile (limited fields via app logic)
CREATE POLICY "profiles_update_own" ON profiles
    FOR UPDATE USING (id = auth.uid());

-- Admins and managers can update profiles
CREATE POLICY "profiles_update_admin" ON profiles
    FOR UPDATE USING (get_user_role() IN ('admin', 'manager'));

-- Only admins can insert (create employees)
CREATE POLICY "profiles_insert" ON profiles
    FOR INSERT WITH CHECK (true); -- Handled by trigger on auth.users

-- ============================================
-- SHIFT TEMPLATES
-- ============================================
CREATE POLICY "shift_templates_select" ON shift_templates
    FOR SELECT USING (true);

CREATE POLICY "shift_templates_insert" ON shift_templates
    FOR INSERT WITH CHECK (get_user_role() IN ('admin', 'manager'));

CREATE POLICY "shift_templates_update" ON shift_templates
    FOR UPDATE USING (get_user_role() IN ('admin', 'manager'));

CREATE POLICY "shift_templates_delete" ON shift_templates
    FOR DELETE USING (get_user_role() IN ('admin', 'manager'));

-- ============================================
-- SCHEDULES
-- ============================================
-- Employees can only see published schedules
CREATE POLICY "schedules_select" ON schedules
    FOR SELECT USING (
        get_user_role() IN ('admin', 'manager')
        OR status = 'published'
    );

CREATE POLICY "schedules_insert" ON schedules
    FOR INSERT WITH CHECK (get_user_role() IN ('admin', 'manager'));

CREATE POLICY "schedules_update" ON schedules
    FOR UPDATE USING (get_user_role() IN ('admin', 'manager'));

CREATE POLICY "schedules_delete" ON schedules
    FOR DELETE USING (get_user_role() = 'admin');

-- ============================================
-- SCHEDULE ENTRIES
-- ============================================
-- Employees can see their own entries from published schedules
CREATE POLICY "schedule_entries_select" ON schedule_entries
    FOR SELECT USING (
        get_user_role() IN ('admin', 'manager')
        OR (
            employee_id = auth.uid()
            AND EXISTS (
                SELECT 1 FROM schedules
                WHERE schedules.id = schedule_entries.schedule_id
                AND schedules.status = 'published'
            )
        )
    );

CREATE POLICY "schedule_entries_insert" ON schedule_entries
    FOR INSERT WITH CHECK (get_user_role() IN ('admin', 'manager'));

CREATE POLICY "schedule_entries_update" ON schedule_entries
    FOR UPDATE USING (get_user_role() IN ('admin', 'manager'));

CREATE POLICY "schedule_entries_delete" ON schedule_entries
    FOR DELETE USING (get_user_role() IN ('admin', 'manager'));

-- ============================================
-- TIME OFF REQUESTS
-- ============================================
-- Users see their own requests; admins/managers see all
CREATE POLICY "time_off_select" ON time_off_requests
    FOR SELECT USING (
        employee_id = auth.uid()
        OR get_user_role() IN ('admin', 'manager')
    );

-- Any authenticated user can create requests
CREATE POLICY "time_off_insert" ON time_off_requests
    FOR INSERT WITH CHECK (employee_id = auth.uid());

-- Admins and managers can update (approve/reject)
CREATE POLICY "time_off_update" ON time_off_requests
    FOR UPDATE USING (get_user_role() IN ('admin', 'manager'));

-- ============================================
-- SHIFT SWAP REQUESTS
-- ============================================
CREATE POLICY "swap_select" ON shift_swap_requests
    FOR SELECT USING (
        requester_id = auth.uid()
        OR target_id = auth.uid()
        OR get_user_role() IN ('admin', 'manager')
    );

CREATE POLICY "swap_insert" ON shift_swap_requests
    FOR INSERT WITH CHECK (requester_id = auth.uid());

-- Target can accept/reject; manager can approve
CREATE POLICY "swap_update" ON shift_swap_requests
    FOR UPDATE USING (
        target_id = auth.uid()
        OR get_user_role() IN ('admin', 'manager')
    );

-- ============================================
-- NOTIFICATIONS
-- ============================================
-- Users can only see their own notifications
CREATE POLICY "notifications_select" ON notifications
    FOR SELECT USING (user_id = auth.uid());

-- System inserts notifications (via service role or triggers)
CREATE POLICY "notifications_insert" ON notifications
    FOR INSERT WITH CHECK (true);

-- Users can mark their own notifications as read
CREATE POLICY "notifications_update" ON notifications
    FOR UPDATE USING (user_id = auth.uid());
