# Implementation status — Option A (clean local data, two staff logins, registration repair, email recovery)

Prepared in a sandbox with **no network, no MariaDB server, no access to your PC or your database, and no
npm registry**. Read section 1 first: **no step that touches your real database has been executed.**

## 1. NOT RUN / NOT VERIFIED (you must do these on Windows)

| Item | Status | What to do |
|---|---|---|
| Rotate the exposed DB password | **NOT DONE** (needs your MariaDB) | `ACCOUNT_SETUP_AND_RECOVERY.md` step 1 |
| `npm install`, real `typecheck`, Vite `build`, `npm run dev` | **NOT RUN** | root README |
| `npm run migrate` on MariaDB (`ADD COLUMN IF NOT EXISTS`, new table, `MEDIUMTEXT`, picture copy) | **NOT RUN** — the SQL has never been executed | step 3, then `npm run diagnose` |
| **Backup** of your `loudent` database (`backup-db.ps1`) | **NOT RUN** — no backup exists yet | step 4 |
| **Dry run** and **approved cleanup** on your `loudent` database | **NOT RUN — NOTHING WAS DELETED** | steps 5–6, only after a verified backup |
| Staff provisioning (`npm run staff -- provision`) on real MariaDB | **NOT RUN** | step 7 |
| Real-database integration tests (`loudent_test`) incl. **concurrent booking** | **NOT RUN** — concurrency remains *unverified* | root README → "Real-database integration tests" |
| Real SMTP delivery (`npm run mail:test`) | **NOT RUN** | `ACCOUNT_SETUP_AND_RECOVERY.md` → SMTP |
| SQL of the MariaDB recovery store (`recovery.js` → `mariadbStore`) | **NOT RUN** (only its logic, with an in-memory store) | covered by the integration test |
| `nodemailer` dependency version `^6.9.0` | **NOT INSTALLED here** | `npm install` resolves it |
| HeidiSQL backup acceptance (its end-of-file block / database name) | **NOT TESTED** — written from HeidiSQL's usual format | prefer `backup-db.ps1`; tick "Create" for the database in HeidiSQL |

### Registration error ("The LouDent server is not responding correctly")
**Root cause: NOT DETERMINED.** It could not be reproduced without your database. What was established by reading
the code and schema: the sign-up INSERT and the `users` columns agree (no schema drift in the delivered version);
the server's own 500 answer is JSON ("Unexpected server error"), so the exact wording you saw is produced only when
the answer is **not JSON** — which is what the Vite dev proxy returns when it gets no usable reply from the API
(API stopped/restarting/crashed, or the proxy could not reach it). Candidates: the API was not running or was
restarting (`node --watch`) at that moment; the proxy target is not reachable; the running code is older than the
package. I did **not** blame fake Gmail addresses (the server never validated mailboxes) and did not delete anything to
hide it. What changed so the cause becomes visible: (a) the API logs `API error [id] … code/errno/sqlState` without
SQL parameters (the previous logging could have printed password hashes), (b) the id is shown on screen,
(c) the form now distinguishes invalid input (400), duplicate email (409), too many requests (429), server fault (5xx)
and unreachable API, (d) `npm run diagnose` checks the database, schema, privileges, a rolled-back sign-up INSERT, and
calls the API **directly and through the Vite proxy** to separate a database fault from a proxy/API-down problem.
Run it, then send me the redacted `API error [...]` line if sign-up still fails.

## 2. What DID run here, and what it does (and does not) prove

| Check | Result | Notes |
|---|---|---|
| Server unit tests `node --test` | **PASS 19 / 19** (12 real-DB tests skipped by design) | Real code: hashing, rules, authorization, **recovery service** (hashed one-time tokens, 24 h / 20 min expiry, supersede, enumeration-safe answers, rate limits, session invalidation, reset race: exactly one winner, no verification bypass, no account creation), **mail transports** (preview refused in production, SMTP "delivered" only if accepted), **cleanup safety** (target guard, backup verification, FK-safe plain-DELETE order, rollback on failed verification / changed preserved data / leftover dentist picture), **staff provisioning** (exactly two, strong distinct hashed passwords, idempotent, never silently reset), validators, safe error logging. Storage is an in-memory/fake object, **not MariaDB**. |
| `npm run check` (`node --check` on every server file) | **PASS** | Syntax only. |
| `tsc` with a stand-in for React's types | **PASS (no errors)** | Weaker than the real `@types/react` check. |
| esbuild + Tailwind bundle of the same source | **builds** | Not the Vite build. |
| Browser suites (headless Chromium) against a **simulated API** | **A 28/28, B 44/44, C 25/25, D 27/27, E 55/55** | The simulator runs the **real `recovery.js`, `mail.js` and `core.js`** with in-memory storage; routing/other endpoints are re-implemented. It proves the frontend and the recovery logic behave correctly for this contract, **not** that Express + MariaDB do. |
| `api.integration.test.js` against the simulator | **PASS 10/10** (2 DB-only tests skipped) | Validates the test script itself. Its concurrency test is meaningless against a single-threaded simulator. |

