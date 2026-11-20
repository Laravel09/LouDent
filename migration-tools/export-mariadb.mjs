// Read-only MariaDB export tool for LouDent -> Supabase migration.
// Connects to the legacy MariaDB database in strictly read-only mode, exports
// clinic catalog, schedules, blocked dates, user profile metadata (EXCLUDING
// password_salt, password_hash, sessions, and auth_tokens), and appointments
// to migration-tools/output/mariadb-export.json (gitignored).
//
// Usage:
//   node migration-tools/export-mariadb.mjs
// Environment variables (reads server/.env if present):
//   DB_HOST (default 127.0.0.1), DB_PORT (3306), DB_USER (root), DB_PASSWORD, DB_NAME (loudent)

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

function loadDotEnv(file) {
  if (!existsSync(file)) return
  for (const raw of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue
    const eq = line.indexOf('=')
    if (eq > 0) {
      const k = line.slice(0, eq).trim()
      if (!(k in process.env)) process.env[k] = line.slice(eq + 1).trim()
    }
  }
}

loadDotEnv(path.join(root, 'server', '.env'))

async function main() {
  let mariadb
  try {
    mariadb = await import('mariadb')
  } catch {
    console.error('Install the mariadb driver in ./server first (cd server && npm install).')
    process.exit(1)
  }

  const conn = await mariadb.default.createConnection({
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'loudent',
  })

  try {
    await conn.query('SET SESSION TRANSACTION READ ONLY')
    await conn.beginTransaction()

    const dentists = await conn.query(
      'SELECT id, name, title, specialty, experience_years, bio, photo_url, created_at FROM dentists ORDER BY id'
    )
    const services = await conn.query(
      'SELECT id, name, category, duration_minutes, price, icon, description, preparation, involves_json FROM services ORDER BY id'
    )
    const dentistServices = await conn.query(
      'SELECT dentist_id, service_id FROM dentist_services ORDER BY dentist_id, service_id'
    )
    const schedules = await conn.query(
      'SELECT dentist_id, day_of_week, available, TIME_FORMAT(start_time, "%H:%i:%s") AS start_time, TIME_FORMAT(end_time, "%H:%i:%s") AS end_time, TIME_FORMAT(break_start, "%H:%i:%s") AS break_start, TIME_FORMAT(break_end, "%H:%i:%s") AS break_end FROM weekly_availability ORDER BY dentist_id, day_of_week'
    )
    const blockedDates = await conn.query(
      'SELECT dentist_id, DATE_FORMAT(block_date, "%Y-%m-%d") AS block_date FROM blocked_dates ORDER BY dentist_id, block_date'
    )
    // SECURITY: password_salt, password_hash, sessions, and auth_tokens are NEVER exported.
    const users = await conn.query(
      'SELECT id, role, dentist_id, full_name, LOWER(email) AS email, COALESCE(phone, "") AS phone, email_verified_at, created_at FROM users ORDER BY created_at'
    )
    const appointments = await conn.query(
      'SELECT id, reference, patient_id, dentist_id, service_id, DATE_FORMAT(appointment_date, "%Y-%m-%d") AS appointment_date, TIME_FORMAT(start_time, "%H:%i:%s") AS start_time, duration_minutes, price, status, decline_reason, created_at, updated_at FROM appointments ORDER BY created_at'
    )

    await conn.commit()

    const outDir = path.join(root, 'migration-tools', 'output')
    mkdirSync(outDir, { recursive: true })
    const outFile = path.join(outDir, 'mariadb-export.json')

    const payload = {
      exportedAt: new Date().toISOString(),
      sourceDatabase: process.env.DB_NAME || 'loudent',
      securityNote: 'Password hashes, salts, sessions, and auth_tokens are intentionally omitted.',
      counts: {
        dentists: dentists.length,
        services: services.length,
        dentistServices: dentistServices.length,
        schedules: schedules.length,
        blockedDates: blockedDates.length,
        users: users.length,
        appointments: appointments.length,
      },
      dentists,
      services: services.map((s) => ({
        ...s,
        price: Number(s.price),
        involves: JSON.parse(s.involves_json || '[]'),
      })),
      dentistServices,
      schedules: schedules.map((s) => ({
        ...s,
        available: Boolean(s.available),
      })),
      blockedDates,
      users,
      appointments: appointments.map((a) => ({
        ...a,
        price: Number(a.price),
      })),
    }

    writeFileSync(outFile, JSON.stringify(payload, null, 2))
    console.log(`Exported MariaDB data (read-only) to ${path.relative(root, outFile)}:`)
    console.table(payload.counts)
  } finally {
    await conn.end()
  }
}

main().catch((err) => {
  console.error('MariaDB export failed:', err.message)
  process.exit(1)
})
