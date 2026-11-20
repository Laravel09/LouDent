# LouDent — Testing & Verification Report

All tests listed below were actually executed during the migration verification phase. Test categories are explicitly distinguished as required by Section 18.

---

## Summary Matrix

| Category | Tool / Runner | Target | Result |
|---|---|---|---|
| **A. Static Type Checking** | `tsc --noEmit` (`npm run typecheck`) | Full React + TypeScript + Supabase types | **PASSED** (0 errors) |
| **B. Environment Safety Check** | `node scripts/check-env.mjs` (`npm run check:env`) | `.env` / `VITE_` secret leak detection | **PASSED** |
| **C. Frontend Unit Tests** | Vitest `v5.1.1` (`npm test`) | `src/test/frontend.test.ts` (6 unit tests) | **PASSED** (6/6 passed) |
| **D. Actual PostgreSQL Database, RLS, Concurrency & Security Tests** | Node test runner + `embedded-postgres` 17.5 (`npm run test:db`) | `db-tests/database.test.mjs` (13 database subtests) | **PASSED** (13/13 subtests passed) |
| **E. Production Bundle Build** | Vite `v8.3.8` (`npm run build`) | `dist/` production bundle | **PASSED** (73 modules, built in 2.00s) |
| **F. Dependency Security Audit** | `npm audit` | Installed `node_modules` | **PASSED** (0 vulnerabilities) |
| **G. Live Remote Supabase Integration** | Manual / requires user's `VITE_SUPABASE_PUBLISHABLE_KEY` & authorization to push migrations | `https://qlsfeqofszmtdkdedkqz.supabase.co` | **NOT EXECUTED AGAINST LIVE DB** (by safety rule Section 8 & 21) |

---

## Detailed Database & Security Test Results (`npm run test:db`)

Executed against a real local PostgreSQL 17.5 server via `embedded-postgres` (`db-tests/database.test.mjs`), applying all 5 migrations (`20261119000001` through `20261119000005`):

1. **`1. Migrations & seed catalogue integrity`** — **PASS**
   - Verified 2 dentists (`santos`, `reyes`), 13 services, 15 `dentist_services` links, 14 `dentist_schedules` rows, 2 storage buckets (`avatars`, `dentist-photos`), and `relrowsecurity = true` on all 9 public tables.
2. **`2. Anonymous role: can read public catalogue, cannot read private tables or write anywhere`** — **PASS**
   - Verified `anon` can read `dentists`, `services`, and `get_available_slots`, and is rejected on `profiles`, `appointments`, `audit_logs`, `INSERT INTO services`, and `book_appointment`.
3. **`3. User signup trigger ignores forged role/admin metadata & blocks self-promotion`** — **PASS**
   - Signed up a user passing `{"role":"dentist","is_clinic_admin":true,"dentist_id":"santos"}` in `raw_user_meta_data`; verified the resulting `public.profiles` row has `role = 'patient'`, `is_clinic_admin = false`, `dentist_id = NULL`. Verified direct `UPDATE public.profiles`, `set_clinic_admin`, and `provision_dentist_account` are rejected.
4. **`4. Provision Dr. Maria Santos (Clinic Admin) and Dr. Adrian Reyes (Regular Dentist) via service_role`** — **PASS**
   - Verified `provision_dentist_account` promotes `santos` with `is_clinic_admin = true` and `reyes` with `is_clinic_admin = false`.
5. **`5. Unverified patient cannot book appointments`** — **PASS**
   - Verified a patient with `email_confirmed_at IS NULL` receives `P0001` (`HINT = EMAIL_NOT_VERIFIED`).
6. **`6. Atomic booking, service eligibility, working schedule, and overlap protection`** — **PASS**
   - Verified valid booking succeeds, unoffered service raises `SERVICE_NOT_OFFERED`, off-day booking raises `OUTSIDE_SCHEDULE`, exact same slot raises `SLOT_TAKEN`, and a 90-minute `braces-install` at `09:00` blocks the `10:00` slot (`SLOT_TAKEN` and `get_available_slots` marks both `09:00` and `10:00` unavailable).
7. **`7. True concurrent booking race: two parallel transactions for the same slot, exactly one succeeds`** — **PASS**
   - Fired two simultaneous `book_appointment` transactions on separate database connections for Dr. Santos at `14:00`; verified **1 fulfilled** and **1 rejected** with `SLOT_TAKEN`.
8. **`8. Patient isolation: Patient A cannot read, reschedule, or cancel Patient B appointments or profile`** — **PASS**
   - Verified RLS restricts `SELECT` on `appointments` and `profiles` to `patient_id = auth.uid()`, and `cancel_appointment` / `reschedule_appointment` on another patient's appointment ID fail with `NOT_FOUND`.
9. **`9. Regular dentist (Dr. Reyes) permissions and restrictions`** — **PASS**
   - Verified Dr. Reyes sees only appointments assigned to `reyes`, can confirm his own appointments, cannot complete future appointments (`FUTURE_APPOINTMENT`), cannot manage Dr. Santos's appointments/schedule/blocked dates/profile (`FORBIDDEN`), cannot insert clinic services, sees `0` rows from `audit_logs`, and cannot promote himself (`FORBIDDEN`).
10. **`10. Clinic Administrator (Dr. Maria Santos) clinic-wide permissions`** — **PASS**
    - Verified Dr. Santos sees all appointments across all dentists, can manage Dr. Reyes's blocked dates, is blocked from blocking dates with active appointments (`DATE_HAS_APPOINTMENTS`), can insert/delete clinic services, and can read `audit_logs`.
11. **`11. Rescheduling, decline, and slot release`** — **PASS**
    - Verified rescheduling moves the slot atomically and declining an appointment releases its reserved time slot for another patient to book.
12. **`12. Storage RLS & avatar ownership enforcement`** — **PASS**
    - Verified Patient A can upload to `avatars/<patientA>/avatar.jpg`, cannot upload to `avatars/<patientB>/...`, cannot upload to `dentist-photos`, and Patient B cannot read Patient A's private `avatars` row.
13. **`13. Audit logs & appointment history are strictly append-only`** — **PASS**
    - Verified `UPDATE` and `DELETE` on `public.audit_logs` and `public.appointment_history` fail with `42501` (`append-only`).
