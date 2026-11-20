-- ============================================================================
-- LouDent pgTAP Database & RLS Test Suite (for `supabase test db`)
-- Also verified automatically via `npm run test:db` (embedded PostgreSQL 17.5).
-- ============================================================================
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT plan(14);

SELECT has_table('public', 'profiles', 'profiles table exists');
SELECT has_table('public', 'dentists', 'dentists table exists');
SELECT has_table('public', 'services', 'services table exists');
SELECT has_table('public', 'dentist_services', 'dentist_services table exists');
SELECT has_table('public', 'dentist_schedules', 'dentist_schedules table exists');
SELECT has_table('public', 'blocked_dates', 'blocked_dates table exists');
SELECT has_table('public', 'appointments', 'appointments table exists');
SELECT has_table('public', 'appointment_history', 'appointment_history table exists');
SELECT has_table('public', 'audit_logs', 'audit_logs table exists');

SELECT is(
  (SELECT bool_and(relrowsecurity) FROM pg_class
   WHERE relnamespace = 'public'::regnamespace AND relkind = 'r'),
  true,
  'Row Level Security is enabled on every public table'
);

SELECT is((SELECT count(*)::int FROM public.dentists), 2, '2 dentists seeded');
SELECT is((SELECT count(*)::int FROM public.services), 13, '13 services seeded');
SELECT is((SELECT count(*)::int FROM public.dentist_services), 15, '15 dentist_services links seeded');
SELECT is((SELECT count(*)::int FROM public.dentist_schedules), 14, '14 schedule rows seeded');

SELECT * FROM finish();
ROLLBACK;
