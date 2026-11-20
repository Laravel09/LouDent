# LouDent — Application Security Review & Checklist

## 1. Access Control & Privilege Escalation Protection

- [x] **Two roles only (`patient`, `dentist`)**: Enforced by `CHECK (role IN ('patient', 'dentist'))` on `public.profiles`.
- [x] **Clinic Administrator privilege constrained to dentists**: Enforced by `CONSTRAINT profiles_admin_is_dentist CHECK (NOT is_clinic_admin OR role = 'dentist')`.
- [x] **Signup metadata cannot escalate privileges**: `public.handle_new_user()` hardcodes `'patient'` on `INSERT INTO public.profiles` and ignores any `role` or `is_clinic_admin` fields supplied in `raw_user_meta_data`.
- [x] **Direct table writes revoked from browser roles**: `REVOKE ALL ON public.profiles, public.dentists, ... FROM anon, authenticated`. Browser roles only hold `SELECT` (filtered by RLS) and `EXECUTE` on explicit RPCs (plus `INSERT/UPDATE/DELETE` on `services` and `dentist_services` guarded by `private.has_permission('clinic.manage_services')`).
- [x] **Defense-in-depth trigger on `profiles`**: `private.tg_protect_profile` blocks `anon` / `authenticated` from altering `role`, `is_clinic_admin`, `dentist_id`, `email`, or `id` even if table grants were ever widened in the future.
- [x] **Self-demotion guard**: `public.set_clinic_admin` rejects changes where `p_user_id = auth.uid()`, preventing Dr. Maria Santos from accidentally locking out clinic administration.

## 2. Authentication & Session Security

- [x] **No custom password storage**: Legacy `password_salt`, `password_hash`, `sessions`, and `auth_tokens` tables are completely retired in PostgreSQL; all password hashing and token lifecycles are managed by Supabase Auth.
- [x] **Email verification gate enforced in PostgreSQL**: `public.book_appointment` checks `EXISTS (SELECT 1 FROM auth.users u WHERE u.id = auth.uid() AND u.email_confirmed_at IS NOT NULL)` and raises `EMAIL_NOT_VERIFIED` if unconfirmed.
- [x] **Single-use email links & URL scrubbing**: `src/lib/authLinks.ts` scrubs `/auth/confirm` query/hash tokens from `window.history` immediately upon load and deduplicates redemption calls under React StrictMode.
- [x] **Asymmetric JWT verification (`ES256`) in Edge Functions**: `supabase/functions/provision-dentist/index.ts` verifies bearer tokens against `https://qlsfeqofszmtdkdedkqz.supabase.co/auth/v1/.well-known/jwks.json` using `jose` (`jwtVerify` with `issuer` and `audience: 'authenticated'`).

## 3. Concurrency & Data Integrity

- [x] **Database-level double-booking prevention**:
  1. `private.assert_slot` locks the dentist row (`SELECT 1 FROM public.dentists WHERE id = p_dentist_id FOR UPDATE`), serializing concurrent bookings for the same dentist.
  2. `public.appointments` enforces a PostgreSQL GiST `EXCLUDE` constraint:
     ```sql
     EXCLUDE USING gist (dentist_id WITH =, slot WITH &&)
     WHERE (status IN ('Pending', 'Confirmed'))
     ```
- [x] **Cancelled & Declined appointments release time slots**: Because the partial exclusion constraint and `private.assert_slot` filter on `status IN ('Pending', 'Confirmed')`, cancelling or declining an appointment immediately frees the slot while preserving the row and its `appointment_history`.

## 4. Storage & File Upload Security

- [x] **Private patient avatars vs. public dentist photos**:
  - Patient photos are stored in the **private** `avatars` bucket and read only via short-lived signed URLs (`createSignedUrl(..., 3600)`).
  - Dentist photos are stored in the **public** `dentist-photos` bucket (required for public landing/dentist pages).
- [x] **Per-user folder isolation**: Storage RLS policies verify `(storage.foldername(name))[1] = auth.uid()::text` and `public.set_my_avatar` verifies `v_path ~ ('^' || v_uid::text || '/[A-Za-z0-9._-]{1,100}$')` and confirms the object exists in `storage.objects`.
- [x] **MIME type and size limits**: Restricted to `image/jpeg`, `image/png`, `image/webp` at both bucket level (`1 MB`) and client/RPC level (`250 KB` post-resize).

## 5. Audit Trail Immutability & Secret Hygiene

- [x] **Append-only audit tables**: `private.tg_append_only` raises SQLSTATE `42501` on any `UPDATE` or `DELETE` against `public.audit_logs` or `public.appointment_history`, even from privileged roles.
- [x] **Secret key leak prevention**: `src/lib/supabase.ts` and `scripts/check-env.mjs` detect and refuse `sb_secret_` or `service_role` JWTs in `VITE_` variables.
- [x] **Zero npm vulnerabilities**: `npm audit` reports `0 vulnerabilities`.
