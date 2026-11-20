# LouDent — Supabase Setup Guide

Target Project URL: `https://qlsfeqofszmtdkdedkqz.supabase.co`  
JWKS Endpoint: `https://qlsfeqofszmtdkdedkqz.supabase.co/auth/v1/.well-known/jwks.json` (`ES256` / `P-256`)

---

## 1. Apply the SQL Migrations (After Pre-Flight Check)

Review [DATABASE_MIGRATION.md](DATABASE_MIGRATION.md) before modifying the live database. Once authorized, execute the 5 versioned migrations in order via the Supabase SQL Editor or `npx supabase db push`:

1. `supabase/migrations/20261119000001_core_schema.sql` — Tables, constraints, `btree_gist` exclusion constraint (`appointments_no_overlap`), and `handle_new_user` trigger.
2. `supabase/migrations/20261119000002_access_control.sql` — `private.*` helpers, table `REVOKE`/`GRANT` lock-down, Row Level Security policies, append-only triggers on `audit_logs` & `appointment_history`, and profile privilege protection.
3. `supabase/migrations/20261119000003_business_functions.sql` — Atomic `SECURITY DEFINER` RPCs (`book_appointment`, `reschedule_appointment`, `cancel_appointment`, `set_appointment_status`, `get_available_slots`, `save_dentist_schedule`, `add_blocked_date`, `remove_blocked_date`, `update_my_profile`, `set_my_avatar`, `update_dentist_profile`, `set_clinic_admin`, `provision_dentist_account`).
4. `supabase/migrations/20261119000004_storage.sql` — Creates private `avatars` and public `dentist-photos` buckets (1 MB limit, JPEG/PNG/WebP only) and per-user folder RLS policies.
5. `supabase/migrations/20261119000005_seed_catalogue.sql` — Seeds Dr. Maria Santos, Dr. Adrian Reyes, the 13 clinic services, 15 dentist-service mappings, and default weekly availability schedules (`ON CONFLICT DO NOTHING`).

---

## 2. Configure Authentication URLs & Email Templates

In **Supabase Dashboard → Authentication → URL Configuration**:

- **Site URL**:
  - Local development: `http://localhost:5173`
  - Production (Vercel): `https://<your-project>.vercel.app`
- **Redirect URLs** (add all that apply):
  - `http://localhost:5173/auth/confirm`
  - `http://127.0.0.1:5173/auth/confirm`
  - `https://<your-project>.vercel.app/auth/confirm`

### Recommended Email Template Links (Cross-Browser Compatible)

In **Supabase Dashboard → Authentication → Email Templates**, you may use either Supabase's default `{{ .ConfirmationURL }}` (supported via PKCE code exchange on `/auth/confirm`) or the `token_hash` format (works even if the user opens the email link on a different device/browser):

- **Confirm signup**:
  ```html
  <a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email">Verify Email Address</a>
  ```
- **Reset password / Invite user**:
  ```html
  <a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery">Set New Password</a>
  ```

Both formats are handled automatically by `src/lib/authLinks.ts`.

---

## 3. Bootstrap Dentist Accounts (Dr. Maria Santos & Dr. Adrian Reyes)

Because `handle_new_user()` always assigns `role = 'patient'` to self-registered users, dentist accounts are provisioned via the service-role function `public.provision_dentist_account`.

### Step A — Create or Invite the Two Users in Supabase Auth

In **Supabase Dashboard → Authentication → Users → Invite user** (or Add user), create users for:
1. Dr. Maria Santos (e.g., `santos@your-domain.com`)
2. Dr. Adrian Reyes (e.g., `reyes@your-domain.com`)

### Step B — Promote Their Profiles in the SQL Editor

Run the following in the **Supabase SQL Editor** (which runs as a privileged role):

```sql
-- 1. Promote Dr. Maria Santos (Dentist + Clinic Administrator)
SELECT public.provision_dentist_account(
  p_user_id    => (SELECT id FROM auth.users WHERE lower(email) = lower('santos@your-domain.com')),
  p_dentist_id => 'santos',
  p_name       => 'Dr. Maria Santos',
  p_title      => 'DMD',
  p_specialty  => 'General & Cosmetic Dentistry',
  p_is_admin   => true
);

-- 2. Promote Dr. Adrian Reyes (Regular Dentist)
SELECT public.provision_dentist_account(
  p_user_id    => (SELECT id FROM auth.users WHERE lower(email) = lower('reyes@your-domain.com')),
  p_dentist_id => 'reyes',
  p_name       => 'Dr. Adrian Reyes',
  p_title      => 'DMD, MOrth',
  p_specialty  => 'Orthodontics',
  p_is_admin   => false
);
```

---

## 4. Deploy the `provision-dentist` Edge Function (Optional)

The Edge Function at `supabase/functions/provision-dentist/index.ts` allows Dr. Maria Santos to invite and provision additional dentist accounts from the application while keeping the service-role key strictly server-side.

Note that this project uses **ES256** asymmetric JWT signing keys (`/auth/v1/.well-known/jwks.json`). Therefore `supabase/config.toml` sets `verify_jwt = false` on the gateway and the function verifies the `Authorization: Bearer <jwt>` header directly against the project's JWKS endpoint using `jose`.

```bash
npx supabase functions deploy provision-dentist --no-verify-jwt
npx supabase secrets set LOUDENT_SITE_URL=https://<your-project>.vercel.app LOUDENT_ALLOWED_ORIGINS=http://localhost:5173,https://<your-project>.vercel.app
```
