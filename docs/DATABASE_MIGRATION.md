# LouDent — Database Migration, Backup & Rollback Guide

> **Safety Rule**: Never run destructive cleanup scripts against the live Supabase project or the legacy MariaDB database. Always inspect the existing database state and take a backup first.

---

## 1. Pre-Flight Inspection of the Target Supabase Database

Before applying any migration to `https://qlsfeqofszmtdkdedkqz.supabase.co`, run this **read-only** query in the Supabase SQL Editor to verify whether any tables or records already exist:

```sql
SELECT table_schema, table_name
FROM information_schema.tables
WHERE table_schema = 'public'
ORDER BY table_name;
```

If `public` is empty, proceed to Section 3. If tables already exist, export a logical backup before applying migrations.

---

## 2. Backup Procedures

### A. Legacy MariaDB Backup
Use the preserved PowerShell backup script in `server/scripts/backup-db.ps1` or run the read-only JSON exporter:

```bash
node migration-tools/export-mariadb.mjs
```

This connects with `SET SESSION TRANSACTION READ ONLY` and writes `migration-tools/output/mariadb-export.json` (gitignored, omitting password hashes, salts, sessions, and tokens).

### B. Supabase PostgreSQL Backup
From the Supabase Dashboard (**Database → Backups**) or via `pg_dump`:

```bash
pg_dump --clean --if-exists --quote-all-identifiers \
  --dbname="postgresql://postgres.<project-ref>:<password>@aws-0-<region>.pooler.supabase.com:5432/postgres" \
  --schema=public \
  --file="../loudent-supabase-backup-$(date +%Y%m%d).sql"
```

Keep all `.sql` backup files **outside** the Git repository.

---

## 3. Applying the PostgreSQL Migrations

All 5 migrations in `supabase/migrations/` are versioned and idempotent (`CREATE TABLE IF NOT EXISTS`, `CREATE OR REPLACE FUNCTION`, `ON CONFLICT DO NOTHING`):

1. `20261119000001_core_schema.sql`
2. `20261119000002_access_control.sql`
3. `20261119000003_business_functions.sql`
4. `20261119000004_storage.sql`
5. `20261119000005_seed_catalogue.sql`

### Isolated Verification First
Before touching the live project, run the isolated embedded PostgreSQL verification:

```bash
npm run test:db
```

---

## 4. Importing Legacy MariaDB Data (Optional)

If you have existing MariaDB appointments and users to migrate:

1. Run the read-only export:
   ```bash
   node migration-tools/export-mariadb.mjs
   ```
2. Run the dry-run validator (makes zero changes to Supabase):
   ```bash
   node migration-tools/import-supabase.mjs
   ```
3. When ready to import into the target project (server-side terminal only):
   ```bash
   SUPABASE_URL=https://qlsfeqofszmtdkdedkqz.supabase.co \
   SUPABASE_SECRET_KEY=sb_secret_... \
   LOUDENT_CONFIRM_IMPORT=YES \
   node migration-tools/import-supabase.mjs --execute
   ```
   *Note*: Legacy custom `scrypt` password hashes are **never** imported into Supabase Auth. Imported users retain their UUIDs and appointment history and set a fresh password via **Forgot Password**.

---

## 5. Rollback Instructions

If you need to roll back the LouDent schema on a development/staging Supabase database (after verifying you have a backup of any data you wish to keep):

```sql
-- Manual rollback script (DO NOT run on production without a verified backup)
BEGIN;
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP TRIGGER IF EXISTS on_auth_user_email_changed ON auth.users;
DROP TABLE IF EXISTS public.appointment_history CASCADE;
DROP TABLE IF EXISTS public.audit_logs CASCADE;
DROP TABLE IF EXISTS public.appointments CASCADE;
DROP TABLE IF EXISTS public.blocked_dates CASCADE;
DROP TABLE IF EXISTS public.dentist_schedules CASCADE;
DROP TABLE IF EXISTS public.dentist_services CASCADE;
DROP TABLE IF EXISTS public.services CASCADE;
DROP TABLE IF EXISTS public.profiles CASCADE;
DROP TABLE IF EXISTS public.dentists CASCADE;
DROP SCHEMA IF EXISTS private CASCADE;
COMMIT;
```
