-- ============================================================================
-- LouDent migration 2/5 — access control: grants, RLS, protection, audit
-- ----------------------------------------------------------------------------
-- Model
--   anon            : read public catalogue (dentists, services, schedules,
--                     blocked dates). Nothing else.
--   authenticated   : patient or dentist, decided ONLY by public.profiles.role
--                     (never by JWT metadata or request parameters).
--   clinic admin    : dentist with profiles.is_clinic_admin = true (Dr. Santos).
--   service_role    : server-side only (Edge Function / SQL editor).
--
-- All writes to appointments, schedules, blocked dates, profiles and dentists
-- go through SECURITY DEFINER functions (migration 3) that verify auth.uid(),
-- the caller's role and the business rules. Table-level INSERT/UPDATE/DELETE
-- privileges are revoked from anon/authenticated, so RLS is a second layer and
-- not the only one. The only direct writes allowed from the browser are
-- clinic-admin edits of services and dentist_services (guarded by RLS and
-- recorded by audit triggers).
--
-- Extensibility: a future receptionist/admin role = new value in the
-- profiles.role CHECK + a new private.has_permission() branch. Policies call
-- the private.* helpers rather than testing literals everywhere.
-- ============================================================================

CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC;
GRANT USAGE ON SCHEMA private TO anon, authenticated, service_role;

-- ── helpers (SECURITY DEFINER: read profiles without re-entering RLS) ──────
CREATE OR REPLACE FUNCTION private.current_app_role()
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT p.role FROM public.profiles p WHERE p.id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION private.current_dentist_id()
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT p.dentist_id FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'dentist';
$$;

CREATE OR REPLACE FUNCTION private.is_clinic_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT coalesce(
    (SELECT p.is_clinic_admin FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'dentist'),
    false);
$$;

