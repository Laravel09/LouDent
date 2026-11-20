// Controlled Supabase import tool for LouDent legacy MariaDB data.
//
// SAFETY RULES:
//   * Runs in --dry-run mode by default (validates the JSON export and prints
//     what would be imported without touching Supabase).
//   * Requires --execute AND LOUDENT_CONFIRM_IMPORT=YES to write to Supabase.
//   * Never imports custom password hashes. Instead, creates Supabase Auth users
//     preserving their legacy UUID (so foreign keys on appointments remain intact)
//     and requires users to set their password via Supabase password recovery / invite.
//   * Uses upsert / ON CONFLICT DO NOTHING so existing records are never deleted.
//
// Usage:
//   node migration-tools/import-supabase.mjs                           # dry-run only
//   LOUDENT_CONFIRM_IMPORT=YES node migration-tools/import-supabase.mjs --execute

import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const exportFile = path.join(root, 'migration-tools', 'output', 'mariadb-export.json')
const execute = process.argv.includes('--execute')
const adminIds = (process.env.CLINIC_ADMIN_DENTIST_IDS || 'santos')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean)

async function main() {
  if (!existsSync(exportFile)) {
    console.error(`Export file not found at ${path.relative(root, exportFile)}.`)
    console.error('Run `node migration-tools/export-mariadb.mjs` first.')
    process.exit(1)
  }

  const data = JSON.parse(readFileSync(exportFile, 'utf8'))
  console.log('Validated MariaDB export payload:')
  console.table(data.counts)

  if (!execute) {
    console.log('\n[DRY RUN] No changes were sent to Supabase.')
    console.log('To perform the import against a target project, set SUPABASE_URL,')
    console.log('SUPABASE_SECRET_KEY (server-side only), and LOUDENT_CONFIRM_IMPORT=YES,')
    console.log('then re-run with --execute.')
    return
  }

  if (process.env.LOUDENT_CONFIRM_IMPORT !== 'YES') {
    console.error('Refusing to run --execute without LOUDENT_CONFIRM_IMPORT=YES.')
    process.exit(1)
  }

  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const secretKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !secretKey) {
    console.error('SUPABASE_URL and SUPABASE_SECRET_KEY (server-side only) are required for --execute.')
    process.exit(1)
  }

  const admin = createClient(url, secretKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  // 1. Upsert dentists & services
  for (const d of data.dentists) {
    const photoUrl = typeof d.photo_url === 'string' && d.photo_url.startsWith('https://') ? d.photo_url : null
    const { error } = await admin.from('dentists').upsert({
      id: d.id,
      name: d.name,
      title: d.title || '',
      specialty: d.specialty || '',
      experience_years: Number(d.experience_years || 0),
      bio: d.bio || '',
      photo_url: photoUrl,
    }, { onConflict: 'id' })
    if (error) throw new Error(`Dentist ${d.id}: ${error.message}`)
  }

  for (const s of data.services) {
    const { error } = await admin.from('services').upsert({
      id: s.id,
      name: s.name,
      category: s.category,
      duration_minutes: Number(s.duration_minutes),
      price: Number(s.price),
      icon: s.icon,
      description: s.description,
      preparation: s.preparation,
      involves: s.involves,
    }, { onConflict: 'id' })
    if (error) throw new Error(`Service ${s.id}: ${error.message}`)
  }

  if (data.dentistServices.length) {
    const { error } = await admin
      .from('dentist_services')
      .upsert(data.dentistServices, { onConflict: 'dentist_id,service_id' })
    if (error) throw new Error(`dentist_services: ${error.message}`)
  }

  if (data.schedules.length) {
    const { error } = await admin
      .from('dentist_schedules')
      .upsert(data.schedules, { onConflict: 'dentist_id,day_of_week' })
    if (error) throw new Error(`dentist_schedules: ${error.message}`)
  }

  if (data.blockedDates.length) {
    const { error } = await admin
      .from('blocked_dates')
      .upsert(data.blockedDates, { onConflict: 'dentist_id,block_date' })
    if (error) throw new Error(`blocked_dates: ${error.message}`)
  }

  // 2. Create auth users (without migrating custom password hashes)
  for (const u of data.users) {
    const { data: existing } = await admin.from('profiles').select('id').eq('id', u.id).maybeSingle()
    if (!existing) {
      const { error: createErr } = await admin.auth.admin.createUser({
        id: u.id,
        email: u.email,
        email_confirm: Boolean(u.email_verified_at) || u.role === 'dentist',
        user_metadata: { full_name: u.full_name, phone: u.phone || '' },
      })
      if (createErr && !/already/i.test(createErr.message)) {
        throw new Error(`User ${u.email}: ${createErr.message}`)
      }
    }
    if (u.role === 'dentist' && u.dentist_id) {
      const { error: promErr } = await admin.rpc('provision_dentist_account', {
        p_user_id: u.id,
        p_dentist_id: u.dentist_id,
        p_name: u.full_name,
        p_title: '',
        p_specialty: '',
        p_is_admin: adminIds.includes(u.dentist_id),
        p_actor: null,
      })
      if (promErr) throw new Error(`Promote dentist ${u.dentist_id}: ${promErr.message}`)
    }
  }

  // 3. Import appointments
  for (const a of data.appointments) {
    const { error } = await admin.from('appointments').upsert({
      id: a.id,
      reference: a.reference,
      patient_id: a.patient_id,
      dentist_id: a.dentist_id,
      service_id: a.service_id,
      appointment_date: a.appointment_date,
      start_time: a.start_time,
      duration_minutes: Number(a.duration_minutes),
      price: Number(a.price),
      status: a.status,
      decline_reason: a.decline_reason || null,
    }, { onConflict: 'id' })
    if (error) throw new Error(`Appointment ${a.reference}: ${error.message}`)
  }

  console.log('Import completed successfully. Legacy users must reset their password via Supabase Auth before logging in.')
}

main().catch((err) => {
  console.error('Supabase import failed:', err.message)
  process.exit(1)
})
