-- ============================================
-- Seed Data for Development
-- ============================================

-- Create an admin user via Supabase Auth
-- Note: The admin user needs to be created via the auth API (signup).
-- This seed creates the profile data that will be linked.
-- First register the user at http://localhost:3000/login or via API.

-- We'll insert sample locations, departments, positions, and shift templates
-- that can be used once users are created.

-- Sample Locations
INSERT INTO locations (id, name, address) VALUES
    ('a0000000-0000-0000-0000-000000000001', 'Sede Central', 'Calle Principal 123, Ciudad'),
    ('a0000000-0000-0000-0000-000000000002', 'Sede Norte', 'Av. Norte 456, Ciudad');

-- Sample Departments
INSERT INTO departments (id, location_id, name) VALUES
    ('b0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'Operaciones'),
    ('b0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', 'Administración'),
    ('b0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000002', 'Operaciones');

-- Sample Positions
INSERT INTO positions (id, department_id, name, color) VALUES
    ('c0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 'Supervisor', '#ef4444'),
    ('c0000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-000000000001', 'Operador', '#3b82f6'),
    ('c0000000-0000-0000-0000-000000000003', 'b0000000-0000-0000-0000-000000000001', 'Asistente', '#22c55e'),
    ('c0000000-0000-0000-0000-000000000004', 'b0000000-0000-0000-0000-000000000002', 'Recepcionista', '#f59e0b'),
    ('c0000000-0000-0000-0000-000000000005', 'b0000000-0000-0000-0000-000000000003', 'Supervisor', '#ef4444'),
    ('c0000000-0000-0000-0000-000000000006', 'b0000000-0000-0000-0000-000000000003', 'Operador', '#3b82f6');

-- Sample Shift Templates
INSERT INTO shift_templates (id, name, start_time, end_time, break_minutes, color, location_id) VALUES
    ('d0000000-0000-0000-0000-000000000001', 'Mañana', '06:00', '14:00', 30, '#f59e0b', 'a0000000-0000-0000-0000-000000000001'),
    ('d0000000-0000-0000-0000-000000000002', 'Tarde', '14:00', '22:00', 30, '#3b82f6', 'a0000000-0000-0000-0000-000000000001'),
    ('d0000000-0000-0000-0000-000000000003', 'Noche', '22:00', '06:00', 30, '#6366f1', 'a0000000-0000-0000-0000-000000000001'),
    ('d0000000-0000-0000-0000-000000000004', 'Jornada completa', '08:00', '17:00', 60, '#22c55e', 'a0000000-0000-0000-0000-000000000001'),
    ('d0000000-0000-0000-0000-000000000005', 'Mañana', '06:00', '14:00', 30, '#f59e0b', 'a0000000-0000-0000-0000-000000000002'),
    ('d0000000-0000-0000-0000-000000000006', 'Tarde', '14:00', '22:00', 30, '#3b82f6', 'a0000000-0000-0000-0000-000000000002');
