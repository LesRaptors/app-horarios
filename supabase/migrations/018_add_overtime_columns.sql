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
