// Applies database/migrations/*.sql in order. Each file is idempotent; applied files are recorded.
// Never deletes data. Run:  npm.cmd run migrate
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pool from '../src/db.js';

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'database', 'migrations');
const statementsOf = (sql) => sql.split('\n').filter((l) => !l.trim().startsWith('--')).join('\n').split(/;\s*(?:\n|$)/).map((s) => s.trim()).filter(Boolean);

try {
  await pool.query('CREATE TABLE IF NOT EXISTS schema_migrations (id VARCHAR(120) NOT NULL PRIMARY KEY, applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP) ENGINE=InnoDB');
  const done = new Set((await pool.query('SELECT id FROM schema_migrations')).map((r) => r.id));
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
  let applied = 0;
  for (const file of files) {
    if (done.has(file)) { console.log(`skip   ${file} (already applied)`); continue; }
    console.log(`apply  ${file}`);
    for (const statement of statementsOf(fs.readFileSync(path.join(dir, file), 'utf8'))) await pool.query(statement);
    await pool.query('INSERT INTO schema_migrations (id) VALUES (?)', [file]);
    applied++;
  }
  console.log(applied ? `Done: ${applied} migration(s) applied.` : 'Database schema is up to date.');
} catch (error) {
  console.error('Migration failed:', String(error.text || error.message).split('\n')[0]);
  process.exitCode = 1;
} finally { await pool.end(); }
