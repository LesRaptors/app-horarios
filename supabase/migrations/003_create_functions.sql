-- ============================================
-- Database Functions
-- ============================================

-- Function to create a notification
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
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger: notify employees when schedule is published
CREATE OR REPLACE FUNCTION notify_schedule_published()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.status = 'published' AND (OLD.status IS NULL OR OLD.status != 'published') THEN
        -- Notify all employees who have entries in this schedule
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
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_schedule_published
    AFTER UPDATE ON schedules
    FOR EACH ROW EXECUTE FUNCTION notify_schedule_published();

-- Trigger: notify when time off request is reviewed
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
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_time_off_reviewed
    AFTER UPDATE ON time_off_requests
    FOR EACH ROW EXECUTE FUNCTION notify_time_off_reviewed();

-- Trigger: notify when swap request is created
CREATE OR REPLACE FUNCTION notify_swap_request()
RETURNS TRIGGER AS $$
DECLARE
    v_requester_name TEXT;
BEGIN
    SELECT first_name || ' ' || last_name INTO v_requester_name
    FROM profiles WHERE id = NEW.requester_id;

    -- Notify target employee
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
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_swap_request_created
    AFTER INSERT ON shift_swap_requests
    FOR EACH ROW EXECUTE FUNCTION notify_swap_request();
