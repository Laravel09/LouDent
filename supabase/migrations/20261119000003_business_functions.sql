-- ============================================================================
-- LouDent migration 3/5 — business operations (RPC)
-- ----------------------------------------------------------------------------
-- Ported from the legacy Express handlers in server/src/app.js and core.js.
-- Every function: verifies auth.uid(), loads the caller's role from
-- public.profiles (never from parameters/JWT metadata), validates input,
-- applies the business rule, writes appointment_history / audit_logs.
--
-- Errors are raised with SQLSTATE P0001 and a HINT carrying a machine code
-- (e.g. SLOT_TAKEN, EMAIL_NOT_VERIFIED) that the frontend maps to messages.
-- ============================================================================

-- ── internal helpers ───────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION private.manila_now()
RETURNS timestamp LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT (now() AT TIME ZONE 'Asia/Manila');
$$;

-- Fixed bookable start times (legacy core.js SLOTS).
CREATE OR REPLACE FUNCTION private.booking_slots()
RETURNS time[] LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT ARRAY['09:00','10:00','11:00','13:00','14:00','15:00','16:00']::time[];
$$;

CREATE OR REPLACE FUNCTION private.fail(p_message text, p_code text)
RETURNS void LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  RAISE EXCEPTION USING MESSAGE = p_message, ERRCODE = 'P0001', HINT = p_code;
END$$;

-- Legacy inSchedule(): available day, inside working hours, not across the break.
CREATE OR REPLACE FUNCTION private.fits_schedule(p_dentist_id text, p_date date, p_start time, p_minutes int)
RETURNS boolean LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT coalesce((
    SELECT s.available
       AND p_start >= s.start_time
       AND p_start + make_interval(mins => p_minutes) <= s.end_time
       AND p_start + make_interval(mins => p_minutes) > p_start        -- no wrap past midnight
       AND NOT (s.break_start IS NOT NULL
                AND p_start < s.break_end
                AND p_start + make_interval(mins => p_minutes) > s.break_start)
    FROM public.dentist_schedules s
    WHERE s.dentist_id = p_dentist_id
      AND s.day_of_week = (extract(isodow FROM p_date)::int - 1)), false);
$$;

CREATE OR REPLACE FUNCTION private.new_reference()
RETURNS text LANGUAGE sql VOLATILE SET search_path = '' AS $$
  SELECT 'LD-' || upper(to_hex((extract(epoch FROM clock_timestamp()) * 1000)::bigint))
      || '-' || upper(substr(md5(gen_random_uuid()::text), 1, 4));
$$;

CREATE OR REPLACE FUNCTION private.log_history(p_appointment uuid, p_action text, p_old text, p_new text, p_details jsonb)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
  INSERT INTO public.appointment_history (appointment_id, action, old_status, new_status, actor_id, details)
  VALUES (p_appointment, p_action, p_old, p_new, auth.uid(), coalesce(p_details, '{}'::jsonb));
  INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, details)
  VALUES (auth.uid(), 'appointment.' || p_action, 'appointment', p_appointment::text,
          jsonb_strip_nulls(jsonb_build_object('old_status', p_old, 'new_status', p_new) || coalesce(p_details, '{}'::jsonb)));
$$;

