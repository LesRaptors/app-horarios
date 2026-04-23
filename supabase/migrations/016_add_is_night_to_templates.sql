ALTER TABLE shift_templates ADD COLUMN is_night BOOLEAN NOT NULL DEFAULT false;

UPDATE shift_templates
SET is_night = true
WHERE
  end_time < start_time
  OR start_time >= '21:00:00'
  OR end_time <= '06:00:00'
  OR start_time < '06:00:00';
