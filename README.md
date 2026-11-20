# LouDent — Dental Appointment Management System (Supabase Edition)

LouDent is a full-stack dental appointment management system connecting patients with dentists (Dr. Maria Santos and Dr. Adrian Reyes), migrated from a legacy Express + MariaDB stack to a **Supabase-first architecture** (PostgreSQL 15/17, Supabase Auth, Row Level Security, PostgreSQL RPC functions, Supabase Storage, and Supabase Edge Functions) ready for **Vercel Hobby** deployment.

The approved LouDent visual design, color palette (`#12213B` navy, `#2563EB` blue, `#0EA5A8` teal), typography (`Inter`), responsive layouts, and patient/dentist workflows are preserved in full.

---

## Architecture Overview

| Layer | Technology | Implementation |
|---|---|---|
| **Frontend** | React 19, TypeScript, Vite 8, Tailwind CSS 4 | `src/App.tsx`, `src/screens/*`, `src/components/*` |
| **Supabase Client** | `@supabase/supabase-js` v2 (PKCE flow) | `src/lib/supabase.ts`, `src/lib/authLinks.ts`, `src/api/client.ts` |
| **Database** | Supabase PostgreSQL + `btree_gist` | `supabase/migrations/20261119000001_core_schema.sql` |
| **Access Control** | PostgreSQL RLS + `private.*` helpers | `supabase/migrations/20261119000002_access_control.sql` |
| **Business Logic** | Atomic `SECURITY DEFINER` RPC functions | `supabase/migrations/20261119000003_business_functions.sql` |
| **File Storage** | Supabase Storage (`avatars` private, `dentist-photos` public) | `supabase/migrations/20261119000004_storage.sql` |
| **Seed Data** | Idempotent clinic catalog (2 dentists, 13 services) | `supabase/migrations/20261119000005_seed_catalogue.sql` |
| **Privileged Edge Function** | Deno + `jose` JWKS (`ES256`) JWT verification | `supabase/functions/provision-dentist/index.ts` |
| **Legacy Reference** | Preserved Express + MariaDB implementation | `server/` (retained as legacy reference; not used at runtime) |

---

## Roles & Permissions

There are **exactly two application roles** stored in `public.profiles.role`:

1. **`patient`**
   - Self-registers via Supabase Auth (`handle_new_user` trigger forces `role = 'patient'` regardless of user-supplied metadata).
   - Must verify email (`auth.users.email_confirmed_at IS NOT NULL`) before `public.book_appointment` permits booking.
   - Manages own profile and private avatar (`avatars/<uid>/...` via signed URLs).
   - Books, views, reschedules, and cancels own appointments only.
2. **`dentist`**
   - **Dr. Adrian Reyes (`dentist_id = 'reyes'`, `is_clinic_admin = false`)**:
     - Views and manages (Confirm, Decline, Complete, Cancel) only appointments assigned to `reyes`.
     - Manages his own weekly schedule, blocked dates, and public dentist profile/photo.
     - Cannot view Dr. Santos's appointments, edit clinic services, provision staff, or view `audit_logs`.
   - **Dr. Maria Santos (`dentist_id = 'santos'`, `is_clinic_admin = true` — Clinic Administrator)**:
     - Views and manages all clinic appointments across all dentists.
     - Manages schedules and blocked dates for any dentist.
     - Manages clinic services and dentist-service assignments.
     - Provisions dentist accounts via the `provision-dentist` Edge Function (`private.has_permission('clinic.provision_staff')`).
     - Reads the append-only `public.audit_logs` table.

---

## Quick Start

1. **Install dependencies**
   ```bash
   npm install
   ```
2. **Configure environment variables**
   Copy `.env.example` to `.env.local` and set your Supabase publishable key:
   ```ini
   VITE_SUPABASE_URL=https://qlsfeqofszmtdkdedkqz.supabase.co
   VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
   ```
3. **Verify environment safety**
   ```bash
   npm run check:env
   ```
4. **Run the development server**
   ```bash
   npm run dev
   ```
5. **Run tests & production build**
   ```bash
   npm run typecheck
   npm test
   npm run test:db
   npm run build
   ```

---

## Documentation Index

- [Local Installation Guide](docs/LOCAL_INSTALL.md)
- [Supabase Setup Guide](docs/SUPABASE_SETUP.md)
- [Database Migration, Backup & Rollback Guide](docs/DATABASE_MIGRATION.md)
- [SMTP & Email Configuration Guide](docs/SMTP_SETUP.md)
- [Vercel Hobby Deployment Guide](docs/VERCEL_DEPLOYMENT.md)
- [Application Security Checklist](docs/SECURITY_CHECKLIST.md)
- [Testing & Verification Report](docs/TESTING_REPORT.md)
- [Free-Tier Restrictions & Known Limitations](docs/KNOWN_LIMITATIONS.md)
