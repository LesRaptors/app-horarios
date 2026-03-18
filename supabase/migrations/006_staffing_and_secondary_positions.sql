-- ============================================
-- Staffing Requirements & Employee Secondary Positions
-- ============================================

-- ============================================
-- TABLE: employee_secondary_positions
-- Positions an employee can cover beyond their primary position
-- ============================================
CREATE TABLE employee_secondary_positions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    employee_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    position_id UUID NOT NULL REFERENCES positions(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(employee_id, position_id)
);

CREATE INDEX idx_esp_employee ON employee_secondary_positions(employee_id);
CREATE INDEX idx_esp_position ON employee_secondary_positions(position_id);

-- RLS
ALTER TABLE employee_secondary_positions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "esp_select" ON employee_secondary_positions
    FOR SELECT USING (true);

CREATE POLICY "esp_insert" ON employee_secondary_positions
    FOR INSERT WITH CHECK (get_user_role() IN ('admin', 'manager'));

CREATE POLICY "esp_update" ON employee_secondary_positions
    FOR UPDATE USING (get_user_role() IN ('admin', 'manager'));

CREATE POLICY "esp_delete" ON employee_secondary_positions
    FOR DELETE USING (get_user_role() IN ('admin', 'manager'));

-- ============================================
-- TABLE: staffing_requirements
-- How many employees of each position are needed per shift per day of week
-- day_of_week uses JS convention: 0=Sunday, 1=Monday, ..., 6=Saturday
-- ============================================
CREATE TABLE staffing_requirements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    location_id UUID NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
    position_id UUID NOT NULL REFERENCES positions(id) ON DELETE CASCADE,
    shift_template_id UUID NOT NULL REFERENCES shift_templates(id) ON DELETE CASCADE,
    day_of_week INT NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
    required_count INT NOT NULL DEFAULT 1 CHECK (required_count >= 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(location_id, position_id, shift_template_id, day_of_week)
);

CREATE INDEX idx_sr_location ON staffing_requirements(location_id);
CREATE INDEX idx_sr_lookup ON staffing_requirements(location_id, day_of_week);

-- RLS
ALTER TABLE staffing_requirements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sr_select" ON staffing_requirements
    FOR SELECT USING (true);

CREATE POLICY "sr_insert" ON staffing_requirements
    FOR INSERT WITH CHECK (get_user_role() IN ('admin', 'manager'));

CREATE POLICY "sr_update" ON staffing_requirements
    FOR UPDATE USING (get_user_role() IN ('admin', 'manager'));

CREATE POLICY "sr_delete" ON staffing_requirements
    FOR DELETE USING (get_user_role() IN ('admin', 'manager'));

-- Updated_at trigger
CREATE TRIGGER set_updated_at BEFORE UPDATE ON staffing_requirements
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
