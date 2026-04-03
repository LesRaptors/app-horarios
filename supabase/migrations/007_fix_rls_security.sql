-- ============================================
-- Fix RLS Security Policies + Add Indexes
-- ============================================

-- ============================================
-- 1. Fix profiles_update_own
--    Employees could update ANY column (including role).
--    Restrict employees to only updating their phone field.
-- ============================================
DROP POLICY IF EXISTS "profiles_update_own" ON profiles;

CREATE POLICY "profiles_update_own" ON profiles
    FOR UPDATE
    USING (id = auth.uid() AND get_user_role() = 'employee')
    WITH CHECK (
        id = auth.uid()
        AND get_user_role() = 'employee'
        -- Only allow updating phone; all other columns must remain unchanged
        AND first_name IS NOT DISTINCT FROM (SELECT p.first_name FROM profiles p WHERE p.id = auth.uid())
        AND last_name IS NOT DISTINCT FROM (SELECT p.last_name FROM profiles p WHERE p.id = auth.uid())
        AND email IS NOT DISTINCT FROM (SELECT p.email FROM profiles p WHERE p.id = auth.uid())
        AND role IS NOT DISTINCT FROM (SELECT p.role FROM profiles p WHERE p.id = auth.uid())
        AND location_id IS NOT DISTINCT FROM (SELECT p.location_id FROM profiles p WHERE p.id = auth.uid())
        AND position_id IS NOT DISTINCT FROM (SELECT p.position_id FROM profiles p WHERE p.id = auth.uid())
        AND max_hours_per_week IS NOT DISTINCT FROM (SELECT p.max_hours_per_week FROM profiles p WHERE p.id = auth.uid())
        AND is_active IS NOT DISTINCT FROM (SELECT p.is_active FROM profiles p WHERE p.id = auth.uid())
    );

-- ============================================
-- 2. Fix profiles_insert
--    Was WITH CHECK (true) — any user could insert profiles with any role.
--    Profile creation is handled by a trigger on auth.users (SECURITY DEFINER).
-- ============================================
DROP POLICY IF EXISTS "profiles_insert" ON profiles;

CREATE POLICY "profiles_insert" ON profiles
    FOR INSERT WITH CHECK (false);

-- ============================================
-- 3. Fix notifications_insert
--    Was WITH CHECK (true) — any user could insert notifications for others.
--    Users can only create notifications for themselves.
--    System notifications use service_role which bypasses RLS.
-- ============================================
DROP POLICY IF EXISTS "notifications_insert" ON notifications;

CREATE POLICY "notifications_insert" ON notifications
    FOR INSERT WITH CHECK (user_id = auth.uid());

-- ============================================
-- 4. Fix SECURITY DEFINER functions
--    Add SET search_path = public to prevent search_path hijacking.
-- ============================================
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

-- ============================================
-- 5. Add missing database indexes
-- ============================================
CREATE INDEX IF NOT EXISTS idx_schedule_entries_schedule_employee
    ON schedule_entries (schedule_id, employee_id);

CREATE INDEX IF NOT EXISTS idx_schedule_entries_schedule_date
    ON schedule_entries (schedule_id, date);

CREATE INDEX IF NOT EXISTS idx_shift_swap_requests_status
    ON shift_swap_requests (status);

CREATE INDEX IF NOT EXISTS idx_time_off_requests_employee_status
    ON time_off_requests (employee_id, status);

CREATE INDEX IF NOT EXISTS idx_profiles_location_active
    ON profiles (location_id, is_active);
