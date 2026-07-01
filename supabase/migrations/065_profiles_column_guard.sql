-- supabase/migrations/065_profiles_column_guard.sql
-- Módulo de perfil: columna avatar_url, guard de columnas auto-editables,
-- sync de email auth.users -> profiles, y bucket de avatares con RLS.
BEGIN;

-- 1) Columna para la foto de perfil (nullable, sin backfill).
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS avatar_url TEXT;

-- 2) Guard: un no-staff editando su propia fila solo puede tocar
--    first_name, last_name, phone, avatar_url (y updated_at).
CREATE OR REPLACE FUNCTION public.enforce_profile_self_update_columns()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor_role text;
BEGIN
  -- Bypass del sync interno de email (ver sync_profile_email).
  IF current_setting('app.syncing_email', true) = '1' THEN
    RETURN NEW;
  END IF;

  -- Operaciones de servicio sin JWT (triggers SECURITY DEFINER, service_role).
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  actor_role := public.get_user_role();

  -- Staff puede editar cualquier columna (flujo /employees).
  IF actor_role IN ('admin', 'manager', 'super_admin') THEN
    RETURN NEW;
  END IF;

  -- Editando la fila de OTRO: lo bloquea la RLS, no este guard.
  IF auth.uid() <> NEW.id THEN
    RETURN NEW;
  END IF;

  -- No-staff sobre su propia fila: allowlist future-proof.
  -- Solo puede cambiar first_name/last_name/phone/avatar_url.
  -- (updated_at lo actualiza el trigger set_updated_at, que corre antes; se excluye.)
  IF (to_jsonb(NEW) - ARRAY['first_name','last_name','phone','avatar_url','updated_at'])
     IS DISTINCT FROM
     (to_jsonb(OLD) - ARRAY['first_name','last_name','phone','avatar_url','updated_at']) THEN
    RAISE EXCEPTION 'No puedes modificar esos campos de tu perfil (solo nombre, apellido, teléfono y foto).';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_profile_self_update ON public.profiles;
CREATE TRIGGER trg_enforce_profile_self_update
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_profile_self_update_columns();

-- 3) Sync de email: cuando auth.users.email cambia (tras confirmar el link),
--    reflejarlo en profiles.email. Usa un flag local para saltar el guard.
CREATE OR REPLACE FUNCTION public.sync_profile_email()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.email IS DISTINCT FROM OLD.email THEN
    PERFORM set_config('app.syncing_email', '1', true);
    UPDATE public.profiles SET email = NEW.email, updated_at = now() WHERE id = NEW.id;
    PERFORM set_config('app.syncing_email', '0', true);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_profile_email ON auth.users;
CREATE TRIGGER trg_sync_profile_email
  AFTER UPDATE OF email ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_profile_email();

-- 4) Bucket de avatares (lectura pública).
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('avatars', 'avatars', true, 2097152, ARRAY['image/jpeg','image/png','image/webp'])
ON CONFLICT (id) DO UPDATE
  SET public = EXCLUDED.public,
      file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

-- 5) Políticas de storage.objects para el bucket avatars.
DROP POLICY IF EXISTS "avatars_public_read" ON storage.objects;
CREATE POLICY "avatars_public_read" ON storage.objects
  FOR SELECT USING (bucket_id = 'avatars');

DROP POLICY IF EXISTS "avatars_owner_insert" ON storage.objects;
CREATE POLICY "avatars_owner_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "avatars_owner_update" ON storage.objects;
CREATE POLICY "avatars_owner_update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text)
  WITH CHECK (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "avatars_owner_delete" ON storage.objects;
CREATE POLICY "avatars_owner_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);

COMMIT;
