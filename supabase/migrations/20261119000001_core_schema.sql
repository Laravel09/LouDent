-- ============================================================================
-- LouDent migration 1/5 — core schema
-- ----------------------------------------------------------------------------
-- Fresh PostgreSQL schema designed from the legacy MariaDB schema
-- (server/database/schema.sql + migrations/001). Differences from MariaDB:
--   * users/sessions/auth_tokens are replaced by Supabase Auth (auth.users).
--     No password, hash, salt or token is ever stored in public tables.
--   * public.profiles is the 1:1 application profile for each auth user.
--   * weekly_availability   -> public.dentist_schedules (same 0=Mon..6=Sun)
--   * services.involves_json -> JSONB
--   * clinic administrator: profiles.is_clinic_admin (was env CLINIC_ADMIN_DENTIST_IDS)
--   * new: appointment_history, audit_logs (append-only)
--   * double booking is prevented by a GiST EXCLUSION constraint, in addition
--     to the serialised checks inside the booking functions.
--
-- Safe to review/apply on a project that does not yet contain these objects.
-- Every CREATE uses IF NOT EXISTS / OR REPLACE; nothing is dropped.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS btree_gist WITH SCHEMA extensions;

-- ── dentists: professional profile (survives staff login re-creation) ──────
CREATE TABLE IF NOT EXISTS public.dentists (
  id               TEXT PRIMARY KEY CHECK (id ~ '^[a-z0-9][a-z0-9-]{1,39}$'),
  name             TEXT NOT NULL CHECK (char_length(name) BETWEEN 2 AND 150),
  title            TEXT NOT NULL DEFAULT '' CHECK (char_length(title) <= 80),
  specialty        TEXT NOT NULL DEFAULT '' CHECK (char_length(specialty) <= 160),
  experience_years SMALLINT NOT NULL DEFAULT 0 CHECK (experience_years BETWEEN 0 AND 80),
  bio              TEXT NOT NULL DEFAULT '' CHECK (char_length(bio) <= 4000),
  photo_url        TEXT CHECK (photo_url IS NULL OR photo_url ~ '^https://'),
  is_active        BOOLEAN NOT NULL DEFAULT TRUE,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── profiles: one row per auth.users row ───────────────────────────────────
CREATE TABLE IF NOT EXISTS public.profiles (
  id              UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role            TEXT NOT NULL DEFAULT 'patient' CHECK (role IN ('patient', 'dentist')),
  dentist_id      TEXT UNIQUE REFERENCES public.dentists(id) ON UPDATE CASCADE,
  full_name       TEXT NOT NULL DEFAULT '' CHECK (char_length(full_name) <= 150),
  email           TEXT NOT NULL DEFAULT '' CHECK (char_length(email) <= 254),
  phone           TEXT NOT NULL DEFAULT '' CHECK (char_length(phone) <= 40),
  is_clinic_admin BOOLEAN NOT NULL DEFAULT FALSE,
  -- Object path of the profile picture inside Storage ("<uid>/<file>").
  -- Patients: private bucket "avatars" (shown via short-lived signed URLs).
  -- Dentists: public bucket "dentist-photos" (shown on the public site).
  avatar_path     TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- A dentist login must point at a dentist profile; patients never do.
  CONSTRAINT profiles_role_dentist_link CHECK (
    (role = 'dentist' AND dentist_id IS NOT NULL) OR (role = 'patient' AND dentist_id IS NULL)
  ),
  -- Only dentists can hold the clinic-administrator privilege.
  CONSTRAINT profiles_admin_is_dentist CHECK (NOT is_clinic_admin OR role = 'dentist'),
  -- Pictures may only live in the account's own folder.
  CONSTRAINT profiles_avatar_own_folder CHECK (
    avatar_path IS NULL OR avatar_path ~ ('^' || id::text || '/[A-Za-z0-9._-]{1,100}$')
  )
);
CREATE INDEX IF NOT EXISTS idx_profiles_role ON public.profiles(role);
CREATE INDEX IF NOT EXISTS idx_profiles_email ON public.profiles(lower(email));

-- ── services ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.services (
  id               TEXT PRIMARY KEY CHECK (id ~ '^[a-z0-9][a-z0-9-]{1,79}$'),
  name             TEXT NOT NULL CHECK (char_length(name) BETWEEN 2 AND 180),
  category         TEXT NOT NULL CHECK (category IN ('General Dentistry', 'Orthodontics')),
  duration_minutes SMALLINT NOT NULL CHECK (duration_minutes BETWEEN 5 AND 480),
  price            NUMERIC(10,2) NOT NULL CHECK (price >= 0),
  icon             TEXT CHECK (icon IS NULL OR char_length(icon) <= 30),
  description      TEXT NOT NULL DEFAULT '' CHECK (char_length(description) <= 4000),
  preparation      TEXT NOT NULL DEFAULT '' CHECK (char_length(preparation) <= 4000),
  involves         JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(involves) = 'array'),
  is_active        BOOLEAN NOT NULL DEFAULT TRUE,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── dentist_services (M:N) ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.dentist_services (
  dentist_id TEXT NOT NULL REFERENCES public.dentists(id) ON DELETE CASCADE ON UPDATE CASCADE,
  service_id TEXT NOT NULL REFERENCES public.services(id) ON DELETE CASCADE ON UPDATE CASCADE,
  PRIMARY KEY (dentist_id, service_id)
);
CREATE INDEX IF NOT EXISTS idx_dentist_services_service ON public.dentist_services(service_id);

-- ── dentist_schedules (was weekly_availability) ────────────────────────────
CREATE TABLE IF NOT EXISTS public.dentist_schedules (
  dentist_id  TEXT NOT NULL REFERENCES public.dentists(id) ON DELETE CASCADE ON UPDATE CASCADE,
  day_of_week SMALLINT NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),  -- 0=Monday … 6=Sunday
  available   BOOLEAN NOT NULL DEFAULT FALSE,
  start_time  TIME NOT NULL DEFAULT '09:00',
  end_time    TIME NOT NULL DEFAULT '17:00',
  break_start TIME,
  break_end   TIME,
  PRIMARY KEY (dentist_id, day_of_week),
  CONSTRAINT dentist_schedules_valid CHECK (
    start_time < end_time
    AND ((break_start IS NULL) = (break_end IS NULL))
    AND (break_start IS NULL OR (start_time <= break_start AND break_start < break_end AND break_end <= end_time))
  )
);