-- Validate and lock a requested slot. Serialises all writers for one dentist by
-- locking the dentist row (same strategy as the legacy SELECT … FOR UPDATE);
-- the EXCLUSION constraint on appointments is the final guarantee.
CREATE OR REPLACE FUNCTION private.assert_slot(
  p_service_id text, p_dentist_id text, p_date date, p_time time, p_exclude uuid,
  OUT out_duration_minutes int, OUT out_price numeric)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF p_service_id IS NULL OR p_dentist_id IS NULL OR p_date IS NULL OR p_time IS NULL
     OR NOT (p_time = ANY (private.booking_slots())) THEN
    PERFORM private.fail('Select a valid service, dentist, date and time.', 'INVALID_INPUT');
  END IF;
  IF (p_date + p_time) <= private.manila_now() THEN
    PERFORM private.fail('Please select a future appointment date and time.', 'PAST_SLOT');
  END IF;

  PERFORM 1 FROM public.dentists d WHERE d.id = p_dentist_id AND d.is_active FOR UPDATE;
  IF NOT FOUND THEN PERFORM private.fail('Dentist not found.', 'NOT_FOUND'); END IF;

  SELECT s.duration_minutes, s.price INTO out_duration_minutes, out_price
  FROM public.services s WHERE s.id = p_service_id AND s.is_active;
  IF NOT FOUND THEN PERFORM private.fail('Dental service was not found.', 'NOT_FOUND'); END IF;

  IF NOT EXISTS (SELECT 1 FROM public.dentist_services ds
                 WHERE ds.dentist_id = p_dentist_id AND ds.service_id = p_service_id) THEN
    PERFORM private.fail('This dentist does not provide the selected service.', 'SERVICE_NOT_OFFERED');
  END IF;

  IF NOT private.fits_schedule(p_dentist_id, p_date, p_time, out_duration_minutes) THEN
    PERFORM private.fail('The selected time is outside the dentist''s working schedule.', 'OUTSIDE_SCHEDULE');
  END IF;

  IF EXISTS (SELECT 1 FROM public.blocked_dates b WHERE b.dentist_id = p_dentist_id AND b.block_date = p_date) THEN
    PERFORM private.fail('The dentist is unavailable on this date.', 'DATE_BLOCKED');
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.appointments a
    WHERE a.dentist_id = p_dentist_id
      AND a.status IN ('Pending', 'Confirmed')
      AND (p_exclude IS NULL OR a.id <> p_exclude)
      AND a.slot && tsrange(p_date + p_time, p_date + p_time + make_interval(mins => out_duration_minutes), '[)')) THEN
    PERFORM private.fail('This time is already reserved. Choose another slot.', 'SLOT_TAKEN');
  END IF;
END$$;

REVOKE ALL ON FUNCTION private.assert_slot(text, text, date, time, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.log_history(uuid, text, text, text, jsonb) FROM PUBLIC, anon, authenticated;

-- ── book_appointment ───────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.book_appointment(
  p_service_id text, p_dentist_id text, p_date date, p_time time)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_slot record;
  v_id uuid := gen_random_uuid();
  v_ref text := private.new_reference();
BEGIN
  IF v_uid IS NULL THEN PERFORM private.fail('Please log in.', 'NOT_AUTHENTICATED'); END IF;
  IF private.current_app_role() IS DISTINCT FROM 'patient' THEN
    PERFORM private.fail('Only patient accounts can book appointments.', 'FORBIDDEN');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = v_uid AND u.email_confirmed_at IS NOT NULL) THEN
    PERFORM private.fail('Please verify your email address before booking an appointment. Check your inbox for the verification link.', 'EMAIL_NOT_VERIFIED');
  END IF;

  SELECT * INTO v_slot FROM private.assert_slot(p_service_id, p_dentist_id, p_date, p_time, NULL);

  BEGIN
    INSERT INTO public.appointments (id, reference, patient_id, dentist_id, service_id,
                                     appointment_date, start_time, duration_minutes, price)
    VALUES (v_id, v_ref, v_uid, p_dentist_id, p_service_id, p_date, p_time,
            v_slot.out_duration_minutes, v_slot.out_price);
  EXCEPTION WHEN exclusion_violation THEN
    PERFORM private.fail('This time is already reserved. Choose another slot.', 'SLOT_TAKEN');
  END;

  PERFORM private.log_history(v_id, 'created', NULL, 'Pending',
    jsonb_build_object('reference', v_ref, 'dentist_id', p_dentist_id, 'service_id', p_service_id,
                       'date', p_date, 'time', p_time));
  RETURN v_id;
END$$;

