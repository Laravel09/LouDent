// Validates environment configuration and ensures no secret / service-role key
// is ever placed in a browser-exposed VITE_ variable.
// Usage: npm run check:env
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

function parseEnvFile(filePath) {
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

const merged = {
  ...parseEnvFile(path.join(root, '.env')),
  ...parseEnvFile(path.join(root, '.env.local')),
  ...process.env,
}

const url = (merged.VITE_SUPABASE_URL ?? '').trim()
const key = (merged.VITE_SUPABASE_PUBLISHABLE_KEY ?? '').trim()
const errors = []
const warnings = []

for (const [k, v] of Object.entries(merged)) {
  if (!k.startsWith('VITE_')) continue
  if (/^sb_secret_|service_role/i.test(String(v))) {
    errors.push(`CRITICAL: ${k} contains a Supabase secret / service_role key! Never expose secret keys in VITE_ variables.`)
  }
}

if (!url) {
  warnings.push('VITE_SUPABASE_URL is not set in .env.local or environment (see .env.example).')
} else if (!/^https:\/\/[a-z0-9-]+\.supabase\.(co|in)$|^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(url)) {
  errors.push(`VITE_SUPABASE_URL ("${url}") is not a valid Supabase project URL.`)
}

if (!key) {
  warnings.push('VITE_SUPABASE_PUBLISHABLE_KEY is not set in .env.local or environment (see .env.example).')
}

if (errors.length) {
  for (const e of errors) console.error(`[ERROR] ${e}`)
  process.exit(1)
}
for (const w of warnings) console.warn(`[WARN]  ${w}`)
console.log('[OK] Environment variable safety check passed (no secret keys exposed to VITE_).')
