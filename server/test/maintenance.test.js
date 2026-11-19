import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { assertLocalDevTarget, verifyBackupFile, runCleanup, formatCleanupReport, ALL_TABLES, CLEARED_TABLES, PRESERVED_TABLES, CONFIRMATION_PHRASE } from '../src/maintenance.js';
import { provisionStaff, resetStaffPassword, setStaffEmail, isDevOnlyAddress } from '../src/staff-lib.js';
import { comparePassword, normalizePhonePH, passwordProblem, makeRateLimiter, generateStrongPassword, safeErrorSummary } from '../src/core.js';

test('cleanup target guard: only the local "loudent" development database', () => {
  assert.deepEqual(assertLocalDevTarget({ DB_HOST: '127.0.0.1', DB_NAME: 'loudent' }).database, 'loudent');
  assert.doesNotThrow(() => assertLocalDevTarget({ DB_NAME: 'loudent' }));              // defaults to local
  assert.doesNotThrow(() => assertLocalDevTarget({ DB_HOST: 'localhost', DB_NAME: 'loudent' }));
  for (const env of [{ DB_HOST: 'db.example.com', DB_NAME: 'loudent' }, { DB_HOST: '10.0.0.5', DB_NAME: 'loudent' }, { DB_NAME: 'loudent_test' }, { DB_NAME: 'production' }, { DB_NAME: 'loudent', NODE_ENV: 'production' }]) {
    assert.throws(() => assertLocalDevTarget(env), /Refusing to run/, JSON.stringify(env));
  }
});

const DUMP = ALL_TABLES.map((t) => `CREATE TABLE \`${t}\` (id int);\nINSERT INTO \`${t}\` VALUES (1);`).join('\n') + '\n-- Database: `loudent`\n-- Dump completed on 2026-11-11\n' + '-- padding\n'.repeat(200);
function tmp(content, ageHours = 0) {
  const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'ld-')), 'backup.sql'); fs.writeFileSync(f, content);
  if (ageHours) { const t = new Date(Date.now() - ageHours * 3_600_000); fs.utimesSync(f, t, t); } return f;
}
test('backup verification rejects missing, tiny, stale, truncated or incomplete dumps', () => {
  assert.equal(verifyBackupFile(tmp(DUMP), { tablesWithData: ['users', 'appointments'] }).ok, true);
  assert.equal(verifyBackupFile(undefined).ok, false);
  assert.equal(verifyBackupFile('C:\\nope\\missing.sql').ok, false);
  assert.match(verifyBackupFile(tmp('x'.repeat(10))).problems.join(' '), /bytes/);
  assert.match(verifyBackupFile(tmp(DUMP, 30)).problems.join(' '), /hours old/);
  assert.match(verifyBackupFile(tmp(DUMP.replace('-- Dump completed', '-- stopped'))).problems.join(' '), /Dump completed/);
  const heidi = DUMP.replace('-- Dump completed on 2026-11-11', '/*!40014 SET FOREIGN_KEY_CHECKS=IFNULL(@OLD_FOREIGN_KEY_CHECKS, 1) */;\n/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;');
  assert.equal(verifyBackupFile(tmp(heidi)).ok, true, 'HeidiSQL-style ending is accepted');
  assert.match(verifyBackupFile(tmp(heidi.replace(/SET FOREIGN_KEY_CHECKS=IFNULL\(@OLD_FOREIGN_KEY_CHECKS, 1\)/, 'SET X=1'))).problems.join(' '), /may be truncated/);
  assert.match(verifyBackupFile(tmp(DUMP.replace(/CREATE TABLE `users`/, 'CREATE TABLE `other`'))).problems.join(' '), /users/);
  assert.match(verifyBackupFile(tmp(DUMP.replace(/INSERT INTO `appointments`/, 'INSERT INTO `x`')), { tablesWithData: ['appointments'] }).problems.join(' '), /Rows of "appointments"/);
  assert.match(verifyBackupFile(tmp(DUMP.replace(/`loudent`/g, '`other`'))).problems.join(' '), /database "loudent"/);
});