Suite E (new, 55 checks): empty/invalid sign-up sends nothing; Philippine phone and password rules; server 400 with
client checks bypassed; role/dentist/admin in the request are ignored (patient only); duplicate 409; 500 / network /
non-JSON-502 each show a distinct message; sign-up success says "verify" and never claims verification; the dev preview
is labelled "no real email was sent"; no secrets in storage; unverified login shows a banner and **booking is refused**
(UI + API 403 `EMAIL_NOT_VERIFIED`); the emailed link verifies once, token is removed from the address bar, reuse
refused, expiry after 24 h, resend identical for known/unknown addresses; forgot-password answers are identical for known
and unknown addresses and create no account; reset flow (weak/mismatch rejected, success, **other browser logged out**,
old password rejected, new works, reuse refused with "Request a new link"); supersede, 19 min valid / 21 min expired;
unknown token 400; reset does not verify email; rate limit (429); dentist "Forgot password?" works and Reyes stays
non-admin; neither login page has a demo button; empty states (no appointments) show no errors; recovery screens have no
horizontal overflow at 390 and 768 px.
Suites A–D (public/auth/photos, booking workflows, sync/layout, clinic administrator) were re-run against the new
account model (staff typed in, patients registered + verified): all pass.

## 3. Bugs found by the tests and fixed
- **StrictMode double request (dev only):** `vite dev` runs effects twice; the verify screen consumed the one-time
  token on the first call and showed "Link Not Valid" on the second. Now exactly one request per token.
- **Per-IP limits shared by everyone** behind the Vite proxy (one IP): made scalable (`AUTH_RATE_LIMIT_IP_SCALE`,
  defaults raised); per-address limits remain strict.
- **Dentist pictures lived on the dentist's login row** and would have been destroyed by deleting staff users.
  They now live on the dentist profile (`dentists.photo_url`, widened to MEDIUMTEXT); the migration copies existing
  pictures and clears the legacy copy; the cleanup refuses to run if a picture is still on a login row and proves the
  dentist table is unchanged by content fingerprint.
- **Error logging** could have printed SQL parameters (emails, hashes) — replaced by a safe summary.
- A weak test (race outcome depended on hashing speed) was made deterministic.

## 4. Behaviour you should know about
- Unverified patients **can log in but cannot book** (clear banner and message). Resetting a password does **not** verify
  an email. Staff accounts are created by the command line and count as verified.
- The migration is **required**; the API refuses to start (with instructions) until it is applied.
- The seed no longer creates users. Until you run `staff -- provision`, nobody can log in as a dentist.
- Initial staff emails `*.test` receive no mail; reset staff passwords with `npm run staff -- reset-password`.
- `localStorage`/`sessionStorage` hold no authentication, tokens or passwords (verified in the browser suites).
- Not production-ready; local coursework only.

## 5. Changed files (since the previous delivery)
Added: `ACCOUNT_SETUP_AND_RECOVERY.md`, `IMPLEMENTATION_STATUS.md`, `server/src/{recovery,mail,mail-templates,maintenance,staff-lib}.js`,
`server/scripts/{migrate,staff,cleanup-local-data,diagnose,mail-test}.js`, `server/scripts/backup-db.ps1`,
`server/database/migrations/001_auth_recovery_and_dentist_photos.sql`, `server/test/{recovery,maintenance}.test.js`,
`src/screens/AuthRecoveryScreens.tsx`, `src/api/validation.ts`.
Changed: `server/src/{app,core,index,seed}.js`, `server/database/{schema,schema.test}.sql`, `server/package.json`,
`server/.env.example`, `server/.env.test.example`, `server/test/api.integration.test.js`, `server/README.md`, `README.md`,
`AGENTS.md`, `START_HERE_FOR_CLAUDE.md`, `.gitignore`, `src/{App.tsx,types.ts}`, `src/api/client.ts`,
`src/screens/{PublicScreens,PatientScreens,ExtraScreens}.tsx`.
Removed: `INTEGRATION_STATUS.md` (replaced by this file).
