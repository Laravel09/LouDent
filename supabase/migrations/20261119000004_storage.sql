-- ============================================================================
-- LouDent migration 4/5 — Supabase Storage (profile pictures)
-- ----------------------------------------------------------------------------
-- Inspection of the legacy app: patient photos were only ever shown to the
-- patient themself; dentist photos are shown on the public landing/dentist
-- pages. Therefore:
--   avatars         PRIVATE  patient pictures, read via short-lived signed URLs
--   dentist-photos  PUBLIC   dentist pictures (public read, owner-only write)
-- Both: JPEG/PNG/WebP only, 1 MB max (the app resizes to 256x256 before upload),
-- objects must live under "<auth.uid()>/…" so nobody can overwrite another
-- user's file.
-- ============================================================================

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  ('avatars',        'avatars',        false, 1048576, ARRAY['image/jpeg', 'image/png', 'image/webp']),
  ('dentist-photos', 'dentist-photos', true,  1048576, ARRAY['image/jpeg', 'image/png', 'image/webp'])
ON CONFLICT (id) DO NOTHING;

DO $$
DECLARE p text;
BEGIN
  FOREACH p IN ARRAY ARRAY['ld_avatars_select_own', 'ld_avatars_insert_own', 'ld_avatars_update_own',
                           'ld_avatars_delete_own', 'ld_dentist_photos_select_own', 'ld_dentist_photos_insert_own',
                           'ld_dentist_photos_update_own', 'ld_dentist_photos_delete_own']
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON storage.objects', p);
  END LOOP;
END$$;

-- Private patient pictures: owner only.
CREATE POLICY ld_avatars_select_own ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY ld_avatars_insert_own ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text
              AND name ~ '^[0-9a-f-]{36}/[A-Za-z0-9._-]{1,100}$');
CREATE POLICY ld_avatars_update_own ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text)
  WITH CHECK (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY ld_avatars_delete_own ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);

-- Public dentist pictures: anyone can view through the public URL (public
-- bucket); only the dentist can write inside their own folder. The SELECT
-- policy only lets the owner list their folder (needed to remove old files).
CREATE POLICY ld_dentist_photos_select_own ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'dentist-photos' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY ld_dentist_photos_insert_own ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'dentist-photos' AND (storage.foldername(name))[1] = auth.uid()::text
              AND private.current_app_role() = 'dentist'
              AND name ~ '^[0-9a-f-]{36}/[A-Za-z0-9._-]{1,100}$');
CREATE POLICY ld_dentist_photos_update_own ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'dentist-photos' AND (storage.foldername(name))[1] = auth.uid()::text
         AND private.current_app_role() = 'dentist')
  WITH CHECK (bucket_id = 'dentist-photos' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY ld_dentist_photos_delete_own ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'dentist-photos' AND (storage.foldername(name))[1] = auth.uid()::text
         AND private.current_app_role() = 'dentist');
