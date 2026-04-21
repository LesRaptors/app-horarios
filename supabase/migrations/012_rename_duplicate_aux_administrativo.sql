-- Disambiguate duplicate 'Aux. Administrativo' positions by including department in the name.
-- Without this, the auto-generate dialog shows two identical pills the user cannot distinguish.

UPDATE positions
SET name = 'Aux. Administrativo (Farmacia)'
WHERE id = 'c0000000-0000-0000-0000-000000000004';

UPDATE positions
SET name = 'Aux. Administrativo (Recepción)'
WHERE id = 'c0000000-0000-0000-0000-000000000003';
