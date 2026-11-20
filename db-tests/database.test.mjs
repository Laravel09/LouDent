// Comprehensive isolated PostgreSQL test suite for LouDent migrations (1..5).
// Runs against a real embedded PostgreSQL 17.5 instance with the Supabase stub.
// Tests:
//  1. Schema, constraints, seed catalogue, and RLS enabled on every public table
//  2. Anonymous access restrictions (public catalogue read-only; no writes/private reads)
//  3. Patient signup trigger (ignores forged role/admin metadata) & profile privilege protection
//  4. Patient isolation (cannot read/cancel/reschedule another patient's appointments or profile)
//  5. Unverified patient blocked from booking (EMAIL_NOT_VERIFIED)
//  6. Atomic booking, working hours, break window, blocked dates, and service eligibility checks
//  7. Concurrency / GiST exclusion constraint (overlapping active bookings rejected; cancelled/declined release slot)
//  8. Rescheduling rules & own-appointment exclusion in get_available_slots
//  9. Regular dentist (Dr. Reyes) scope: sees/manages only own appointments, schedule, blocked dates, and profile
// 10. Clinic administrator (Dr. Santos) scope: sees/manages all appointments, schedules, services, staff provisioning, audit logs
// 11. Storage bucket policies (private avatars vs public dentist-photos, per-UID folder enforcement)
// 12. Append-only immutability of audit_logs and appointment_history

import test from 'node:test'
import assert from 'node:assert/strict'
import { startDatabase, as, createUser, nextWeekday, hintOf } from './harness.mjs'