-- ── reschedule_appointment (patient, own active appointment) ───────────────
CREATE OR REPLACE FUNCTION public.reschedule_appointment(
  p_appointment_id uuid, p_service_id text, p_dentist_id text, p_date date, p_time time)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_old public.appointments%ROWTYPE;
  v_slot record;
BEGIN
  IF v_uid IS NULL THEN PERFORM private.fail('Please log in.', 'NOT_AUTHENTICATED'); END IF;
  IF private.current_app_role() IS DISTINCT FROM 'patient' THEN
    PERFORM private.fail('Only the patient who booked can reschedule.', 'FORBIDDEN');
  END IF;

  SELECT * INTO v_old FROM public.appointments WHERE id = p_appointment_id FOR UPDATE;
  IF NOT FOUND OR v_old.patient_id <> v_uid THEN
    PERFORM private.fail('Appointment not found.', 'NOT_FOUND');
  END IF;
  IF v_old.status NOT IN ('Pending', 'Confirmed') THEN
    PERFORM private.fail('Only active appointments can be rescheduled.', 'INVALID_STATE');
  END IF;

  SELECT * INTO v_slot FROM private.assert_slot(p_service_id, p_dentist_id, p_date, p_time, v_old.id);

  BEGIN
    UPDATE public.appointments SET
      dentist_id = p_dentist_id, service_id = p_service_id,
      appointment_date = p_date, start_time = p_time,
      duration_minutes = v_slot.out_duration_minutes, price = v_slot.out_price,
      status = 'Pending', decline_reason = NULL
    WHERE id = v_old.id;
  EXCEPTION WHEN exclusion_violation THEN
    PERFORM private.fail('This time is already reserved. Choose another slot.', 'SLOT_TAKEN');
  END;

  PERFORM private.log_history(v_old.id, 'rescheduled', v_old.status, 'Pending',
    jsonb_build_object('from', jsonb_build_object('dentist_id', v_old.dentist_id, 'service_id', v_old.service_id,
                                                  'date', v_old.appointment_date, 'time', v_old.start_time),
                       'to',   jsonb_build_object('dentist_id', p_dentist_id, 'service_id', p_service_id,
                                                  'date', p_date, 'time', p_time)));
  RETURN v_old.id;
END$$;