-- ── blocked_dates ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.blocked_dates (
  dentist_id TEXT NOT NULL REFERENCES public.dentists(id) ON DELETE CASCADE ON UPDATE CASCADE,
  block_date DATE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (dentist_id, block_date)
);

-- ── appointments ───────────────────────────────────────────────────────────
-- appointment_date/start_time are Asia/Manila wall-clock values (the clinic's
-- local time), exactly as in the legacy system. "now" is always evaluated as
-- now() AT TIME ZONE 'Asia/Manila' so the server/browser timezone never matters.
CREATE TABLE IF NOT EXISTS public.appointments (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reference        TEXT NOT NULL UNIQUE,
  patient_id       UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  dentist_id       TEXT NOT NULL REFERENCES public.dentists(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  service_id       TEXT NOT NULL REFERENCES public.services(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  appointment_date DATE NOT NULL,
  start_time       TIME NOT NULL,
  duration_minutes SMALLINT NOT NULL CHECK (duration_minutes BETWEEN 5 AND 480),
  price            NUMERIC(10,2) NOT NULL CHECK (price >= 0),
  status           TEXT NOT NULL DEFAULT 'Pending'
                   CHECK (status IN ('Pending', 'Confirmed', 'Completed', 'Cancelled', 'Declined')),
  decline_reason   TEXT CHECK (decline_reason IS NULL OR char_length(decline_reason) <= 500),
  -- Reserved interval in Manila wall-clock time, used by the exclusion constraint.
  slot             TSRANGE GENERATED ALWAYS AS (
                     tsrange(appointment_date + start_time,
                             appointment_date + start_time + (duration_minutes * INTERVAL '1 minute'),
                             '[)')
                   ) STORED,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Two ACTIVE (Pending/Confirmed) appointments of the same dentist can never
-- overlap. Cancelled/Declined/Completed rows do not hold the slot, so cancelling
-- or declining releases the time automatically; history is kept.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'appointments_no_overlap') THEN
    ALTER TABLE public.appointments
      ADD CONSTRAINT appointments_no_overlap
      EXCLUDE USING gist (dentist_id WITH =, slot WITH &&)
      WHERE (status IN ('Pending', 'Confirmed'));
  END IF;
END$$;

CREATE INDEX IF NOT EXISTS idx_appointments_dentist_date ON public.appointments(dentist_id, appointment_date);
CREATE INDEX IF NOT EXISTS idx_appointments_patient ON public.appointments(patient_id, appointment_date);
CREATE INDEX IF NOT EXISTS idx_appointments_status ON public.appointments(status);

-- ── appointment_history (append-only) ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.appointment_history (
  id             BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  appointment_id UUID NOT NULL REFERENCES public.appointments(id) ON DELETE RESTRICT,
  action         TEXT NOT NULL,
  old_status     TEXT,
  new_status     TEXT,
  actor_id       UUID,             -- auth user id; no FK so history survives account deletion
  details        JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_appointment_history_appt ON public.appointment_history(appointment_id, created_at);

-- ── audit_logs (append-only) ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  actor_id    UUID,
  action      TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id   TEXT,
  details     JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON public.audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity ON public.audit_logs(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_actor ON public.audit_logs(actor_id);

-- ── updated_at maintenance ─────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.tg_set_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END$$;

DROP TRIGGER IF EXISTS set_updated_at ON public.profiles;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
DROP TRIGGER IF EXISTS set_updated_at ON public.dentists;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.dentists
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
DROP TRIGGER IF EXISTS set_updated_at ON public.services;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.services
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
DROP TRIGGER IF EXISTS set_updated_at ON public.appointments;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.appointments
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- ── New auth user -> profile ───────────────────────────────────────────────
-- SECURITY: role is ALWAYS 'patient'. Any role/admin value a visitor places in
-- signUp() metadata is ignored. Dentist logins are promoted only by the
-- service-role provisioning function (see migration 3).
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  INSERT INTO public.profiles (id, role, full_name, email, phone)
  VALUES (
    NEW.id,
    'patient',
    left(btrim(coalesce(NEW.raw_user_meta_data ->> 'full_name', '')), 150),
    lower(coalesce(NEW.email, '')),
    left(btrim(coalesce(NEW.raw_user_meta_data ->> 'phone', '')), 40)
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Keep profiles.email in sync when the address changes in Supabase Auth.
CREATE OR REPLACE FUNCTION public.handle_user_email_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NEW.email IS DISTINCT FROM OLD.email THEN
    UPDATE public.profiles SET email = lower(coalesce(NEW.email, '')) WHERE id = NEW.id;
  END IF;
  RETURN NEW;
END$$;

DROP TRIGGER IF EXISTS on_auth_user_email_changed ON auth.users;
CREATE TRIGGER on_auth_user_email_changed
  AFTER UPDATE OF email ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_user_email_change();