// Recording fake of a MariaDB connection holding row counts + content fingerprints.
function fakePool({ breakUsersDelete = false, legacyPhotos = 0, mutatePreserved = false } = {}) {
  const log = []; const state = { appointments: 7, sessions: 3, auth_tokens: 2, users: 5, dentists: 2, services: 13, dentist_services: 25, weekly_availability: 14, blocked_dates: 1 };
  const st = { committed: false, rolledBack: false, released: false };
  const conn = {
    async beginTransaction() { log.push('BEGIN'); }, async commit() { st.committed = true; log.push('COMMIT'); }, async rollback() { st.rolledBack = true; log.push('ROLLBACK'); }, release() { st.released = true; },
    async query(sql) {
      log.push(sql.trim().replace(/\s+/g, ' '));
      const del = /^DELETE FROM (\w+)$/i.exec(sql.trim());
      if (del) { if (del[1] === 'users' && breakUsersDelete) return { affectedRows: 0 }; const n = state[del[1]]; state[del[1]] = 0; if (mutatePreserved && del[1] === 'users') state.dentists = 1; return { affectedRows: n }; }
      if (/role='dentist' AND photo_data_url/i.test(sql)) return [{ n: legacyPhotos }];
      const count = /COUNT\(\*\) AS n FROM `(\w+)`/.exec(sql); if (count) return [{ n: state[count[1]] }];
      const fp = /FROM (\w+)$/.exec(sql.trim()); if (fp && /CRC32/.test(sql)) return [{ n: state[fp[1]], fp: `fp-${fp[1]}-${state[fp[1]]}` }];
      throw new Error('unexpected SQL in test: ' + sql);
    },
  };
  return { log, state, st, pool: { async getConnection() { return conn; } } };
}
test('cleanup transaction: FK-safe order, plain DELETEs, verified, committed', async () => {
  const f = fakePool(); const r = await runCleanup(f.pool);
  const deletes = f.log.filter((l) => l.startsWith('DELETE'));
  assert.deepEqual(deletes, CLEARED_TABLES.map((t) => `DELETE FROM ${t}`));
  assert.deepEqual(CLEARED_TABLES, ['appointments', 'sessions', 'auth_tokens', 'users'], 'children before parents');
  assert.ok(!f.log.some((l) => /TRUNCATE|DROP|FOREIGN_KEY_CHECKS|DELETE FROM (dentists|services|dentist_services|weekly_availability|blocked_dates)/i.test(l)));
  assert.ok(f.log[0] === 'BEGIN' && f.st.committed && !f.st.rolledBack && f.st.released);
  for (const t of CLEARED_TABLES) assert.equal(r.after[t], 0);
  for (const t of PRESERVED_TABLES) assert.equal(r.after[t], r.before[t]);
  assert.equal(r.before.users, 5);
  const report = formatCleanupReport({ ...r, database: 'loudent', host: '127.0.0.1' });
  assert.match(report, /users\s+5 ->\s+0/); assert.ok(!/@|password|token_hash/i.test(report.replace(/auth_tokens/g, '')), 'report carries no personal data');
});
test('cleanup rolls back when verification fails or preserved data changes or a dentist picture is still on a login', async () => {
  for (const opts of [{ breakUsersDelete: true }, { mutatePreserved: true }, { legacyPhotos: 1 }]) {
    const f = fakePool(opts);
    await assert.rejects(runCleanup(f.pool), /Verification failed|migrate/, JSON.stringify(opts));
    assert.ok(f.st.rolledBack && !f.st.committed && f.st.released, 'rolled back: ' + JSON.stringify(opts));
  }
  assert.equal(CONFIRMATION_PHRASE, 'DELETE LOUDENT LOCAL DATA');
});

