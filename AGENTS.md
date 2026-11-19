# LouDent — agent notes

Full-stack local coursework app: React 19 + TypeScript + Vite + Tailwind v4 (`src/`), Express 5 API
(`server/`), MariaDB. Run instructions: `README.md`. Test status: `IMPLEMENTATION_STATUS.md`; account runbook: `ACCOUNT_SETUP_AND_RECOVERY.md`.
Nothing is running unless you start it; never claim it works until you have seen it run.

## Scope rules
- Exactly two roles: Patient and Dentist. Dr. Santos (`CLINIC_ADMIN_DENTIST_IDS`, default `santos`) is
  also clinic administrator. No third portal, no payments, no medical records, no demo accounts.
- Authentication is the server session cookie only. Never store passwords, tokens or session data in
  localStorage/sessionStorage. Never put DB credentials in frontend code. Never commit `.env*`.
- Preserve the approved UI and booking workflow; do not redesign.
- Server is authoritative for price, duration, availability, permissions and status transitions.

- Destructive cleanup exists only as `npm run cleanup:local` (typed confirmation, verified backup, local `loudent` only). Never
  call it from install/dev/seed/start-up and never run it against `loudent_test` or any other database. Seed creates no users.
- Staff logins only via `npm run staff` (local terminal). Never add public dentist registration. Tokens: hash only, one-time, expiring.
- Email transport `preview` is development-only and must stay refused in production.

## Structure
- `src/api/client.ts` typed API client (relative `/api`, `credentials: "include"`); `src/api/catalog.tsx` services context.
- `src/App.tsx` session, data loading, 20 s polling, async handlers; `src/screens/*`, `src/components/*` UI.
- `server/src/app.js` routes, `core.js` pure rules (unit-tested), `seed.js`, `db.js`; `server/database/schema.sql`.
- `server/test/` unit tests + opt-in real-database integration test (`RUN_DB_TESTS=1`, database name must end `_test`).

## Rules for changes
- Keep: abandoned reschedule must not affect later bookings; slot conflicts use server data and exclude the
  appointment being rescheduled; dentists manage only their own appointments unless clinic administrator;
  future appointments cannot be completed; image fallbacks; human-readable dates; per-account photos.
- Run `npm run typecheck`, `npm run build` (root) and `npm test`, `npm run check` (server) before finishing;
  report honestly what you could not run.