-- Single permission switchboard (extend here for future roles).
CREATE OR REPLACE FUNCTION private.has_permission(p_permission text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT CASE p_permission
    WHEN 'clinic.manage_all_appointments' THEN private.is_clinic_admin()
    WHEN 'clinic.manage_services'         THEN private.is_clinic_admin()
    WHEN 'clinic.manage_all_schedules'    THEN private.is_clinic_admin()
    WHEN 'clinic.provision_staff'         THEN private.is_clinic_admin()
    WHEN 'clinic.view_audit'              THEN private.is_clinic_admin()
    ELSE false
  END;
$$;

-- May the caller manage this dentist's schedule / blocked dates / profile?
CREATE OR REPLACE FUNCTION private.can_manage_dentist(p_dentist_id text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT p_dentist_id IS NOT NULL AND (
    private.current_dentist_id() = p_dentist_id
    OR private.has_permission('clinic.manage_all_schedules'));
$$;

REVOKE ALL ON ALL FUNCTIONS IN SCHEMA private FROM PUBLIC;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA private TO anon, authenticated, service_role;

-- ── table privileges ───────────────────────────────────────────────────────
REVOKE ALL ON public.profiles, public.dentists, public.services, public.dentist_services,
              public.dentist_schedules, public.blocked_dates, public.appointments,
              public.appointment_history, public.audit_logs
  FROM anon, authenticated;

GRANT SELECT ON public.dentists, public.services, public.dentist_services,
                public.dentist_schedules, public.blocked_dates
  TO anon, authenticated;
GRANT SELECT ON public.profiles, public.appointments, public.appointment_history, public.audit_logs
  TO authenticated;
-- Clinic-admin catalogue editing (RLS below restricts it to the admin).
GRANT INSERT, UPDATE, DELETE ON public.services, public.dentist_services TO authenticated;

GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;

-- ── enable RLS everywhere ──────────────────────────────────────────────────
ALTER TABLE public.profiles            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dentists            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.services            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dentist_services    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dentist_schedules   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.blocked_dates       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.appointments        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.appointment_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs          ENABLE ROW LEVEL SECURITY;

-- Policies are (re)created idempotently.
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT policyname, tablename FROM pg_policies
           WHERE schemaname = 'public' AND policyname LIKE 'ld\_%' ESCAPE '\'
  LOOP
    EXECUTE format('DROP POLICY %I ON public.%I', r.policyname, r.tablename);
  END LOOP;
END$$;

-- profiles
CREATE POLICY ld_profiles_select_self ON public.profiles
  FOR SELECT TO authenticated USING (id = auth.uid());
CREATE POLICY ld_profiles_select_admin ON public.profiles
  FOR SELECT TO authenticated USING (private.has_permission('clinic.manage_all_appointments'));
-- A dentist may see the profile of patients who booked with them (name/contact for the visit).
CREATE POLICY ld_profiles_select_own_patients ON public.profiles
  FOR SELECT TO authenticated USING (
    role = 'patient'
    AND private.current_dentist_id() IS NOT NULL
    AND EXISTS (SELECT 1 FROM public.appointments a
                WHERE a.patient_id = profiles.id AND a.dentist_id = private.current_dentist_id()));
-- Everyone may see dentist logins' display data? No: dentist public data lives in public.dentists.

-- catalogue (public read)
CREATE POLICY ld_dentists_read ON public.dentists
  FOR SELECT TO anon, authenticated USING (is_active OR private.can_manage_dentist(id));
CREATE POLICY ld_services_read ON public.services
  FOR SELECT TO anon, authenticated USING (is_active OR private.has_permission('clinic.manage_services'));
CREATE POLICY ld_services_admin_insert ON public.services
  FOR INSERT TO authenticated WITH CHECK (private.has_permission('clinic.manage_services'));
CREATE POLICY ld_services_admin_update ON public.services
  FOR UPDATE TO authenticated USING (private.has_permission('clinic.manage_services'))
  WITH CHECK (private.has_permission('clinic.manage_services'));
CREATE POLICY ld_services_admin_delete ON public.services
  FOR DELETE TO authenticated USING (private.has_permission('clinic.manage_services'));
CREATE POLICY ld_dentist_services_read ON public.dentist_services
  FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY ld_dentist_services_admin_insert ON public.dentist_services
  FOR INSERT TO authenticated WITH CHECK (private.has_permission('clinic.manage_services'));
CREATE POLICY ld_dentist_services_admin_delete ON public.dentist_services
  FOR DELETE TO authenticated USING (private.has_permission('clinic.manage_services'));
CREATE POLICY ld_schedules_read ON public.dentist_schedules
  FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY ld_blocked_read ON public.blocked_dates
  FOR SELECT TO anon, authenticated USING (true);

-- appointments (read only; writes via functions)
CREATE POLICY ld_appointments_patient ON public.appointments
  FOR SELECT TO authenticated USING (patient_id = auth.uid());
CREATE POLICY ld_appointments_dentist ON public.appointments
  FOR SELECT TO authenticated USING (dentist_id = private.current_dentist_id());
CREATE POLICY ld_appointments_admin ON public.appointments
  FOR SELECT TO authenticated USING (private.has_permission('clinic.manage_all_appointments'));

-- appointment history: visible to whoever can see the appointment
CREATE POLICY ld_history_read ON public.appointment_history
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.appointments a WHERE a.id = appointment_history.appointment_id));

-- audit logs: clinic administrator only
CREATE POLICY ld_audit_read ON public.audit_logs
  FOR SELECT TO authenticated USING (private.has_permission('clinic.view_audit'));

-- ── append-only enforcement (even for privileged SQL by mistake) ───────────
CREATE OR REPLACE FUNCTION private.tg_append_only()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  RAISE EXCEPTION '% is append-only', TG_TABLE_NAME USING ERRCODE = '42501';
END$$;

DROP TRIGGER IF EXISTS append_only ON public.audit_logs;
CREATE TRIGGER append_only BEFORE UPDATE OR DELETE ON public.audit_logs
  FOR EACH ROW EXECUTE FUNCTION private.tg_append_only();
