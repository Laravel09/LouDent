# LouDent — Express API + MariaDB (`server/`)

The React frontend (`../src`) now calls this API for sessions, services, dentists, schedules,
slots, appointments and profiles. See the root `README.md` for the complete Windows setup and
`../IMPLEMENTATION_STATUS.md` for what has and has not been tested.

## What is included

- Express API at `http://localhost:3001/api`
- MariaDB InnoDB schema: users (Patient/Dentist), sessions, dentists, services,
  dentist services, weekly availability, blocked dates, appointments
- Secure salted Node.js `scrypt` password hashes; database-backed opaque session tokens
  via `HttpOnly`, `SameSite=Lax` cookies; no password hash in frontend
- Server-side role checks, patient ownership checks, trusted service pricing/duration,
  slot validation, overlap checks and transaction/row locks for concurrent requests
- Two roles only (`patient`, `dentist`). A dentist listed in `CLINIC_ADMIN_DENTIST_IDS`
  (default `santos`) is also **clinic administrator**: may confirm/decline/cancel/complete the
  appointments of every dentist and sees the whole clinic. Other dentists see and manage only
  appointments assigned to them. Checked on the server (`canManageAppointment` in `src/core.js`).
- Login throttling (8 failed attempts per email+IP per 15 min, in memory); expired sessions purged on login
- Seed with public clinic content only (no accounts); staff logins via the `staff` command; patients self-register
- Profile image storage as a small data URL (local coursework only)
- Automated tests (`npm.cmd test`): pure-logic unit tests, plus an **opt-in real-database
  integration test** (`test/api.integration.test.js`, skipped unless `RUN_DB_TESTS=1`)

## Windows setup
See the root `README.md` (install, database, `.env`, commands) and `../ACCOUNT_SETUP_AND_RECOVERY.md`
(backup, approved cleanup, staff logins, SMTP, password rotation).

```powershell
npm.cmd install
npm.cmd run migrate          # idempotent; the API refuses to start until it has been applied
npm.cmd run seed             # clinic content only (INSERT IGNORE); creates NO users and NO appointments
npm.cmd run staff -- provision
npm.cmd test
npm.cmd run check
npm.cmd run dev
```

## Scripts
| Script | Purpose |
|---|---|
| `migrate` | Applies `database/migrations/*.sql` (recorded in `schema_migrations`); never deletes data |
| `seed` | Services, dentist profiles, assignments, default weekly hours; every statement is `INSERT IGNORE` |
| `staff -- provision \| reset-password \| set-email \| list` | Creates/maintains the two dentist logins. Local terminal only; passwords shown once; not reachable by the API |
| `cleanup:local -- --dry-run \| --execute --backup-file=…` | Typed-confirmation, backup-verified, transactional deletion of accounts/appointments/sessions/tokens on local `loudent` only |
| `diagnose` | Database, schema, privileges, rolled-back INSERT, API and Vite-proxy checks |
| `mail:test -- address` | Sends one message through the configured transport; "ACCEPTED" only if SMTP accepted it |
| `scripts/backup-db.ps1` | Dated, verified `mariadb-dump` backup outside the project (+ optional restore check) |
| `test` / `check` | Unit tests (+ skipped real-DB tests) / syntax checks |

## Accounts
There are **no demo accounts**. Staff logins come from `staff -- provision`; patients register themselves.
Patients must verify their email before booking; password reset links expire after 20 minutes.

## Example API endpoints

