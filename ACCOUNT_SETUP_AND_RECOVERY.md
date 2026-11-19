# Account setup, local data reset and email recovery

This is the step-by-step runbook for your **local development** database (`loudent` on `127.0.0.1`).
Nothing in it runs automatically: no cleanup happens on `npm install`, `npm run dev`, `npm run seed`
or API start-up. **Never paste your `.env`, a password or a reset link into a chat.**

> Honest status: the scripts below were written and unit-tested, but the author had no access to your
> MariaDB, so **none of the database steps have been run yet**. Treat your own run as the first real test,
> and use the *dry run* before anything destructive. See `IMPLEMENTATION_STATUS.md`.

## What the system does now
- **Staff** (exactly two dentist logins): Dr. Maria Santos (`santos`, clinic administrator, all appointments)
  and Dr. Adrian Reyes (`reyes`, own appointments only). Created **only** from the command line, never through
  the web API, and there is no way to register as a dentist.
- **Patients** create their own account with **Sign Up**, then confirm their email address
  (the link is valid 24 hours, works once). Until they do, they can log in and look around but **cannot book**.
- **Forgot password?** on both login pages: a one-time link valid **20 minutes**; a new request cancels the
  older one; a successful reset signs the account out everywhere. The reply is always the same
  ("If that email address is registered…"), so nobody can discover which emails have accounts.
- No demo accounts, no demo buttons, no sample passwords. The seed creates only clinic content.

## Order of operations (PowerShell, in `LouDent\server` unless stated)

### 1. Rotate the database password (your previous one was exposed)
In HeidiSQL, logged in as `root`:
```sql
SELECT user, host FROM mysql.user WHERE user = 'loudent_app';   -- note every host listed
ALTER USER 'loudent_app'@'127.0.0.1' IDENTIFIED BY 'PUT-A-NEW-STRONG-PASSWORD-HERE';
FLUSH PRIVILEGES;
```
(Run `ALTER USER` for each host row you saw, e.g. `'localhost'`.) Then open `server\.env` **in VS Code** and
replace the value after `DB_PASSWORD=` with the new password. Save. Restart the API. Do not type the password
anywhere else. If you also used it for `loudent_test_app`, rotate that one the same way.

### 2. Update dependencies and `.env`
```powershell
npm.cmd install            # adds nodemailer (only used when MAIL_TRANSPORT=smtp)
```
Copy these keys from `server\.env.example` into your private `server\.env` (keep your existing DB values):
`APP_BASE_URL`, `MAIL_TRANSPORT=preview`, `MAIL_FROM`, `MAIL_SMTP_*` (leave SMTP empty for now).

### 3. Apply the schema migration (adds verification/reset tables; moves dentist pictures onto the dentist profile)
```powershell
npm.cmd run migrate        # idempotent, never deletes data
npm.cmd run diagnose       # database, schema, privileges, a rolled-back test INSERT, and the Vite proxy
```
The API refuses to start with a clear message if this migration is missing.

### 4. Back up BEFORE any deletion (mandatory)
```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\backup-db.ps1 -RestoreCheck
```
This writes `%USERPROFILE%\LouDentBackups\loudent-YYYYMMDD-HHMMSS.sql` (outside the project, never in Git or the ZIP),
checks that it is non-empty, contains table definitions and data, and finished writing, and (with
`-RestoreCheck`, which asks for the MariaDB **root** password and does not store it) restores it into a
throw-away database `loudent_restore_check`, compares row counts, then drops only that throw-away database.
If `mariadb-dump` is not found, add `C:\Program Files\MariaDB <version>\bin` to PATH, or use HeidiSQL:
**Tools → Export database as SQL**, database `loudent`, **tick "Create" for the database**, tables = *Create* + data =
*Insert*, one file into `%USERPROFILE%\LouDentBackups`.

**Restore procedure** (only if you ever need to undo; it replaces the current tables with the backup):
```powershell
mariadb -u root -p < "C:\Users\<you>\LouDentBackups\loudent-YYYYMMDD-HHMMSS.sql"
```
(or HeidiSQL → *File → Run SQL file…*). Then restart the API. Use the full path to `mariadb.exe` if it is not in PATH.

### 5. Dry run (changes nothing)
```powershell
npm.cmd run cleanup:local -- --dry-run
```
It prints the exact target, the rows it **would delete** (appointments, sessions, auth tokens, users with the
patient/dentist split) and the tables it **keeps** (dentists, services, dentist_services, weekly_availability,
blocked_dates). It refuses to run unless `DB_NAME=loudent`, `DB_HOST` is local and `NODE_ENV` is not `production`;
it will never act on `loudent_test`.

