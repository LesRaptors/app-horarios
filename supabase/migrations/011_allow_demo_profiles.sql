-- Allow profiles rows without a matching auth.users entry (demo employees).
-- The FK introduced in 001_create_tables.sql blocked inserts for demo profiles,
-- which by design have no auth.users row. Replace the FK cascade with a trigger
-- that preserves the original "delete auth.users → delete profile" behavior.

ALTER TABLE profiles DROP CONSTRAINT profiles_id_fkey;

CREATE OR REPLACE FUNCTION delete_profile_on_auth_user_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM profiles WHERE id = OLD.id;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_deleted ON auth.users;
CREATE TRIGGER on_auth_user_deleted
  AFTER DELETE ON auth.users
  FOR EACH ROW EXECUTE FUNCTION delete_profile_on_auth_user_delete();