| Method | Path | Access | Purpose |
|---|---|---|---|
| GET | `/api/health` | Public | Check database connection |
| GET | `/api/services` | Public | List services, prices and durations |
| GET | `/api/dentists` | Public | List dentist profiles |
| GET | `/api/dentists/santos/schedule` | Public | Weekly schedule and blocked dates |
| GET | `/api/slots?dentistId=santos&serviceId=checkup&date=2026-11-16[&excludeAppointmentId=…]` | Public | Available times for a day. `excludeAppointmentId` is honoured only for the patient who owns that appointment (so a reschedule can reuse its own slot) |
| POST | `/api/auth/register` | Public | Register a patient (name, email, Philippine phone, strong password, confirmation, consent); sends a verification email |
| POST | `/api/auth/verify-email` | Public | Confirm an email address with the one-time emailed token (24 h) |
| POST | `/api/auth/resend-verification` | Public | Generic answer; sends only for an unverified patient |
| POST | `/api/auth/forgot-password` | Public | Generic answer; emails a one-time token (20 min) |
| POST | `/api/auth/reset-password` | Public | New password with the token; ends all sessions of the account |
| GET | `/api/auth/mail-mode` | Public | `preview` / `smtp` / `none` |
| GET | `/api/dev/mail-preview?to=` | Preview mode, local machine only | Shows what would have been emailed (404 otherwise) |
| POST | `/api/auth/login` | Public | Authenticate; server sets session cookie |
| GET | `/api/auth/me` | Signed-in | Load current session |
| POST | `/api/auth/logout` | Signed-in | Delete session |
| PATCH | `/api/me` | Signed-in | Edit own name and phone |
| PUT | `/api/me/photo` | Signed-in | Save or remove profile photo |
| GET | `/api/appointments` | Signed-in | Patient: own. Clinic administrator: all. Other dentists: assigned to them |
| GET | `/api/appointments/:id` | Signed-in | Appointment detail (same visibility rules) |
| POST | `/api/appointments` | Verified patient | Book, starts as Pending (403 `EMAIL_NOT_VERIFIED` until the email is verified) |
| POST | `/api/appointments/:id/reschedule` | Patient owner | Reschedule, returns Pending |
| POST | `/api/appointments/:id/cancel` | Patient owner, assigned dentist, or clinic administrator | Cancel |
| PATCH | `/api/appointments/:id/status` | Assigned dentist or clinic administrator | Confirm, Decline (optional reason), Complete (never for a future time), Cancel |
| PUT | `/api/dentists/:id/schedule` | Same dentist | Replace weekly schedule (refused with 409 if it would strand a Pending/Confirmed appointment) |
| POST | `/api/dentists/:id/blocked-dates` | Same dentist | Block day if no active bookings |
| DELETE | `/api/dentists/:id/blocked-dates/:date` | Same dentist | Unblock day |
| PATCH | `/api/dentists/:id/profile` | Same dentist | Edit professional details |

Request bodies are JSON. Book appointment example:

```json
{"serviceId":"checkup","dentistId":"santos","date":"2026-11-16","time":"10:00 AM"}
```

Login request body:

```json
{"email":"you@example.com","password":"your-password"}
```

Sessions use an HTTP-only cookie. In the frontend, `fetch('/api/...',
{ credentials: 'include' })` sends it automatically via Vite's proxy.

## Concurrency design (what is claimed, and what is verified)
Booking and rescheduling run in one database transaction that first locks the dentist's row
(`SELECT … FOR UPDATE`), then re-reads the dentist's availability, blocked date and the active
appointments of that day with locking reads, and only then inserts/updates. Concurrent requests
for the same dentist are therefore serialized, so two overlapping appointments cannot both commit.
**This design has been reviewed but is only *verified* once `test/api.integration.test.js` has been
run successfully against a real MariaDB server** (it fires simultaneous booking and reschedule
attempts and checks that exactly one wins). Until then, treat it as unverified.

## Staff logins and administrator permission
`npm run staff -- provision` creates the logins for `santos` and `reyes` (idempotent, passwords hashed with salted
scrypt, shown once). A dentist is clinic administrator when listed in `CLINIC_ADMIN_DENTIST_IDS` (default
`santos`); change it in `.env` and restart the API. There is no endpoint that creates or promotes a dentist.

## Recovery tokens
256-bit random values; only the SHA-256 hash is stored (`auth_tokens`); one-time (atomic `UPDATE … WHERE used_at IS NULL`);
password reset 20 min, email verification 24 h; a new request invalidates earlier unused ones; expiry is computed by the
database clock in UTC. Responses to forgot-password / resend-verification are identical for known and unknown
addresses, and limited per address (5 / 15 min) and per IP. Per-IP limits can be scaled with
`AUTH_RATE_LIMIT_IP_SCALE` (everyone behind the Vite proxy shares one IP).

## Real-database integration tests
See the root `README.md` ("Real-database integration tests"): create `loudent_test` from
`database/schema.test.sql`, copy `.env.test.example` to `.env.test`, seed it, then run
`$env:RUN_DB_TESTS = "1"; npm.cmd test`. The suite refuses to run unless `DB_NAME` ends in `_test`.

## Constraints and important warnings

- The API and database were **not run together** by the author of this package (no MariaDB server was
  available). Offline unit tests and syntax checks passed; everything else is for you to verify
  on Windows. Report any SQL error you see; it will be a real bug to fix.
- No payment processing, email/SMS sending, medical records, or third admin role.
- No backend access should be exposed directly to the public internet without a
  production security review (HTTPS, CSRF review, rate limiting beyond the simple in-memory one,
  validation, audit logs, backups, privacy and security evaluation).
- Profile photos are stored as small base64 data URLs for coursework convenience;
  production should store images in managed object storage instead.
- Demo credentials and demo clinician biographies/portraits must not be presented
  as verified real-world clinicians. Do not enter real patient records in this demo.
- **Never** expose your DB password in React/TypeScript frontend files.
