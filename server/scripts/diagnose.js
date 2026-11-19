// Read-mostly diagnostic for "registration says the server is not responding correctly".
// It never prints passwords and rolls back its only write. Run:  npm.cmd run diagnose
import pool from '../src/db.js';
import { hashPassword, id, safeErrorSummary } from '../src/core.js';
import { missingSchema, countTables } from '../src/maintenance.js';
import { createMailer } from '../src/mail.js';

const line = (ok, text, extra = '') => console.log(`${ok === null ? ' i ' : ok ? 'OK ' : 'XX '} ${text}${extra ? `  ${extra}` : ''}`);
const port = process.env.PORT || 3001;
async function http(url, options) {
  try {
    const res = await fetch(url, { ...options, signal: AbortSignal.timeout(6000) });
    const text = await res.text(); let json = null; try { json = JSON.parse(text); } catch { /* not JSON */ }
    return { status: res.status, json, text: text.slice(0, 120) };
  } catch (error) { return { status: 0, error: error.cause?.code || error.name }; }
}

console.log(`\nLouDent diagnostics  (database "${process.env.DB_NAME || 'loudent'}" on ${process.env.DB_HOST || '127.0.0.1'}:${process.env.DB_PORT || 3306}, user "${process.env.DB_USER || 'loudent_app'}")\n`);
try {
  const version = (await pool.query('SELECT VERSION() AS v'))[0].v; line(true, 'Connected to MariaDB', `version ${version}`);
  const missing = await missingSchema(pool);
  line(missing.length === 0, missing.length ? `Schema is missing: ${missing.join(', ')}` : 'Schema has every table/column the code needs', missing.length ? '-> run: npm.cmd run migrate' : '');
  const grants = (await pool.query('SHOW GRANTS FOR CURRENT_USER()')).map((r) => Object.values(r)[0].replace(/IDENTIFIED BY PASSWORD '[^']*'/i, 'IDENTIFIED BY <hidden>'));
  const text = grants.join(' ').toUpperCase();
  const need = ['SELECT', 'INSERT', 'UPDATE', 'DELETE'].filter((p) => !(text.includes(p) || text.includes('ALL PRIVILEGES')));
  line(need.length === 0, need.length ? `Database user lacks: ${need.join(', ')}` : 'Database user can SELECT/INSERT/UPDATE/DELETE');
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const { salt, hash } = await hashPassword('Diagnose1234');
    await conn.query("INSERT INTO users (id,role,full_name,email,phone,password_salt,password_hash) VALUES (?,'patient','Diagnostic Row',?,'+639170000000',?,?)", [id(), `diagnose-${Date.now()}@example.invalid`, salt, hash]);
    line(true, 'A register-style INSERT works (rolled back, nothing kept)');
  } catch (error) { line(false, 'A register-style INSERT FAILED', `${error.code || ''} ${safeErrorSummary(error)}`); }
  finally { await conn.rollback(); conn.release(); }
  const demo = Number((await pool.query("SELECT COUNT(*) AS n FROM users WHERE email LIKE '%@loudent.demo'"))[0].n);
  line(demo === 0, demo ? `${demo} old demo account(s) (@loudent.demo) still exist with publicly known passwords` : 'No old demo accounts present', demo ? '-> approved cleanup in ACCOUNT_SETUP_AND_RECOVERY.md' : '');
  const counts = await countTables(pool).catch(() => null); if (counts) line(null, 'Row counts', JSON.stringify(counts));
  try { const mailer = createMailer(process.env); line(null, `Mail transport: ${mailer.mode}${mailer.mode === 'preview' ? ' (development only; no email is sent)' : ''}`); } catch (error) { line(false, error.message); }
} catch (error) {
  line(false, 'Database check failed', `${error.code || ''} ${safeErrorSummary(error)}`);
}

console.log('\nHTTP checks (start the API and Vite first):');
const bad = { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: '', email: 'x', password: '1' }) };
for (const [label, base] of [['API directly', `http://127.0.0.1:${port}`], ['through Vite proxy', 'http://localhost:5173']]) {
  const health = await http(`${base}/api/health`);
  if (health.status === 0) { line(false, `${label}: not reachable`, `(${health.error}) - is it running?`); continue; }
  line(health.status === 200 && health.json?.database === 'connected', `${label}: /api/health`, `HTTP ${health.status} ${health.json ? JSON.stringify(health.json) : `NON-JSON: ${health.text}`}`);
  const reg = await http(`${base}/api/auth/register`, bad);
  line(reg.status === 400 && Boolean(reg.json?.error), `${label}: invalid sign-up is rejected with a clear 400`, `HTTP ${reg.status} ${reg.json ? JSON.stringify(reg.json) : `NON-JSON: ${reg.text}`}`);
}
console.log('\nIf "through Vite proxy" fails but "API directly" works, the problem is the Vite proxy / which address it points to, not the database.\nIf you still see a server error, copy the "API error [id]" line from the API terminal (it contains no passwords).\n');
await pool.end();
