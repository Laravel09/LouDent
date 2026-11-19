# LouDent — start here

Full-stack app (React frontend + Express API + MariaDB). Read `README.md` (Windows setup, accounts,
tests) and `IMPLEMENTATION_STATUS.md` (exactly what was and was not tested) and `ACCOUNT_SETUP_AND_RECOVERY.md`, then `AGENTS.md` (rules).

1. Server: `cd server; npm.cmd install; npm.cmd run migrate; npm.cmd run seed; npm.cmd run staff -- provision; npm.cmd test; npm.cmd run check; npm.cmd run dev`
2. Frontend: `npm.cmd install; npm.cmd run typecheck; npm.cmd run build; npm.cmd run dev`
3. Real database tests are opt-in (see README). They had not been run when this package was prepared.
4. Keep two roles only; do not weaken sessions, hashing, authorization or SQL parameterization.
