// Isolated test database harness: throw-away embedded PostgreSQL (real server
// binaries, multiple connections), Supabase platform stub, all migrations.
// Nothing here ever connects to a remote/Supabase database.
import EmbeddedPostgres from 'embedded-postgres'
import pg from 'pg'
import { readFileSync, readdirSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(here, '..')
export const MIGRATIONS_DIR = path.join(root, 'supabase', 'migrations')

export async function startDatabase({ port = 54000 + Math.floor(Math.random() * 900) } = {}) {
  const dir = mkdtempSync(path.join(tmpdir(), 'loudent-pg-'))
  const server = new EmbeddedPostgres({
    databaseDir: dir,
    user: 'postgres',
    password: 'postgres',
    port,
    persistent: false,
    initdbFlags: ['--encoding=UTF8', '--locale=C'],
    onLog: () => {},
    onError: () => {},
  })

  let pool = null
  async function stop() {
    if (pool) await pool.end().catch(() => {})
    await server.stop().catch(() => {})
    try { rmSync(dir, { recursive: true, force: true }) } catch {}
  }

  try {
    await server.initialise()
    await server.start()
    await server.createDatabase('loudent_test')
    pool = new pg.Pool({
      host: '127.0.0.1',
      port,
      user: 'postgres',
      password: 'postgres',
      database: 'loudent_test',
      max: 12,
    })

    const owner = await pool.connect()
    try {
      await owner.query(readFileSync(path.join(here, 'supabase-stub.sql'), 'utf8'))
      await owner.query('SET ROLE app_owner')
      for (const file of readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort()) {
        try {
          await owner.query(readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8'))
        } catch (error) {
          error.message = `migration ${file} failed: ${error.message}${error.position ? ` (position ${error.position})` : ''}`
          throw error
        }
      }
      await owner.query('RESET ROLE')
    } finally {
      owner.release()
    }
    return { pool, stop, port }
  } catch (err) {
    await stop()
    throw err
  }
}

/** Run `fn(client)` inside a transaction as a given Supabase role / user.
 *  Each query via `client.query` uses an internal savepoint so that negative
 *  assertions (`assert.rejects(() => c.query(...))`) do not abort earlier work
 *  in the same `as()` block.
 */
export async function as(pool, who, fn, { commit = true } = {}) {
  const client = await pool.connect()
  const rawQuery = client.query.bind(client)
  let spCounter = 0
  try {
    await rawQuery('BEGIN')
    if (who === 'owner') {
      await rawQuery('SET LOCAL ROLE app_owner')
    } else if (who === 'anon' || who === 'service_role') {
      await rawQuery(`SET LOCAL ROLE ${who}`)
      await rawQuery(`SELECT set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ role: who })])
    } else {
      await rawQuery('SET LOCAL ROLE authenticated')
      await rawQuery(`SELECT set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: who, role: 'authenticated' })])
    }
    const wrapped = {
      async query(text, values) {
        const sp = `sp_${++spCounter}`
        await rawQuery(`SAVEPOINT ${sp}`)
        try {
          const res = await rawQuery(text, values)
          await rawQuery(`RELEASE SAVEPOINT ${sp}`)
          return res
        } catch (err) {
          await rawQuery(`ROLLBACK TO SAVEPOINT ${sp}`).catch(() => {})
          await rawQuery(`RELEASE SAVEPOINT ${sp}`).catch(() => {})
          throw err
        }
      },
    }
    const result = await fn(wrapped)
    await rawQuery(commit ? 'COMMIT' : 'ROLLBACK')
    return result
  } catch (error) {
    await rawQuery('ROLLBACK').catch(() => {})
    throw error
  } finally {
    client.release()
  }
}

/** Create an auth user (profile row is made by the trigger). */
export async function createUser(pool, { email, name = 'Test User', phone = '09171234567', confirmed = true, meta = {} }) {
  const { rows } = await pool.query(
    `INSERT INTO auth.users (email, email_confirmed_at, raw_user_meta_data) VALUES ($1, $2, $3) RETURNING id`,
    [email, confirmed ? new Date() : null, JSON.stringify({ full_name: name, phone, ...meta })])
  return rows[0].id
}

/** Next date (YYYY-MM-DD, Manila) that is the given ISO weekday (1=Mon) and at least `minDays` ahead. */
export function nextWeekday(isoDow, minDays = 2) {
  const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit' })
  const d = new Date(fmt.format(new Date()) + 'T12:00:00Z')
  d.setUTCDate(d.getUTCDate() + minDays)
  while (((d.getUTCDay() + 6) % 7) + 1 !== isoDow) d.setUTCDate(d.getUTCDate() + 1)
  return d.toISOString().slice(0, 10)
}

export function hintOf(error) {
  return error?.hint ?? null
}
