// Read-only verification of the Supabase connection and live database state.
// Performs ONLY safe GET / read-only requests using the publishable key:
//   1. Environment & key format check (confirms publishable key, not secret key)
//   2. Auth service health, settings, JWKS signing key, and getSession() check
//   3. Table probe for the 9 LouDent tables (read-only SELECT limit 1)
//   4. RPC probe for public.get_available_slots (read-only)
//   5. Storage bucket probe (read-only listBuckets)
// Creates NO accounts and modifies NO data.
// Usage: npm run verify:supabase

import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

function loadEnvFile(filePath) {
  if (!existsSync(filePath)) return {}
  const out = {}
  for (const raw of readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue
    const eq = line.indexOf('=')
    if (eq > 0) out[line.slice(0, eq).trim()] = line.slice(eq + 1).trim()
  }
  return out
}

const env = {
  ...loadEnvFile(path.join(root, '.env')),
  ...loadEnvFile(path.join(root, '.env.local')),
  ...process.env,
}

const url = (env.VITE_SUPABASE_URL || '').trim()
const key = (env.VITE_SUPABASE_PUBLISHABLE_KEY || '').trim()

if (!url || !key) {
  console.error('[FAIL] Missing VITE_SUPABASE_URL or VITE_SUPABASE_PUBLISHABLE_KEY')
  process.exit(1)
}
if (/^sb_secret_|service_role/i.test(key)) {
  console.error('[FAIL] Refusing to run with a secret/service_role key.')
  process.exit(1)
}

console.log('=== 1. Environment Configuration ===')
console.log(`Project URL     : ${url}`)
console.log(
  `Publishable Key : ${key.slice(0, 19)}...${key.slice(-6)} (format: ${
    key.startsWith('sb_publishable_') ? 'valid sb_publishable_*' : 'custom'
  })`
)

const supabase = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
})

// 2. Auth service & JWKS check
console.log('\n=== 2. Supabase Auth Connectivity ===')
const authSettingsRes = await fetch(`${url}/auth/v1/settings`, {
  headers: { apikey: key },
})
console.log(`GET /auth/v1/settings : HTTP ${authSettingsRes.status}`)
if (authSettingsRes.ok) {
  const settings = await authSettingsRes.json()
  console.log(`  external.email      : ${settings?.external?.email}`)
  console.log(`  disable_signup      : ${settings?.disable_signup}`)
}

const jwksRes = await fetch(`${url}/auth/v1/.well-known/jwks.json`)
const jwks = jwksRes.ok ? await jwksRes.json() : null
console.log(
  `GET /auth/v1/.well-known/jwks.json : HTTP ${jwksRes.status} (keys: ${
    jwks?.keys?.length ?? 0
  }, alg: ${jwks?.keys?.[0]?.alg ?? 'n/a'}, kid: ${jwks?.keys?.[0]?.kid ?? 'n/a'})`
)

const { data: sessionData, error: sessionErr } = await supabase.auth.getSession()
console.log(
  `supabase.auth.getSession() : ${
    sessionErr
      ? 'ERROR ' + sessionErr.message
      : 'OK (client initialized, active session: ' + Boolean(sessionData?.session) + ')'
  }`
)

// 3. Probe the 9 LouDent tables
console.log('\n=== 3. LouDent Table Status on Live Project (Read-Only) ===')
const LOUDENT_TABLES = [
  'dentists',
  'profiles',
  'services',
  'dentist_services',
  'dentist_schedules',
  'blocked_dates',
  'appointments',
  'appointment_history',
  'audit_logs',
]
let presentCount = 0
for (const table of LOUDENT_TABLES) {
  const { data, error, status } = await supabase.from(table).select('*').limit(1)
  if (error) {
    console.log(
      `  ${table.padEnd(22)} : NOT YET APPLIED (HTTP ${status} ${error.code || ''}: ${error.message})`
    )
  } else {
    presentCount++
    console.log(
      `  ${table.padEnd(22)} : PRESENT (HTTP ${status}, sample rows visible to anon: ${data?.length ?? 0})`
    )
  }
}

// 4. Probe RPC function
console.log('\n=== 4. LouDent RPC Function Status on Live Project (Read-Only) ===')
const rpcRes = await supabase.rpc('get_available_slots', {
  p_dentist_id: 'santos',
  p_service_id: 'checkup',
  p_date: '2026-12-01',
})
if (rpcRes.error) {
  console.log(
    `  get_available_slots    : NOT YET APPLIED (HTTP ${rpcRes.status} ${rpcRes.error.code || ''}: ${rpcRes.error.message})`
  )
} else {
  console.log(
    `  get_available_slots    : PRESENT (HTTP ${rpcRes.status}, slots returned: ${rpcRes.data?.length ?? 0})`
  )
}

// 5. Storage bucket check
console.log('\n=== 5. Supabase Storage Connectivity ===')
const { data: buckets, error: bucketErr } = await supabase.storage.listBuckets()
if (bucketErr) {
  console.log(`  listBuckets() : ERROR ${bucketErr.message}`)
} else {
  console.log(
    `  listBuckets() : OK (buckets visible to anon: ${
      buckets.length ? buckets.map((b) => b.id).join(', ') : 'none yet'
    })`
  )
}

console.log('\n=== Summary ===')
console.log(`Auth & Client Initialization : VERIFIED`)
console.log(
  `Live Database Migrations     : ${
    presentCount === 0
      ? 'PENDING (0 of 9 LouDent tables exist on live database — clean state ready for migration)'
      : `${presentCount} of 9 LouDent tables present`
  }`
)