DROP TRIGGER IF EXISTS append_only ON public.appointment_history;
CREATE TRIGGER append_only BEFORE UPDATE OR DELETE ON public.appointment_history
  FOR EACH ROW EXECUTE FUNCTION private.tg_append_only();

-- ── profile privilege protection (defence in depth) ────────────────────────
-- Even if a grant were added by mistake later, an API caller can never change
-- role / admin flag / dentist link / email of a profile.
CREATE OR REPLACE FUNCTION private.tg_protect_profile()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF current_user IN ('anon', 'authenticated') AND (
       NEW.role IS DISTINCT FROM OLD.role
    OR NEW.is_clinic_admin IS DISTINCT FROM OLD.is_clinic_admin
    OR NEW.dentist_id IS DISTINCT FROM OLD.dentist_id
    OR NEW.email IS DISTINCT FROM OLD.email
    OR NEW.id IS DISTINCT FROM OLD.id) THEN
    RAISE EXCEPTION 'Not allowed to change account privileges' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END$$;

DROP TRIGGER IF EXISTS protect_profile ON public.profiles;
CREATE TRIGGER protect_profile BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION private.tg_protect_profile();

-- ── audit triggers for configuration tables ────────────────────────────────
CREATE OR REPLACE FUNCTION private.write_audit(p_action text, p_entity_type text, p_entity_id text, p_details jsonb)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
  INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, details)
  VALUES (auth.uid(), p_action, p_entity_type, p_entity_id, coalesce(p_details, '{}'::jsonb));
$$;
REVOKE ALL ON FUNCTION private.write_audit(text, text, text, jsonb) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION private.tg_audit_config()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_old jsonb := CASE WHEN TG_OP <> 'INSERT' THEN to_jsonb(OLD) END;
  v_new jsonb := CASE WHEN TG_OP <> 'DELETE' THEN to_jsonb(NEW) END;
  v_row jsonb := coalesce(v_new, v_old);
  v_id  text;
  -- long text fields are not copied into the audit trail
  v_strip text[] := ARRAY['bio', 'description', 'preparation', 'involves', 'created_at', 'updated_at', 'photo_url'];
BEGIN
  IF TG_TABLE_NAME = 'profiles' THEN
    -- only privilege changes of profiles are audited
    IF TG_OP <> 'UPDATE' OR (
         NEW.role IS NOT DISTINCT FROM OLD.role
     AND NEW.is_clinic_admin IS NOT DISTINCT FROM OLD.is_clinic_admin
     AND NEW.dentist_id IS NOT DISTINCT FROM OLD.dentist_id) THEN
      RETURN NULL;
    END IF;
    v_old := jsonb_build_object('role', OLD.role, 'is_clinic_admin', OLD.is_clinic_admin, 'dentist_id', OLD.dentist_id);
    v_new := jsonb_build_object('role', NEW.role, 'is_clinic_admin', NEW.is_clinic_admin, 'dentist_id', NEW.dentist_id);
    v_id := NEW.id::text;
  ELSE
    v_old := v_old - v_strip;
    v_new := v_new - v_strip;
    v_id := coalesce(v_row ->> 'id', v_row ->> 'dentist_id');
    IF TG_OP = 'UPDATE' AND v_old = v_new THEN
      RETURN NULL;  -- no meaningful change (e.g. an unchanged schedule day re-saved)
    END IF;
  END IF;
  PERFORM private.write_audit(TG_TABLE_NAME || '.' || lower(TG_OP), TG_TABLE_NAME, v_id,
                              jsonb_strip_nulls(jsonb_build_object('old', v_old, 'new', v_new)));
  RETURN NULL;
END$$;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['services', 'dentist_services', 'dentist_schedules', 'blocked_dates', 'dentists', 'profiles']
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS audit_config ON public.%I', t);
    EXECUTE format('CREATE TRIGGER audit_config AFTER INSERT OR UPDATE OR DELETE ON public.%I
                    FOR EACH ROW EXECUTE FUNCTION private.tg_audit_config()', t);
  END LOOP;
END$$;
