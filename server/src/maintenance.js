// Safety library for local maintenance tools (cleanup, schema checks). Everything destructive is
// guarded here and unit-tested; the CLI scripts only wire it to a terminal.
import fs from 'node:fs';

export const LOCAL_HOSTS = ['127.0.0.1', 'localhost', '::1'];
export const AUTHORIZED_DATABASE = 'loudent';
export const PRESERVED_TABLES = ['dentists', 'services', 'dentist_services', 'weekly_availability', 'blocked_dates'];
export const CLEARED_TABLES = ['appointments', 'sessions', 'auth_tokens', 'users']; // deletion order (children first)
export const ALL_TABLES = [...PRESERVED_TABLES, ...CLEARED_TABLES];
export const CONFIRMATION_PHRASE = 'DELETE LOUDENT LOCAL DATA';

// A content fingerprint per preserved table, so "untouched" is proven by data, not just by row counts.
const FINGERPRINTS = {
  dentists: "SELECT COUNT(*) AS n, COALESCE(SUM(CRC32(CONCAT_WS('|',id,name,title,specialty,experience_years,bio,COALESCE(photo_url,'')))),0) AS fp FROM dentists",
  services: "SELECT COUNT(*) AS n, COALESCE(SUM(CRC32(CONCAT_WS('|',id,name,category,duration_minutes,price,description))),0) AS fp FROM services",
  dentist_services: "SELECT COUNT(*) AS n, COALESCE(SUM(CRC32(CONCAT_WS('|',dentist_id,service_id))),0) AS fp FROM dentist_services",
  weekly_availability: "SELECT COUNT(*) AS n, COALESCE(SUM(CRC32(CONCAT_WS('|',dentist_id,day_of_week,available,start_time,end_time,COALESCE(break_start,''),COALESCE(break_end,'')))),0) AS fp FROM weekly_availability",
  blocked_dates: "SELECT COUNT(*) AS n, COALESCE(SUM(CRC32(CONCAT_WS('|',dentist_id,block_date))),0) AS fp FROM blocked_dates",
};

/** Throws unless the configured target is the authorized LOCAL `loudent` development database. */
export function assertLocalDevTarget(env, { dbName = AUTHORIZED_DATABASE } = {}) {
  const host = String(env.DB_HOST || '127.0.0.1').toLowerCase();
  const database = String(env.DB_NAME || 'loudent');
  const nodeEnv = env.NODE_ENV || 'development';
  const problems = [];
  if (!LOCAL_HOSTS.includes(host)) problems.push(`DB_HOST "${host}" is not a local address (${LOCAL_HOSTS.join(', ')}).`);
  if (database !== dbName) problems.push(`DB_NAME is "${database}", but this tool only operates on the database "${dbName}".`);
  if (nodeEnv === 'production') problems.push('NODE_ENV is "production".');
  if (problems.length) throw new Error(`Refusing to run: ${problems.join(' ')}`);
  return { host, port: Number(env.DB_PORT || 3306), database, nodeEnv };
}

/**
 * A backup is accepted only if it exists, is recent, non-trivial, finished writing, contains the table
 * definitions, and contains rows for every table that currently holds data.
 * @param {string[]} tablesWithData tables whose rows must appear in the dump
 */