-- ── cancel_appointment (patient: own; dentist: assigned; admin: any) ───────
CREATE OR REPLACE FUNCTION public.cancel_appointment(p_appointment_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_role text := private.current_app_role();
  v_old public.appointments%ROWTYPE;
BEGIN
  IF v_uid IS NULL OR v_role IS NULL THEN PERFORM private.fail('Please log in.', 'NOT_AUTHENTICATED'); END IF;

  SELECT * INTO v_old FROM public.appointments WHERE id = p_appointment_id FOR UPDATE;
  IF NOT FOUND
     OR (v_role = 'patient' AND v_old.patient_id <> v_uid)
     OR (v_role = 'dentist' AND v_old.dentist_id IS DISTINCT FROM private.current_dentist_id()
                            AND NOT private.has_permission('clinic.manage_all_appointments')) THEN
    PERFORM private.fail('Appointment not found.', 'NOT_FOUND');
  END IF;
  IF v_old.status NOT IN ('Pending', 'Confirmed') THEN
    PERFORM private.fail('This appointment cannot be cancelled.', 'INVALID_STATE');
  END IF;

  UPDATE public.appointments SET status = 'Cancelled' WHERE id = v_old.id;
  PERFORM private.log_history(v_old.id, 'cancelled', v_old.status, 'Cancelled',
                              jsonb_build_object('by_role', v_role));
  RETURN v_old.id;
END$$;

-- ── set_appointment_status (dentist workflow) ──────────────────────────────
-- Pending -> Confirmed | Declined ; Confirmed -> Completed | Cancelled
CREATE OR REPLACE FUNCTION public.set_appointment_status(
  p_appointment_id uuid, p_status text, p_decline_reason text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_old public.appointments%ROWTYPE;
  v_reason text := nullif(left(btrim(coalesce(p_decline_reason, '')), 500), '');
BEGIN
  IF auth.uid() IS NULL THEN PERFORM private.fail('Please log in.', 'NOT_AUTHENTICATED'); END IF;
  IF private.current_app_role() IS DISTINCT FROM 'dentist' THEN
    PERFORM private.fail('Insufficient permissions.', 'FORBIDDEN');
  END IF;

  SELECT * INTO v_old FROM public.appointments WHERE id = p_appointment_id FOR UPDATE;
  IF NOT FOUND THEN PERFORM private.fail('Appointment not found.', 'NOT_FOUND'); END IF;
  IF v_old.dentist_id IS DISTINCT FROM private.current_dentist_id()
     AND NOT private.has_permission('clinic.manage_all_appointments') THEN
    PERFORM private.fail('Only the assigned dentist or the clinic administrator can manage this appointment.', 'FORBIDDEN');
  END IF;

  IF NOT ((v_old.status = 'Pending' AND p_status IN ('Confirmed', 'Declined'))
       OR (v_old.status = 'Confirmed' AND p_status IN ('Completed', 'Cancelled'))) THEN
    PERFORM private.fail('Invalid appointment status transition.', 'INVALID_TRANSITION');
  END IF;
  IF p_status = 'Completed' AND (v_old.appointment_date + v_old.start_time) > private.manila_now() THEN
    PERFORM private.fail('Cannot complete an appointment scheduled in the future.', 'FUTURE_APPOINTMENT');
  END IF;

  UPDATE public.appointments
     SET status = p_status,
         decline_reason = CASE WHEN p_status = 'Declined' THEN v_reason END
   WHERE id = v_old.id;

  PERFORM private.log_history(v_old.id, lower(p_status), v_old.status, p_status,
    CASE WHEN p_status = 'Declined' AND v_reason IS NOT NULL
         THEN jsonb_build_object('reason_given', true) ELSE '{}'::jsonb END);
  RETURN v_old.id;
END$$;

-- ── get_available_slots (public; legacy GET /api/slots) ────────────────────
CREATE OR REPLACE FUNCTION public.get_available_slots(
  p_dentist_id text, p_service_id text, p_date date, p_exclude_appointment_id uuid DEFAULT NULL)
RETURNS TABLE (slot_time time, available boolean)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_minutes int;
  v_blocked boolean;
  v_exclude uuid;
  v_t time;
BEGIN
  IF p_date IS NULL OR p_date < private.manila_now()::date THEN
    PERFORM private.fail('Select a valid dentist, service and current or future date.', 'INVALID_INPUT');
  END IF;
  SELECT s.duration_minutes INTO v_minutes FROM public.services s WHERE s.id = p_service_id AND s.is_active;
  IF v_minutes IS NULL OR NOT EXISTS (
       SELECT 1 FROM public.dentist_services ds JOIN public.dentists d ON d.id = ds.dentist_id
       WHERE ds.dentist_id = p_dentist_id AND ds.service_id = p_service_id AND d.is_active) THEN
    PERFORM private.fail('This dentist does not provide the selected service.', 'SERVICE_NOT_OFFERED');
  END IF;

  -- The "ignore my own appointment" option is honoured only for its owner.
  SELECT a.id INTO v_exclude FROM public.appointments a
   WHERE a.id = p_exclude_appointment_id AND a.patient_id = auth.uid();

  v_blocked := EXISTS (SELECT 1 FROM public.blocked_dates b WHERE b.dentist_id = p_dentist_id AND b.block_date = p_date);

  FOREACH v_t IN ARRAY private.booking_slots() LOOP
    slot_time := v_t;
    available := NOT v_blocked
      AND (p_date + v_t) > private.manila_now()
      AND private.fits_schedule(p_dentist_id, p_date, v_t, v_minutes)
      AND NOT EXISTS (
        SELECT 1 FROM public.appointments a
        WHERE a.dentist_id = p_dentist_id AND a.status IN ('Pending', 'Confirmed')
          AND (v_exclude IS NULL OR a.id <> v_exclude)
          AND a.slot && tsrange(p_date + v_t, p_date + v_t + make_interval(mins => v_minutes), '[)'));
    RETURN NEXT;
  END LOOP;
END$$;

-- ── save_dentist_schedule (own, or any for clinic admin) ───────────────────
-- p_days: JSON array of 7 objects in Monday..Sunday order:
--   {"available":bool,"start":"HH:MM","end":"HH:MM","breakStart":"HH:MM"|null,"breakEnd":"HH:MM"|null}
CREATE OR REPLACE FUNCTION public.save_dentist_schedule(p_dentist_id text, p_days jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  i int;
  d jsonb;
  v_conflict record;
BEGIN
  IF auth.uid() IS NULL THEN PERFORM private.fail('Please log in.', 'NOT_AUTHENTICATED'); END IF;
  IF NOT private.can_manage_dentist(p_dentist_id) THEN
    PERFORM private.fail('You may only edit your own dentist schedule.', 'FORBIDDEN');
  END IF;
  IF jsonb_typeof(p_days) <> 'array' OR jsonb_array_length(p_days) <> 7 THEN
    PERFORM private.fail('Provide seven valid working-day schedules and break ranges.', 'INVALID_INPUT');
  END IF;

  PERFORM 1 FROM public.dentists WHERE id = p_dentist_id FOR UPDATE;
  IF NOT FOUND THEN PERFORM private.fail('Dentist not found.', 'NOT_FOUND'); END IF;

  BEGIN
    FOR i IN 0..6 LOOP
      d := p_days -> i;
      INSERT INTO public.dentist_schedules AS s (dentist_id, day_of_week, available, start_time, end_time, break_start, break_end)
      VALUES (p_dentist_id, i,
              coalesce((d ->> 'available')::boolean, false),
              coalesce(nullif(d ->> 'start', '')::time, '09:00'),
              coalesce(nullif(d ->> 'end', '')::time, '17:00'),
              nullif(d ->> 'breakStart', '')::time,
              nullif(d ->> 'breakEnd', '')::time)
      ON CONFLICT (dentist_id, day_of_week) DO UPDATE SET
        available = EXCLUDED.available, start_time = EXCLUDED.start_time, end_time = EXCLUDED.end_time,
        break_start = EXCLUDED.break_start, break_end = EXCLUDED.break_end;
    END LOOP;
  EXCEPTION
    WHEN check_violation OR invalid_datetime_format OR datetime_field_overflow OR invalid_text_representation THEN
      PERFORM private.fail('Provide seven valid working-day schedules and break ranges.', 'INVALID_INPUT');
  END;

  -- Existing upcoming active appointments must still fit (legacy rule).
  SELECT a.appointment_date, a.start_time INTO v_conflict
  FROM public.appointments a
  WHERE a.dentist_id = p_dentist_id AND a.status IN ('Pending', 'Confirmed')
    AND a.appointment_date >= private.manila_now()::date
    AND NOT private.fits_schedule(p_dentist_id, a.appointment_date, a.start_time, a.duration_minutes)
  ORDER BY a.appointment_date LIMIT 1;
  IF FOUND THEN
    PERFORM private.fail(format('An existing appointment on %s conflicts with the proposed hours. Reschedule it first.',
                                v_conflict.appointment_date), 'SCHEDULE_CONFLICT');
  END IF;
END$$;

-- ── blocked dates ──────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.add_blocked_date(p_dentist_id text, p_date date)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF auth.uid() IS NULL THEN PERFORM private.fail('Please log in.', 'NOT_AUTHENTICATED'); END IF;
  IF NOT private.can_manage_dentist(p_dentist_id) THEN
    PERFORM private.fail('You may only edit your own blocked dates.', 'FORBIDDEN');
  END IF;
  IF p_date IS NULL THEN PERFORM private.fail('Invalid date.', 'INVALID_INPUT'); END IF;

  PERFORM 1 FROM public.dentists WHERE id = p_dentist_id FOR UPDATE;
  IF NOT FOUND THEN PERFORM private.fail('Dentist not found.', 'NOT_FOUND'); END IF;
  IF EXISTS (SELECT 1 FROM public.appointments a WHERE a.dentist_id = p_dentist_id
             AND a.appointment_date = p_date AND a.status IN ('Pending', 'Confirmed')) THEN
    PERFORM private.fail('This date has active appointments. Resolve them first.', 'DATE_HAS_APPOINTMENTS');
  END IF;
  INSERT INTO public.blocked_dates (dentist_id, block_date) VALUES (p_dentist_id, p_date)
  ON CONFLICT DO NOTHING;
END$$;

CREATE OR REPLACE FUNCTION public.remove_blocked_date(p_dentist_id text, p_date date)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF auth.uid() IS NULL THEN PERFORM private.fail('Please log in.', 'NOT_AUTHENTICATED'); END IF;
  IF NOT private.can_manage_dentist(p_dentist_id) THEN
    PERFORM private.fail('You may only edit your own blocked dates.', 'FORBIDDEN');
  END IF;
  DELETE FROM public.blocked_dates WHERE dentist_id = p_dentist_id AND block_date = p_date;
END$$;

-- ── profiles ───────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION private.normalize_phone_ph(p_input text)
RETURNS text LANGUAGE plpgsql IMMUTABLE SET search_path = '' AS $$
DECLARE
  t text := btrim(coalesce(p_input, ''));
  d text;
BEGIN
  IF t = '' OR length(t) > 25 OR t ~ '[^0-9+().\s-]' THEN RETURN NULL; END IF;
  d := regexp_replace(t, '[^0-9]', '', 'g');
  IF left(t, 1) = '+' AND left(d, 2) <> '63' THEN RETURN NULL; END IF;
  IF left(d, 2) = '63' AND length(d) = 12 THEN d := '0' || substr(d, 3); END IF;
  IF d ~ '^09[0-9]{9}$' THEN RETURN '+63' || substr(d, 2); END IF;
  IF d ~ '^0[2-8][0-9]{8,9}$' THEN RETURN d; END IF;
  RETURN NULL;
END$$;

CREATE OR REPLACE FUNCTION public.update_my_profile(p_full_name text, p_phone text)
RETURNS public.profiles LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_name text := left(btrim(coalesce(p_full_name, '')), 150);
  v_phone text;
  v_row public.profiles;
BEGIN
  IF auth.uid() IS NULL THEN PERFORM private.fail('Please log in.', 'NOT_AUTHENTICATED'); END IF;
  IF char_length(v_name) < 2 THEN PERFORM private.fail('Name cannot be blank.', 'INVALID_INPUT'); END IF;
  IF btrim(coalesce(p_phone, '')) = '' THEN
    v_phone := '';
  ELSE
    v_phone := private.normalize_phone_ph(p_phone);
    IF v_phone IS NULL THEN
      PERFORM private.fail('Enter a valid Philippine phone number, for example 0917 123 4567.', 'INVALID_PHONE');
    END IF;
  END IF;
  UPDATE public.profiles SET full_name = v_name, phone = v_phone WHERE id = auth.uid()
  RETURNING * INTO v_row;
  RETURN v_row;
END$$;

-- Set / clear the caller's picture. The file must already be uploaded to the
-- caller's own folder: patients -> private bucket "avatars",
-- dentists -> public bucket "dentist-photos" (also shown on the public site).
CREATE OR REPLACE FUNCTION public.set_my_avatar(p_path text, p_public_url text DEFAULT NULL)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_path text := nullif(btrim(coalesce(p_path, '')), '');
  v_role text := private.current_app_role();
  v_bucket text;
  v_dentist text := private.current_dentist_id();
BEGIN
  IF v_uid IS NULL OR v_role IS NULL THEN PERFORM private.fail('Please log in.', 'NOT_AUTHENTICATED'); END IF;
  v_bucket := CASE WHEN v_role = 'dentist' THEN 'dentist-photos' ELSE 'avatars' END;

  IF v_path IS NOT NULL THEN
    IF v_path !~ ('^' || v_uid::text || '/[A-Za-z0-9._-]{1,100}$') THEN
      PERFORM private.fail('Invalid photo location.', 'INVALID_INPUT');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM storage.objects o WHERE o.bucket_id = v_bucket AND o.name = v_path) THEN
      PERFORM private.fail('The uploaded photo was not found.', 'NOT_FOUND');
    END IF;
    IF v_role = 'dentist' AND (p_public_url IS NULL OR length(p_public_url) > 600
        OR p_public_url NOT LIKE 'https://%/storage/v1/object/public/dentist-photos/' || v_path
        OR p_public_url ~ '[\s"''<>?#]') THEN
      PERFORM private.fail('Invalid photo location.', 'INVALID_INPUT');
    END IF;
  END IF;

  UPDATE public.profiles SET avatar_path = v_path WHERE id = v_uid;
  IF v_role = 'dentist' AND v_dentist IS NOT NULL THEN
    UPDATE public.dentists SET photo_url = CASE WHEN v_path IS NULL THEN NULL ELSE p_public_url END
     WHERE id = v_dentist;
  END IF;
  RETURN v_path;
END$$;

-- ── dentist public profile (own, or any for clinic admin) ──────────────────
CREATE OR REPLACE FUNCTION public.update_dentist_profile(
  p_dentist_id text, p_name text, p_title text, p_specialty text, p_bio text, p_experience int DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_name text := left(btrim(coalesce(p_name, '')), 150);
  v_spec text := left(btrim(coalesce(p_specialty, '')), 160);
BEGIN
  IF auth.uid() IS NULL THEN PERFORM private.fail('Please log in.', 'NOT_AUTHENTICATED'); END IF;
  IF NOT private.can_manage_dentist(p_dentist_id) THEN
    PERFORM private.fail('You may only edit your own dentist profile.', 'FORBIDDEN');
  END IF;
  IF char_length(v_name) < 2 OR v_spec = '' THEN
    PERFORM private.fail('Dentist name and specialty are required.', 'INVALID_INPUT');
  END IF;
  IF p_experience IS NOT NULL AND (p_experience < 0 OR p_experience > 80) THEN
    PERFORM private.fail('Experience must be a whole number of years.', 'INVALID_INPUT');
  END IF;
  UPDATE public.dentists SET
    name = v_name, specialty = v_spec,
    title = left(btrim(coalesce(p_title, '')), 80),
    bio = left(btrim(coalesce(p_bio, '')), 4000),
    experience_years = coalesce(p_experience, experience_years)
  WHERE id = p_dentist_id;
  IF NOT FOUND THEN PERFORM private.fail('Dentist not found.', 'NOT_FOUND'); END IF;
  UPDATE public.profiles SET full_name = v_name WHERE dentist_id = p_dentist_id;
END$$;

-- ── clinic administration ──────────────────────────────────────────────────
-- Grant/revoke the clinic-administrator privilege (admin only, never on self,
-- and never removing the last administrator).
CREATE OR REPLACE FUNCTION public.set_clinic_admin(p_user_id uuid, p_is_admin boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NOT private.has_permission('clinic.provision_staff') THEN
    PERFORM private.fail('Only the clinic administrator can change staff privileges.', 'FORBIDDEN');
  END IF;
  IF p_user_id = auth.uid() THEN
    PERFORM private.fail('You cannot change your own administrator privilege.', 'FORBIDDEN');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_user_id AND role = 'dentist') THEN
    PERFORM private.fail('Dentist account not found.', 'NOT_FOUND');
  END IF;
  UPDATE public.profiles SET is_clinic_admin = coalesce(p_is_admin, false) WHERE id = p_user_id;
END$$;

-- Server-side provisioning step, called by the provision-dentist Edge Function
-- (service role) AFTER it created the auth user, or from the SQL editor to
-- bootstrap the first administrator. Not executable by browser roles.
CREATE OR REPLACE FUNCTION public.provision_dentist_account(
  p_user_id uuid, p_dentist_id text, p_name text,
  p_title text DEFAULT '', p_specialty text DEFAULT '', p_is_admin boolean DEFAULT false,
  p_actor uuid DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_name text := left(btrim(coalesce(p_name, '')), 150);
BEGIN
  IF p_user_id IS NULL OR p_dentist_id IS NULL OR p_dentist_id !~ '^[a-z0-9][a-z0-9-]{1,39}$' OR char_length(v_name) < 2 THEN
    PERFORM private.fail('Provide a user, a dentist id (lowercase letters, digits, dashes) and a name.', 'INVALID_INPUT');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_user_id) THEN
    PERFORM private.fail('Auth user/profile not found.', 'NOT_FOUND');
  END IF;
  IF EXISTS (SELECT 1 FROM public.profiles WHERE dentist_id = p_dentist_id AND id <> p_user_id) THEN
    PERFORM private.fail('That dentist profile already has a login.', 'CONFLICT');
  END IF;
  IF EXISTS (SELECT 1 FROM public.appointments WHERE patient_id = p_user_id) THEN
    PERFORM private.fail('This account has patient appointments and cannot become a staff account.', 'CONFLICT');
  END IF;

  INSERT INTO public.dentists (id, name, title, specialty)
  VALUES (p_dentist_id, v_name, left(coalesce(p_title, ''), 80), left(coalesce(p_specialty, ''), 160))
  ON CONFLICT (id) DO NOTHING;

  -- New dentists start with Mon–Fri 9–5 so they are bookable once services are assigned.
  INSERT INTO public.dentist_schedules (dentist_id, day_of_week, available, start_time, end_time)
  SELECT p_dentist_id, g, g < 5, '09:00', '17:00' FROM generate_series(0, 6) g
  ON CONFLICT DO NOTHING;

  UPDATE public.profiles
     SET role = 'dentist', dentist_id = p_dentist_id, full_name = v_name,
         is_clinic_admin = coalesce(p_is_admin, false)
   WHERE id = p_user_id;

  INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, details)
  VALUES (coalesce(p_actor, auth.uid()), 'staff.provisioned', 'profile', p_user_id::text,
          jsonb_build_object('dentist_id', p_dentist_id, 'is_clinic_admin', coalesce(p_is_admin, false)));
END$$;

-- ── function privileges ────────────────────────────────────────────────────
REVOKE ALL ON FUNCTION public.book_appointment(text, text, date, time) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.reschedule_appointment(uuid, text, text, date, time) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.cancel_appointment(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.set_appointment_status(uuid, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.save_dentist_schedule(text, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.add_blocked_date(text, date) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.remove_blocked_date(text, date) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.update_my_profile(text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.set_my_avatar(text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.update_dentist_profile(text, text, text, text, text, int) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.set_clinic_admin(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION
  public.book_appointment(text, text, date, time),
  public.reschedule_appointment(uuid, text, text, date, time),
  public.cancel_appointment(uuid),
  public.set_appointment_status(uuid, text, text),
  public.save_dentist_schedule(text, jsonb),
  public.add_blocked_date(text, date),
  public.remove_blocked_date(text, date),
  public.update_my_profile(text, text),
  public.set_my_avatar(text, text),
  public.update_dentist_profile(text, text, text, text, text, int),
  public.set_clinic_admin(uuid, boolean)
TO authenticated;

REVOKE ALL ON FUNCTION public.get_available_slots(text, text, date, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_available_slots(text, text, date, uuid) TO anon, authenticated;

REVOKE ALL ON FUNCTION public.provision_dentist_account(uuid, text, text, text, text, boolean, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.provision_dentist_account(uuid, text, text, text, text, boolean, uuid)
  TO service_role;

-- Internal helpers are not part of the API.
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.handle_user_email_change() FROM PUBLIC, anon, authenticated;