// Minimal fake database for the staff library (recognises only the statements staff-lib issues).
function staffDb({ users = [], dentists = [{ id: 'santos', name: 'Dr. Maria Santos' }, { id: 'reyes', name: 'Dr. Adrian Reyes' }] } = {}) {
  const sessions = [{ userId: 'u-existing' }]; const rows = [...users];
  return { rows, sessions, async query(sql, p = []) {
    if (/FROM dentists WHERE id=\?/.test(sql)) return dentists.filter((d) => d.id === p[0]);
    if (/FROM users WHERE dentist_id=\?/.test(sql)) return rows.filter((u) => u.dentist_id === p[0]);
    if (/FROM users WHERE email=\? AND id<>\?/.test(sql)) return rows.filter((u) => u.email === p[0] && u.id !== p[1]);
    if (/FROM users WHERE email=\?/.test(sql)) return rows.filter((u) => u.email === p[0]);
    if (/^INSERT INTO users/.test(sql.trim())) { rows.push({ id: p[0], role: 'dentist', dentist_id: p[1], name: p[2], email: p[3], salt: p[4], hash: p[5] }); return {}; }
    if (/^UPDATE users SET password_salt/.test(sql.trim())) { Object.assign(rows.find((u) => u.id === p[2]), { salt: p[0], hash: p[1] }); return {}; }
    if (/^UPDATE users SET email/.test(sql.trim())) { rows.find((u) => u.id === p[1]).email = p[0]; return {}; }
    if (/^DELETE FROM sessions/.test(sql.trim())) { sessions.length = 0; return {}; }
    if (/^UPDATE auth_tokens/.test(sql.trim())) return {};
    throw new Error('unexpected SQL ' + sql);
  } };
}
test('staff provisioning: exactly two dentist logins, strong distinct hashed passwords, idempotent, never silently reset', async () => {
  const db = staffDb(); const first = await provisionStaff(db);
  assert.equal(first.length, 2); assert.ok(first.every((r) => r.created));
  assert.deepEqual(first.map((r) => r.email), ['santos@loudent.test', 'reyes@loudent.test']);
  assert.notEqual(first[0].password, first[1].password); assert.ok(first.every((r) => r.password.length >= 20 && !passwordProblem(r.password)));
  assert.equal(db.rows.length, 2); assert.ok(db.rows.every((u) => u.role === 'dentist' && u.hash !== undefined && !JSON.stringify(u).includes(first[0].password) && !JSON.stringify(u).includes(first[1].password)));
  for (const [i, r] of first.entries()) assert.ok(await comparePassword(r.password, db.rows[i].salt, db.rows[i].hash));
  assert.notEqual(db.rows[0].salt, db.rows[1].salt, 'unique salts');
  const hashes = db.rows.map((u) => u.hash);
  const again = await provisionStaff(db);
  assert.ok(again.every((r) => !r.created && r.password === undefined)); assert.equal(db.rows.length, 2); assert.deepEqual(db.rows.map((u) => u.hash), hashes, 'rerun does not touch existing passwords');
  await assert.rejects(provisionStaff(staffDb({ dentists: [] })), /No dentist profile/);
  await assert.rejects(provisionStaff(staffDb(), { emails: { santos: 'not-an-email' } }), /valid email/);
  await assert.rejects(provisionStaff(staffDb({ users: [{ id: 'x', email: 'santos@loudent.test', dentist_id: null }] })), /already used/);
  const real = await provisionStaff(staffDb(), { emails: { santos: 'Maria@Clinic.PH', reyes: 'adrian@clinic.ph' } });
  assert.deepEqual(real.map((r) => r.email), ['maria@clinic.ph', 'adrian@clinic.ph']); assert.equal(isDevOnlyAddress('maria@clinic.ph'), false); assert.equal(isDevOnlyAddress('x@loudent.test'), true);
});
test('staff password reset and email change', async () => {
  const db = staffDb(); await provisionStaff(db); const oldHash = db.rows[0].hash;
  const r = await resetStaffPassword(db, 'santos'); assert.notEqual(db.rows[0].hash, oldHash); assert.ok(await comparePassword(r.password, db.rows[0].salt, db.rows[0].hash)); assert.equal(db.sessions.length, 0);
  const typed = await resetStaffPassword(db, 'reyes', { password: 'MyOwnChoice2026' }); assert.ok(await comparePassword('MyOwnChoice2026', db.rows[1].salt, db.rows[1].hash)); assert.equal(typed.email, 'reyes@loudent.test');
  await assert.rejects(resetStaffPassword(db, 'reyes', { password: 'weak' }), /at least 8/); await assert.rejects(resetStaffPassword(db, 'nobody'), /Unknown staff id/);
  assert.equal((await setStaffEmail(db, 'reyes', 'Adrian@Clinic.PH')).email, 'adrian@clinic.ph'); await assert.rejects(setStaffEmail(db, 'reyes', 'santos@loudent.test'), /already used/);
});

test('validation helpers', () => {
  assert.equal(normalizePhonePH('0917 123 4567'), '+639171234567'); assert.equal(normalizePhonePH('+63 917 123 4567'), '+639171234567'); assert.equal(normalizePhonePH('(032) 255-1234'), '0322551234');
  for (const bad of ['', '12345', 'abc', '+1 555 123 4567', '0917 123 456', '09171234567890', null, undefined]) assert.equal(normalizePhonePH(bad), null, String(bad));
  assert.equal(passwordProblem('Sunrise2026'), null); for (const bad of ['short1', 'allletters', '12345678', 'password1', undefined]) assert.ok(passwordProblem(bad), String(bad));
  const lim = makeRateLimiter({ windowMs: 1000, max: 2, now: (() => { let t = 0; return () => t; })() }); assert.ok(lim.hit('a').allowed && lim.hit('a').allowed && !lim.hit('a').allowed && lim.hit('b').allowed);
  const set = new Set(Array.from({ length: 50 }, () => generateStrongPassword())); assert.equal(set.size, 50); for (const p of set) assert.ok(p.length >= 20 && /[a-z]/.test(p) && /[A-Z]/.test(p) && /\d/.test(p) && /[^A-Za-z0-9]/.test(p) && !/[0OlI1]/.test(p));
  const e = new Error("(conn=3, no: 1062, SQLState: 23000) Duplicate entry 'ana@example.com' for key 'email'\nsql: INSERT INTO users (...) VALUES (?) - parameters:['id','Ana','ana@example.com','SALTSALT','HASHHASH']");
  const s = safeErrorSummary(e); assert.ok(!/HASHHASH|SALTSALT|parameters|INSERT/.test(s), s); assert.match(s, /Duplicate entry/);
});