### 6. Execute the approved cleanup
```powershell
npm.cmd run cleanup:local -- --execute --backup-file="C:\Users\<you>\LouDentBackups\loudent-YYYYMMDD-HHMMSS.sql"
```
It re-verifies the backup (age ≤ 24 h, definitions + data present, finished), then makes you type
`DELETE LOUDENT LOCAL DATA`. One transaction: appointments → sessions → auth_tokens → users (plain `DELETE`s; no
`TRUNCATE`, no `DROP`, no foreign-key-check switching). It proves the kept tables are unchanged (row counts **and**
content fingerprints, including dentist pictures) and rolls everything back if any check fails. A before/after
**count-only** report is printed and saved in `server\reports\` (no names, emails or secrets).
Afterwards: 0 patients, 0 appointments, 0 sessions, 0 tokens, 0 users (staff come next).

### 7. Create the two staff logins
```powershell
npm.cmd run staff -- provision
```
Two different strong random passwords are shown **once** in this terminal (save them privately); only salted
scrypt hashes go into MariaDB. Default logins are `santos@loudent.test` and `reyes@loudent.test`. These addresses
**do not receive real mail**. To use real, staff-controlled addresses from the start:
```powershell
npm.cmd run staff -- provision --santos-email=maria@yourclinic.example --reyes-email=adrian@yourclinic.example
```
Rerunning `provision` never creates duplicates and never changes an existing password. Other staff commands:
```powershell
npm.cmd run staff -- list
npm.cmd run staff -- set-email reyes adrian@yourclinic.example
npm.cmd run staff -- reset-password santos            # new random password, shown once
npm.cmd run staff -- reset-password santos --prompt   # type your own (hidden input)
```
A staff password reset signs that account out everywhere. Until a real address and SMTP are configured, **this
command is how staff passwords are reset** (the emailed reset link cannot reach a `.test` address).

### 8. Optional: re-seed clinic content (safe)
```powershell
npm.cmd run seed        # INSERT IGNORE only: never overwrites edited profiles, never creates users or appointments
```

### 9. Start everything and create the first real patient yourself
Terminal 1 (`server`): `npm.cmd run dev` · Terminal 2 (root): `npm.cmd run dev` → open the URL Vite prints.
**Sign Up** → you see "Account Created" and, in preview mode, a yellow **DEVELOPMENT MAIL PREVIEW — no real email was
sent** panel with an *Open the emailed link* button (the same message is printed in the API terminal). Opening it
verifies the address; then log in and book.

## Email: development preview vs real delivery
| `MAIL_TRANSPORT` | Behaviour |
|---|---|
| `preview` (default in development) | Nothing is sent. Messages appear in the API terminal and the dev panel. **Refused automatically when `NODE_ENV=production`.** |
| `smtp` | Real delivery through your SMTP provider. Reported as delivered only if the SMTP server accepted the recipient. |
| `none` (default in production) | Nothing is sent; requests still answer generically; the API logs that mail is not configured. |

### Configure SMTP privately (example: Gmail as the *sender*)
You do **not** need Google OAuth or "Continue with Google"; patients never give you a Gmail password. In
`server\.env` (never in Git or chat):
```
MAIL_TRANSPORT=smtp
MAIL_FROM="LouDent <your.address@gmail.com>"
MAIL_SMTP_HOST=smtp.gmail.com
MAIL_SMTP_PORT=587
MAIL_SMTP_SECURE=false
MAIL_SMTP_USER=your.address@gmail.com
MAIL_SMTP_PASS=<a 16-character Google App Password>
APP_BASE_URL=http://localhost:5173
```
Google requires 2-Step Verification, then Google Account → Security → *App passwords*. Any SMTP provider
(Brevo, Mailgun, SendGrid, your hosting mail) works the same way. Restart the API, then prove it:
```powershell
npm.cmd run mail:test -- an.address.you.can.read@example.com
```
It says **ACCEPTED** only when the SMTP server accepted the message. For anything public, send from a domain you
own (SPF/DKIM), use HTTPS in `APP_BASE_URL`, and review the hardening notes in `server/README.md`.

## New API endpoints
| Method | Path | Notes |
|---|---|---|
| POST | `/api/auth/register` | Patients only. Validates name, email, Philippine phone, password strength, confirmation, consent. 400 invalid · 409 duplicate · 429 too many · 500 fault. Sends the verification email. |
| POST | `/api/auth/verify-email` | `{token}` one-time, 24 h. |
| POST | `/api/auth/resend-verification` | `{email}` generic answer; limited per address and IP. |
| POST | `/api/auth/forgot-password` | `{email}` generic answer; token valid 20 min; supersedes older tokens. |
| POST | `/api/auth/reset-password` | `{token,password}` one-time; ends all sessions of that account; does not verify the email. |
| GET | `/api/auth/mail-mode` | `preview` / `smtp` / `none` (so the UI can show the development notice). |
| GET | `/api/dev/mail-preview?to=` | Only in preview mode and only from the local machine; otherwise 404. |

Tokens are 256-bit random values; only their SHA-256 hash is stored (`auth_tokens`), never the token. Passwords use
the existing salted scrypt hashes. Sessions stay HttpOnly cookies; nothing is kept in `localStorage`/`sessionStorage`.

## If sign-up says "The server hit a problem" / "not responding correctly"
Run `npm.cmd run diagnose` with the API and Vite running. It checks MariaDB, the schema (columns the code needs),
the database user's privileges, a rolled-back sign-up-style INSERT, and calls both `http://127.0.0.1:3001` and the
Vite proxy `http://localhost:5173` so you can tell **a database fault from a proxy/API-down problem**. The API
terminal now prints a line such as `API error [ab12cd34] POST /api/auth/register -> ER_… sqlState=…` (no passwords or
SQL parameters); the same short id is shown on screen. That line identifies the cause. (The author could not
reproduce the earlier failure without your database; see `IMPLEMENTATION_STATUS.md`.)

## Safety summary
Backups stay outside the project and out of Git; `.env*`, `server/reports/` and `*.sql` backups are ignored; the
cleanup is a separate, typed-confirmation command; the test suite works only on a database whose name ends in
`_test`; the staff tool is not reachable from the web.
