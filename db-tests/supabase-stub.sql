-- Minimal local stand-in for the parts of the Supabase platform that the
-- LouDent migrations depend on. Used ONLY by the isolated database tests
-- (db-tests/*.test.mjs) running on a throw-away embedded PostgreSQL.
-- It mirrors Supabase conventions: roles anon/authenticated/service_role,
-- auth.users + auth.uid() reading request.jwt.claims, storage.buckets/objects
-- + storage.foldername(), default privileges on schema public.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon NOLOGIN NOINHERIT; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated NOLOGIN NOINHERIT; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN CREATE ROLE service_role NOLOGIN NOINHERIT BYPASSRLS; END IF;
  -- Non-superuser owner of the application schema, like "postgres" on Supabase.
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_owner') THEN CREATE ROLE app_owner NOLOGIN CREATEROLE; END IF;
END$$;

DO $$ BEGIN EXECUTE format('GRANT CREATE ON DATABASE %I TO app_owner', current_database()); END$$;
ALTER SCHEMA public OWNER TO app_owner;
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

CREATE SCHEMA IF NOT EXISTS extensions AUTHORIZATION app_owner;
GRANT USAGE ON SCHEMA extensions TO anon, authenticated, service_role;

-- ── auth ──
CREATE SCHEMA IF NOT EXISTS auth AUTHORIZATION app_owner;
GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;
CREATE TABLE IF NOT EXISTS auth.users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text UNIQUE,
  email_confirmed_at timestamptz,
  raw_user_meta_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE auth.users OWNER TO app_owner;

CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT nullif(coalesce(current_setting('request.jwt.claim.sub', true),
                         (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')), '')::uuid;
$$;
ALTER FUNCTION auth.uid() OWNER TO app_owner;
GRANT EXECUTE ON FUNCTION auth.uid() TO anon, authenticated, service_role;

-- ── storage ──
CREATE SCHEMA IF NOT EXISTS storage AUTHORIZATION app_owner;
GRANT USAGE ON SCHEMA storage TO anon, authenticated, service_role;
CREATE TABLE IF NOT EXISTS storage.buckets (
  id text PRIMARY KEY, name text NOT NULL, public boolean DEFAULT false,
  file_size_limit bigint, allowed_mime_types text[]
);
CREATE TABLE IF NOT EXISTS storage.objects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bucket_id text REFERENCES storage.buckets(id),
  name text NOT NULL,
  owner uuid DEFAULT auth.uid(),
  UNIQUE (bucket_id, name)
);
ALTER TABLE storage.buckets OWNER TO app_owner;
ALTER TABLE storage.objects OWNER TO app_owner;
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON storage.objects TO authenticated, service_role;
GRANT SELECT ON storage.buckets TO anon, authenticated, service_role;
CREATE OR REPLACE FUNCTION storage.foldername(name text) RETURNS text[] LANGUAGE sql IMMUTABLE AS $$
  SELECT (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1];
$$;
ALTER FUNCTION storage.foldername(text) OWNER TO app_owner;

-- Supabase default privileges for objects created by the owner in public.
ALTER DEFAULT PRIVILEGES FOR ROLE app_owner IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE app_owner IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE app_owner IN SCHEMA public GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;