test('LouDent PostgreSQL schema, RLS, concurrency, and security suite', async (t) => {
  const db = await startDatabase()
  t.after(async () => {
    await db.stop()
  })

  // Test fixtures
  let patientA, patientB, unverifiedPatient, santosUser, reyesUser
  const nextMonday = nextWeekday(1, 3)    // Both Santos & Reyes work Mondays 09:00-17:00
  const nextTuesday = nextWeekday(2, 3)   // Santos works Tuesday; Reyes is off Tuesday
  const nextWednesday = nextWeekday(3, 3) // Santos is off Wednesday; Reyes works Wednesday

  await t.test('1. Migrations & seed catalogue integrity', async () => {
    const { rows } = await db.pool.query(`
      SELECT
        (SELECT count(*)::int FROM public.dentists) AS dentists,
        (SELECT count(*)::int FROM public.services) AS services,
        (SELECT count(*)::int FROM public.dentist_services) AS links,
        (SELECT count(*)::int FROM public.dentist_schedules) AS schedule_days,
        (SELECT count(*)::int FROM storage.buckets) AS buckets,
        (SELECT bool_and(relrowsecurity) FROM pg_class
          WHERE relnamespace = 'public'::regnamespace AND relkind = 'r') AS all_rls_enabled
    `)
    assert.equal(rows[0].dentists, 2)
    assert.equal(rows[0].services, 13)
    assert.equal(rows[0].links, 15)
    assert.equal(rows[0].schedule_days, 14)
    assert.equal(rows[0].buckets, 2)
    assert.equal(rows[0].all_rls_enabled, true)
  })

  await t.test('2. Anonymous role: can read public catalogue, cannot read private tables or write anywhere', async () => {
    await as(db.pool, 'anon', async (c) => {
      const dentists = await c.query('SELECT id FROM public.dentists ORDER BY id')
      assert.equal(dentists.rowCount, 2)
      const services = await c.query('SELECT id FROM public.services')
      assert.equal(services.rowCount, 13)
      const slots = await c.query(
        'SELECT * FROM public.get_available_slots($1, $2, $3, NULL)',
        ['santos', 'checkup', nextMonday]
      )
      assert.equal(slots.rowCount, 7)

      await assert.rejects(() => c.query('SELECT * FROM public.profiles'))
      await assert.rejects(() => c.query('SELECT * FROM public.appointments'))
      await assert.rejects(() => c.query('SELECT * FROM public.audit_logs'))
      await assert.rejects(() =>
        c.query("INSERT INTO public.services (id,name,category,duration_minutes,price) VALUES ('hack','Hack','General Dentistry',30,100)")
      )
      await assert.rejects(() =>
        c.query('SELECT public.book_appointment($1,$2,$3,$4)', ['checkup', 'santos', nextMonday, '09:00'])
      )
    })
  })

  await t.test('3. User signup trigger ignores forged role/admin metadata & blocks self-promotion', async () => {
    patientA = await createUser(db.pool, {
      email: 'patient.a@example.com',
      name: 'Alice Patient',
      phone: '09171234567',
      confirmed: true,
      meta: { role: 'dentist', is_clinic_admin: true, dentist_id: 'santos' },
    })
    patientB = await createUser(db.pool, {
      email: 'patient.b@example.com',
      name: 'Bob Patient',
      phone: '09181234567',
      confirmed: true,
    })
    unverifiedPatient = await createUser(db.pool, {
      email: 'unverified@example.com',
      name: 'Unverified Pat',
      confirmed: false,
    })

    // Verify patientA was created strictly as a non-admin patient
    await as(db.pool, patientA, async (c) => {
      const { rows } = await c.query('SELECT role, is_clinic_admin, dentist_id FROM public.profiles WHERE id = $1', [patientA])
      assert.equal(rows.length, 1)
      assert.equal(rows[0].role, 'patient')
      assert.equal(rows[0].is_clinic_admin, false)
      assert.equal(rows[0].dentist_id, null)

      // Direct UPDATE on profiles is revoked from authenticated
      await assert.rejects(() =>
        c.query("UPDATE public.profiles SET role = 'dentist', is_clinic_admin = true WHERE id = $1", [patientA])
      )
      // Cannot call set_clinic_admin
      await assert.rejects(() =>
        c.query('SELECT public.set_clinic_admin($1, true)', [patientA])
      )
      // Cannot call service-role provision_dentist_account
      await assert.rejects(() =>
        c.query("SELECT public.provision_dentist_account($1, 'santos', 'Dr. Maria Santos', 'DMD', 'General', true)", [patientA])
      )
    })
  })

  await t.test('4. Provision Dr. Maria Santos (Clinic Admin) and Dr. Adrian Reyes (Regular Dentist) via service_role', async () => {
    santosUser = await createUser(db.pool, {
      email: 'santos@loudent.ph',
      name: 'Dr. Maria Santos',
      confirmed: true,
    })
    reyesUser = await createUser(db.pool, {
      email: 'reyes@loudent.ph',
      name: 'Dr. Adrian Reyes',
      confirmed: true,
    })

    await as(db.pool, 'service_role', async (c) => {
      await c.query(
        'SELECT public.provision_dentist_account($1, $2, $3, $4, $5, $6, $1)',
        [santosUser, 'santos', 'Dr. Maria Santos', 'DMD', 'General & Cosmetic Dentistry', true]
      )
      await c.query(
        'SELECT public.provision_dentist_account($1, $2, $3, $4, $5, $6, $7)',
        [reyesUser, 'reyes', 'Dr. Adrian Reyes', 'DMD, MOrth', 'Orthodontics', false, santosUser]
      )
    })

    await as(db.pool, santosUser, async (c) => {
      const { rows } = await c.query('SELECT role, dentist_id, is_clinic_admin FROM public.profiles WHERE id = $1', [santosUser])
      assert.deepEqual(rows[0], { role: 'dentist', dentist_id: 'santos', is_clinic_admin: true })
    })
    await as(db.pool, reyesUser, async (c) => {
      const { rows } = await c.query('SELECT role, dentist_id, is_clinic_admin FROM public.profiles WHERE id = $1', [reyesUser])
      assert.deepEqual(rows[0], { role: 'dentist', dentist_id: 'reyes', is_clinic_admin: false })
    })
  })

  await t.test('5. Unverified patient cannot book appointments', async () => {
    await as(db.pool, unverifiedPatient, async (c) => {
      await assert.rejects(
        () => c.query('SELECT public.book_appointment($1, $2, $3, $4)', ['checkup', 'santos', nextMonday, '09:00']),
        (err) => hintOf(err) === 'EMAIL_NOT_VERIFIED'
      )
    })
  })

  let apptSantosId, apptReyesId

  await t.test('6. Atomic booking, service eligibility, working schedule, and overlap protection', async () => {
    // Patient A books Dental Check-up (30 min) with Dr. Santos on nextMonday at 09:00
    await as(db.pool, patientA, async (c) => {
      const { rows } = await c.query(
        'SELECT public.book_appointment($1, $2, $3, $4) AS id',
        ['checkup', 'santos', nextMonday, '09:00']
      )
      apptSantosId = rows[0].id
      assert.ok(apptSantosId)

      // Dr. Santos does not offer Braces Installation -> SERVICE_NOT_OFFERED
      await assert.rejects(
        () => c.query('SELECT public.book_appointment($1, $2, $3, $4)', ['braces-install', 'santos', nextMonday, '10:00']),
        (err) => hintOf(err) === 'SERVICE_NOT_OFFERED'
      )

      // Dr. Santos is off on Wednesdays -> OUTSIDE_SCHEDULE
      await assert.rejects(
        () => c.query('SELECT public.book_appointment($1, $2, $3, $4)', ['checkup', 'santos', nextWednesday, '09:00']),
        (err) => hintOf(err) === 'OUTSIDE_SCHEDULE'
      )
    })

    // Patient B tries to book the same 09:00 slot with Dr. Santos -> SLOT_TAKEN
    await as(db.pool, patientB, async (c) => {
      await assert.rejects(
        () => c.query('SELECT public.book_appointment($1, $2, $3, $4)', ['cleaning', 'santos', nextMonday, '09:00']),
        (err) => hintOf(err) === 'SLOT_TAKEN'
      )

      // Patient B books Braces Installation (90 min: 09:00..10:30) with Dr. Reyes on nextMonday at 09:00
      const { rows } = await c.query(
        'SELECT public.book_appointment($1, $2, $3, $4) AS id',
        ['braces-install', 'reyes', nextMonday, '09:00']
      )
      apptReyesId = rows[0].id
      assert.ok(apptReyesId)
    })

    // Because Braces Installation is 90 mins (09:00-10:30), 10:00 with Dr. Reyes overlaps and must be rejected!
    await as(db.pool, patientA, async (c) => {
      await assert.rejects(
        () => c.query('SELECT public.book_appointment($1, $2, $3, $4)', ['checkup', 'reyes', nextMonday, '10:00']),
        (err) => hintOf(err) === 'SLOT_TAKEN'
      )

      // get_available_slots reflects both 09:00 and 10:00 unavailable for Dr. Reyes
      const { rows: slots } = await c.query(
        'SELECT slot_time::text, available FROM public.get_available_slots($1, $2, $3, NULL)',
        ['reyes', 'checkup', nextMonday]
      )
      const byTime = Object.fromEntries(slots.map((s) => [s.slot_time, s.available]))
      assert.equal(byTime['09:00:00'], false)
      assert.equal(byTime['10:00:00'], false)
      assert.equal(byTime['11:00:00'], true)
    })
  })

  await t.test('7. True concurrent booking race: two parallel transactions for the same slot, exactly one succeeds', async () => {
    const attempt = (userId) =>
      as(db.pool, userId, (c) =>
        c.query('SELECT public.book_appointment($1, $2, $3, $4) AS id', ['checkup', 'santos', nextMonday, '14:00'])
      )
    const results = await Promise.allSettled([attempt(patientA), attempt(patientB)])
    const fulfilled = results.filter((r) => r.status === 'fulfilled')
    const rejected = results.filter((r) => r.status === 'rejected')
    assert.equal(fulfilled.length, 1, 'Exactly one concurrent booking must win')
    assert.equal(rejected.length, 1, 'The losing concurrent booking must be rejected')
    assert.equal(hintOf(rejected[0].reason), 'SLOT_TAKEN')

    // Cancel the winning 14:00 appointment so it releases the slot
    const wonId = fulfilled[0].value.rows[0].id
    await as(db.pool, santosUser, (c) => c.query('SELECT public.cancel_appointment($1)', [wonId]))
  })

  await t.test('8. Patient isolation: Patient A cannot read, reschedule, or cancel Patient B appointments or profile', async () => {
    await as(db.pool, patientA, async (c) => {
      const { rows: appts } = await c.query('SELECT id, patient_id FROM public.appointments')
      assert.ok(appts.length >= 1)
      assert.ok(appts.every((r) => r.patient_id === patientA), 'Patient A must only see own appointments')
      assert.ok(!appts.some((r) => r.id === apptReyesId), 'Patient A must never see Patient B appointment')

      const { rows: profiles } = await c.query('SELECT id FROM public.profiles')
      assert.deepEqual(profiles.map((r) => r.id), [patientA])

      await assert.rejects(
        () => c.query('SELECT public.cancel_appointment($1)', [apptReyesId]),
        (err) => hintOf(err) === 'NOT_FOUND'
      )
      await assert.rejects(
        () => c.query('SELECT public.reschedule_appointment($1, $2, $3, $4, $5)', [apptReyesId, 'checkup', 'reyes', nextMonday, '15:00']),
        (err) => hintOf(err) === 'NOT_FOUND'
      )
    })
  })

  await t.test('9. Regular dentist (Dr. Reyes) permissions and restrictions', async () => {
    await as(db.pool, reyesUser, async (c) => {
      // Sees ONLY his own appointment (apptReyesId), not Dr. Santos's
      const { rows: appts } = await c.query('SELECT id, dentist_id FROM public.appointments')
      assert.equal(appts.length, 1)
      assert.equal(appts[0].id, apptReyesId)

      // Cannot confirm/cancel Dr. Santos's appointment
      await assert.rejects(
        () => c.query('SELECT public.set_appointment_status($1, $2, NULL)', [apptSantosId, 'Confirmed']),
        (err) => hintOf(err) === 'NOT_FOUND' || hintOf(err) === 'FORBIDDEN'
      )

      // Can confirm his own appointment
      await c.query('SELECT public.set_appointment_status($1, $2, NULL)', [apptReyesId, 'Confirmed'])

      // Cannot complete a future appointment
      await assert.rejects(
        () => c.query('SELECT public.set_appointment_status($1, $2, NULL)', [apptReyesId, 'Completed']),
        (err) => hintOf(err) === 'FUTURE_APPOINTMENT'
      )

      // Cannot edit Dr. Santos's schedule, blocked dates, or profile
      await assert.rejects(
        () => c.query('SELECT public.add_blocked_date($1, $2)', ['santos', nextTuesday]),
        (err) => hintOf(err) === 'FORBIDDEN'
      )
      await assert.rejects(
        () => c.query('SELECT public.update_dentist_profile($1, $2, $3, $4, $5, $6)', ['santos', 'Tampered', 'DMD', 'General', 'Bio', 5]),
        (err) => hintOf(err) === 'FORBIDDEN'
      )

      // Cannot manage clinic-wide services
      await assert.rejects(() =>
        c.query("INSERT INTO public.services (id,name,category,duration_minutes,price) VALUES ('new-svc','New','General Dentistry',30,500)")
      )

      // Cannot read audit_logs (RLS filters all rows)
      const { rows: audits } = await c.query('SELECT id FROM public.audit_logs')
      assert.equal(audits.length, 0)

      // Cannot grant himself clinic admin
      await assert.rejects(
        () => c.query('SELECT public.set_clinic_admin($1, true)', [reyesUser]),
        (err) => hintOf(err) === 'FORBIDDEN'
      )
    })
  })

  await t.test('10. Clinic Administrator (Dr. Maria Santos) clinic-wide permissions', async () => {
    await as(db.pool, santosUser, async (c) => {
      // Sees ALL clinic appointments (both Santos and Reyes, plus the cancelled race appointment)
      const { rows: appts } = await c.query('SELECT id, dentist_id FROM public.appointments ORDER BY id')
      assert.equal(appts.length, 3)
      assert.ok(appts.some((a) => a.id === apptSantosId && a.dentist_id === 'santos'))
      assert.ok(appts.some((a) => a.id === apptReyesId && a.dentist_id === 'reyes'))

      // Can manage Dr. Reyes's blocked dates (on a day with no active appointments)
      await c.query('SELECT public.add_blocked_date($1, $2)', ['reyes', nextWednesday])
      await c.query('SELECT public.remove_blocked_date($1, $2)', ['reyes', nextWednesday])

      // Cannot block a date that has active appointments
      await assert.rejects(
        () => c.query('SELECT public.add_blocked_date($1, $2)', ['santos', nextMonday]),
        (err) => hintOf(err) === 'DATE_HAS_APPOINTMENTS'
      )

      // Can manage clinic services
      await c.query(
        "INSERT INTO public.services (id, name, category, duration_minutes, price, description, preparation) VALUES ('fluoride', 'Fluoride Treatment', 'General Dentistry', 30, 700, 'Desc', 'Prep')"
      )
      await c.query('DELETE FROM public.services WHERE id = $1', ['fluoride'])

      // Can view clinic-wide audit logs
      const { rows: audits } = await c.query('SELECT action FROM public.audit_logs')
      assert.ok(audits.length >= 5)
    })
  })

  await t.test('11. Rescheduling, decline, and slot release', async () => {
    // Patient A reschedules apptSantosId from 09:00 to 10:00 on nextMonday
    await as(db.pool, patientA, async (c) => {
      await c.query(
        'SELECT public.reschedule_appointment($1, $2, $3, $4, $5)',
        [apptSantosId, 'checkup', 'santos', nextMonday, '10:00']
      )
    })

    // 09:00 is now free; Dr. Santos declines the 10:00 appointment, freeing 10:00 as well
    await as(db.pool, santosUser, async (c) => {
      await c.query(
        'SELECT public.set_appointment_status($1, $2, $3)',
        [apptSantosId, 'Declined', 'Emergency clinic meeting']
      )
    })

    await as(db.pool, patientB, async (c) => {
      // Patient B can now book 10:00 with Dr. Santos because Declined released the slot
      const { rows } = await c.query(
        'SELECT public.book_appointment($1, $2, $3, $4) AS id',
        ['checkup', 'santos', nextMonday, '10:00']
      )
      assert.ok(rows[0].id)
    })
  })

  await t.test('12. Storage RLS & avatar ownership enforcement', async () => {
    await as(db.pool, patientA, async (c) => {
      // Patient A can upload to own folder in avatars
      await c.query(
        "INSERT INTO storage.objects (bucket_id, name) VALUES ('avatars', $1)",
        [`${patientA}/avatar.jpg`]
      )
      await c.query('SELECT public.set_my_avatar($1, NULL)', [`${patientA}/avatar.jpg`])

      // Patient A cannot upload into Patient B's folder
      await assert.rejects(() =>
        c.query("INSERT INTO storage.objects (bucket_id, name) VALUES ('avatars', $1)", [`${patientB}/avatar.jpg`])
      )

      // Patient A cannot upload into dentist-photos bucket
      await assert.rejects(() =>
        c.query("INSERT INTO storage.objects (bucket_id, name) VALUES ('dentist-photos', $1)", [`${patientA}/avatar.jpg`])
      )
    })

    // Patient B cannot read Patient A's private avatar object in storage.objects
    await as(db.pool, patientB, async (c) => {
      const { rows } = await c.query("SELECT name FROM storage.objects WHERE bucket_id = 'avatars'")
      assert.equal(rows.length, 0)
    })
  })

  await t.test('13. Audit logs & appointment history are strictly append-only', async () => {
    await as(db.pool, 'owner', async (c) => {
      await assert.rejects(() => c.query("UPDATE public.audit_logs SET action = 'tampered'"))
      await assert.rejects(() => c.query('DELETE FROM public.audit_logs'))
      await assert.rejects(() => c.query("UPDATE public.appointment_history SET action = 'tampered'"))
      await assert.rejects(() => c.query('DELETE FROM public.appointment_history'))
    })
  })
})
