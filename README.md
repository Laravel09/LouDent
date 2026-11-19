# LouDent — Dental Appointment System (React + Express + MariaDB)

Local coursework application. Exactly **two roles**: **Patient** and **Dentist**. **Dr. Maria Santos is also the
clinic administrator** (manages appointments of every dentist); **Dr. Adrian Reyes** manages only his own.
No payments, no medical records, no third portal, **no demo accounts**.

| Part | Technology | Default address |
|---|---|---|
| Frontend (`src/`) | React 19 + TypeScript + Vite + Tailwind v4 | http://localhost:5173/ |
| API (`server/`) | Node.js + Express 5 | http://localhost:3001/api |
| Database | MariaDB (InnoDB) database `loudent` | 127.0.0.1:3306 |

Vite proxies `/api` to the API. Authentication is a server-side session in an HttpOnly cookie; nothing about the
session is kept in `localStorage`/`sessionStorage`.

> **Status:** see `IMPLEMENTATION_STATUS.md`. The complete system (real MariaDB + real Express + Vite together)
> and the one-time local data cleanup had **not been run by the author** when this package was prepared.
> Not production-ready. Do not store real patient data or expose it to the internet without a security review.

## Accounts and email
- **Patients** use **Sign Up** and must confirm their email (a one-time link, valid 24 h) before they can book.
- **Forgot password?** on both login pages (one-time link, valid 20 min).
- **Staff logins** (Dr. Santos, Dr. Reyes) are created only from the command line:
  `npm.cmd run staff -- provision` (passwords shown once in your terminal).
- Email goes through a provider you configure privately in `server/.env`; in development a clearly labelled
  **preview** mode shows the messages instead of sending them.
- Full runbook, including **backup → dry run → approved cleanup → staff provisioning → SMTP setup → password
  rotation**: **`ACCOUNT_SETUP_AND_RECOVERY.md`**.

## Windows setup (VS Code, Node.js, MariaDB)

### 1. Install
- **Node.js LTS** 22.x (20.19+ works) — `node --version`.
- **MariaDB Community Server** https://mariadb.org/download/ (HeidiSQL is bundled).
- **VS Code**; open the folder that contains this README.

### 2. Create the database and a limited database user (once)
In HeidiSQL as `root`: run **all of `server/database/schema.sql`**, then (choose your own strong password):
```sql
CREATE USER IF NOT EXISTS 'loudent_app'@'127.0.0.1' IDENTIFIED BY 'REPLACE_WITH_YOUR_STRONG_PASSWORD';
GRANT SELECT, INSERT, UPDATE, DELETE ON loudent.* TO 'loudent_app'@'127.0.0.1';
```
Copy `server/.env.example` to `server/.env` and set `DB_PASSWORD`. **Never share or commit `.env`.**

### 3. Prepare and start the API (terminal 1, PowerShell, in `server`)
```powershell
npm.cmd install
npm.cmd run migrate           # adds email-verification / password-reset tables (safe to repeat)
npm.cmd run seed              # clinic content only: services, 2 dentist profiles, hours (creates NO users)
npm.cmd run staff -- provision   # the two staff logins; save the passwords it prints
npm.cmd test
npm.cmd run check
npm.cmd run dev
```
Open http://localhost:3001/api/health → `{"status":"ok","database":"connected"}`.
If something misbehaves: `npm.cmd run diagnose`.

### 4. Start the frontend (terminal 2, in the `LouDent` root)
```powershell
npm.cmd install
npm.cmd run typecheck
npm.cmd run build
npm.cmd run dev
```
Open **the exact URL Vite prints** (normally http://localhost:5173/). The first patient is you: **Sign Up**.

### Upgrading a database that already holds old demo data
Follow `ACCOUNT_SETUP_AND_RECOVERY.md` (rotate password → migrate → **back up** → dry run → cleanup → provision).
The API prints a notice at start-up while old `@loudent.demo` accounts still exist.

## What the app does
- Services, dentists, schedules and open time slots come from MariaDB.
- Patient: sign up, verify email, log in (session restored on refresh), six-step booking (server decides price,
  duration and availability), reschedule, cancel, profile + photo, forgot password.
- Dentist: confirm / decline (optional reason) / complete / cancel, weekly hours with breaks, blocked dates,
  professional profile + photo. Completing a future appointment is refused. Santos sees and manages the whole
  clinic; Reyes only his own appointments.
- Pending and Confirmed bookings block overlapping times **for the same dentist**; other dentists stay bookable.
- Status changes reach the other browser without a manual refresh (background refresh every 20 s and on focus).
- Contact is an honest `mailto:` draft; it does not send email. Empty lists show friendly empty states.

## Tests
| Command | What it runs |
|---|---|
| `cd server; npm.cmd test` | Unit tests (hashing, rules, authorization, recovery tokens/expiry/enumeration/rate limits, mail transports, cleanup safety, staff provisioning). Real-database tests are **skipped** unless enabled. |
| `$env:RUN_DB_TESTS="1"; npm.cmd test` (see below) | **Opt-in real-database integration tests** (needs MariaDB) |
| `npm.cmd run typecheck` / `build` (root) | TypeScript check and Vite production build |

### Real-database integration tests (recommended before relying on the app)
They create/delete rows, so they run on a **separate database named `loudent_test`**; they refuse any other name,
and the cleanup tool refuses `loudent_test`:
1. HeidiSQL: run `server/database/schema.test.sql`, then
   ```sql
   CREATE USER IF NOT EXISTS 'loudent_test_app'@'127.0.0.1' IDENTIFIED BY 'REPLACE_WITH_A_TEST_PASSWORD';
   GRANT SELECT, INSERT, UPDATE, DELETE ON loudent_test.* TO 'loudent_test_app'@'127.0.0.1';
   ```
2. Copy `server/.env.test.example` to `server/.env.test` and set `DB_PASSWORD`.
3. In `server`:
   ```powershell
   $env:DOTENV_CONFIG_PATH = ".env.test"; npm.cmd run seed
   $env:RUN_DB_TESTS = "1"; npm.cmd test
   ```
   Covered: sign-up, verification, booking gate, password reset (expiry, reuse, sessions), photos, booking,
   reschedule, status changes, administrator vs non-admin permissions, schedules/blocked dates, **concurrent
   bookings**, and the cleanup/staff-provisioning logic (on the test database only).

## Folder map
- `src/api/` typed API client + catalog; `src/App.tsx` session, data loading, polling; `src/screens/`, `src/components/` UI
  (`AuthRecoveryScreens.tsx` = forgot / reset / verify)
- `server/src/` `app.js` routes · `core.js` pure rules · `recovery.js` verification/reset logic · `mail.js` transports ·
  `maintenance.js` cleanup safety · `staff-lib.js` staff logins · `seed.js` · `index.js`
- `server/scripts/` `migrate.js`, `staff.js`, `cleanup-local-data.js`, `diagnose.js`, `mail-test.js`, `backup-db.ps1`
- `server/database/` `schema.sql`, `schema.test.sql`, `migrations/`
- `server/test/` unit tests and the opt-in integration test
