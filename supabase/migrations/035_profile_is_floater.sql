ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS is_floater BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN profiles.is_floater IS
  'Empleado supernumerario: el motor lo usa solo cuando primarios saturan. Sus secondary_positions definen qué cubre.';