export function verifyBackupFile(filePath, { fsImpl = fs, now = Date.now(), maxAgeHours = 24, minBytes = 2048, database = AUTHORIZED_DATABASE, tablesWithData = [] } = {}) {
  const problems = [];
  if (!filePath || typeof filePath !== 'string') return { ok: false, problems: ['No backup file was given (use --backup-file="C:\\path\\backup.sql").'] };
  let stat;
  try { stat = fsImpl.statSync(filePath); } catch { return { ok: false, problems: [`Backup file not found: ${filePath}`] }; }
  if (!stat.isFile()) return { ok: false, problems: ['The backup path is not a file.'] };
  if (stat.size < minBytes) problems.push(`Backup is only ${stat.size} bytes; a real dump is larger (minimum ${minBytes}).`);
  const ageHours = (now - stat.mtimeMs) / 3_600_000;
  if (ageHours > maxAgeHours) problems.push(`Backup is ${ageHours.toFixed(1)} hours old (limit ${maxAgeHours}). Make a fresh one.`);
  if (ageHours < -0.1) problems.push('Backup file has a modification time in the future.');
  let text = '';
  try { text = fsImpl.readFileSync(filePath, 'utf8'); } catch { problems.push('Backup file could not be read.'); }
  for (const table of ALL_TABLES) {
    if (!new RegExp('CREATE TABLE (IF NOT EXISTS )?`?' + table + '`?', 'i').test(text)) problems.push(`Table definition for "${table}" is missing from the backup.`);
  }
  for (const table of tablesWithData) {
    if (!new RegExp('INSERT INTO `?' + table + '`?', 'i').test(text)) problems.push(`Rows of "${table}" are missing from the backup (the table is not empty).`);
  }
  const mentionsDb = new RegExp('`' + database + '`|Database:\\s*' + database + '\\b|USE\\s+`?' + database + '`?', 'i').test(text);
  if (!mentionsDb) problems.push(`The backup does not mention the database "${database}" (in HeidiSQL tick "Create" for the database when exporting).`);
  // mariadb-dump ends with "-- Dump completed"; HeidiSQL ends with a block restoring FOREIGN_KEY_CHECKS.
  const finished = /-- Dump completed/i.test(text) || /SET FOREIGN_KEY_CHECKS=IFNULL\(@OLD_FOREIGN_KEY_CHECKS/i.test(text.slice(-4000));
  if (!finished) problems.push('The backup does not end with a "Dump completed" (mariadb-dump) or HeidiSQL end-of-export block; it may be truncated.');
  return { ok: problems.length === 0, problems, bytes: stat.size, modifiedAt: new Date(stat.mtimeMs).toISOString() };
}

/** Lists schema pieces the current code needs but the database does not have yet (run `npm run migrate`). */
export async function missingSchema(db, database = process.env.DB_NAME || AUTHORIZED_DATABASE) {
  const missing = [];
  const tables = await db.query('SELECT table_name AS t FROM information_schema.tables WHERE table_schema=?', [database]);
  const have = new Set(tables.map((r) => String(r.t).toLowerCase()));
  for (const table of ALL_TABLES) if (!have.has(table)) missing.push(`table ${table}`);
  const cols = await db.query("SELECT table_name AS t, column_name AS c, data_type AS d FROM information_schema.columns WHERE table_schema=? AND ((table_name='users' AND column_name='email_verified_at') OR (table_name='dentists' AND column_name='photo_url'))", [database]);
  if (!cols.some((r) => r.t === 'users' && r.c === 'email_verified_at')) missing.push('column users.email_verified_at');
  const photo = cols.find((r) => r.t === 'dentists' && r.c === 'photo_url');
  if (!photo || String(photo.d).toLowerCase() !== 'mediumtext') missing.push('column dentists.photo_url as MEDIUMTEXT');
  return missing;
}

export async function countTables(db, tables = ALL_TABLES) {
  const out = {};
  for (const table of tables) out[table] = Number((await db.query(`SELECT COUNT(*) AS n FROM \`${table}\``))[0].n);
  return out;
}

async function fingerprints(db) {
  const out = {};
  for (const [table, sql] of Object.entries(FINGERPRINTS)) { const r = (await db.query(sql))[0]; out[table] = `${Number(r.n)}:${String(r.fp)}`; }
  return out;
}

/** Read-only preview used by --dry-run. */
export async function planCleanup(db) {
  const counts = await countTables(db);
  const roles = await db.query('SELECT role, COUNT(*) AS n FROM users GROUP BY role');
  const byRole = Object.fromEntries(roles.map((r) => [r.role, Number(r.n)]));
  const legacyPhotos = Number((await db.query("SELECT COUNT(*) AS n FROM users WHERE role='dentist' AND photo_data_url IS NOT NULL AND photo_data_url<>''"))[0].n);
  return { counts, patients: byRole.patient || 0, dentistLogins: byRole.dentist || 0, legacyPhotos };
}

/**
 * The destructive step. One transaction; children before parents; plain DELETE statements only
 * (no TRUNCATE, no DROP, no foreign-key-check switching). Any failed verification rolls everything back.
 * @param pool object with getConnection() -> connection { beginTransaction, query, commit, rollback, release }
 */
export async function runCleanup(pool) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const legacy = Number((await conn.query("SELECT COUNT(*) AS n FROM users WHERE role='dentist' AND photo_data_url IS NOT NULL AND photo_data_url<>''"))[0].n);
    if (legacy > 0) throw new Error('A dentist login still holds a profile picture. Run "npm run migrate" first so the picture moves to the dentist profile; nothing was deleted.');
    const before = await countTables(conn);
    const preservedBefore = await fingerprints(conn);
    await conn.query('DELETE FROM appointments');
    await conn.query('DELETE FROM sessions');
    await conn.query('DELETE FROM auth_tokens');
    await conn.query('DELETE FROM users');
    const after = await countTables(conn);
    const preservedAfter = await fingerprints(conn);
    for (const table of CLEARED_TABLES) if (after[table] !== 0) throw new Error(`Verification failed: ${table} still has ${after[table]} rows.`);
    for (const table of PRESERVED_TABLES) {
      if (after[table] !== before[table] || preservedAfter[table] !== preservedBefore[table]) throw new Error(`Verification failed: preserved table ${table} changed.`);
    }
    await conn.commit();
    return { before, after, preservedVerified: true };
  } catch (error) {
    try { await conn.rollback(); } catch { /* connection already gone */ }
    throw error;
  } finally { conn.release(); }
}

/** Plain-text before/after counts. Contains no names, emails, tokens or secrets. */
export function formatCleanupReport({ before, after, database, host, when = new Date() }) {
  const rows = ALL_TABLES.map((t) => `${t.padEnd(22)} ${String(before[t]).padStart(7)} -> ${String(after[t]).padStart(7)}${PRESERVED_TABLES.includes(t) ? '   (preserved)' : '   (cleared)'}`);
  return [
    'LouDent local cleanup report',
    `Time:      ${when.toISOString()}`,
    `Target:    ${host} / database "${database}"`,
    '',
    'table                      before ->   after',
    ...rows,
    '',
    'Preserved tables were verified unchanged by row count and content fingerprint.',
    'No personal data, tokens or credentials are included in this report.',
    '',
  ].join('\n');
}
