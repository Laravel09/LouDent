// Staff (dentist) login provisioning. Only reachable from the local command line, never through the API.
import { id, hashPassword, validEmail, generateStrongPassword, passwordProblem } from './core.js';

export const STAFF = [
  { dentistId: 'santos', defaultEmail: 'santos@loudent.test', administrator: true },
  { dentistId: 'reyes', defaultEmail: 'reyes@loudent.test', administrator: false },
];
export const isDevOnlyAddress = (email) => /\.(test|invalid|example|localhost)$/i.test(email) || /@example\.(com|org|net)$/i.test(email);

async function dentistProfile(db, dentistId) {
  const row = (await db.query('SELECT id,name FROM dentists WHERE id=?', [dentistId]))[0];
  if (!row) throw new Error(`No dentist profile "${dentistId}" exists. Run "npm run seed" first (it only adds missing clinic content).`);
  return row;
}

/** Creates the two staff logins if missing. Existing logins are NEVER changed (idempotent). */
export async function provisionStaff(db, { emails = {}, generate = generateStrongPassword } = {}) {
  const results = [];
  for (const member of STAFF) {
    const profile = await dentistProfile(db, member.dentistId);
    const existing = (await db.query('SELECT id,email FROM users WHERE dentist_id=?', [member.dentistId]))[0];
    if (existing) { results.push({ dentistId: member.dentistId, email: existing.email, created: false }); continue; }
    const email = String(emails[member.dentistId] || member.defaultEmail).trim().toLowerCase();
    if (!validEmail(email)) throw new Error(`"${email}" is not a valid email address.`);
    if ((await db.query('SELECT id FROM users WHERE email=?', [email])).length) throw new Error(`The address ${email} is already used by another account.`);
    const password = generate();
    const { salt, hash } = await hashPassword(password);
    await db.query("INSERT INTO users (id,role,dentist_id,full_name,email,phone,email_verified_at,password_salt,password_hash) VALUES (?,'dentist',?,?,?,'',UTC_TIMESTAMP(),?,?)", [id(), member.dentistId, profile.name, email, salt, hash]);
    results.push({ dentistId: member.dentistId, email, created: true, password, administrator: member.administrator });
  }
  return results;
}

export async function resetStaffPassword(db, dentistId, { password = generateStrongPassword() } = {}) {
  if (!STAFF.some((s) => s.dentistId === dentistId)) throw new Error(`Unknown staff id "${dentistId}" (use ${STAFF.map((s) => s.dentistId).join(' or ')}).`);
  const user = (await db.query('SELECT id,email FROM users WHERE dentist_id=?', [dentistId]))[0];
  if (!user) throw new Error(`There is no login for "${dentistId}" yet. Run: npm run staff -- provision`);
  const problem = passwordProblem(password);
  if (problem) throw new Error(problem);
  const { salt, hash } = await hashPassword(password);
  await db.query('UPDATE users SET password_salt=?,password_hash=? WHERE id=?', [salt, hash, user.id]);
  await db.query('DELETE FROM sessions WHERE user_id=?', [user.id]);        // signs the account out everywhere
  await db.query('UPDATE auth_tokens SET used_at=UTC_TIMESTAMP() WHERE user_id=? AND used_at IS NULL', [user.id]);
  return { email: user.email, password };
}

export async function setStaffEmail(db, dentistId, rawEmail) {
  const email = String(rawEmail || '').trim().toLowerCase();
  if (!validEmail(email)) throw new Error(`"${rawEmail}" is not a valid email address.`);
  const user = (await db.query('SELECT id FROM users WHERE dentist_id=?', [dentistId]))[0];
  if (!user) throw new Error(`There is no login for "${dentistId}" yet.`);
  if ((await db.query('SELECT id FROM users WHERE email=? AND id<>?', [email, user.id])).length) throw new Error(`The address ${email} is already used by another account.`);
  await db.query('UPDATE users SET email=? WHERE id=?', [email, user.id]);
  return { email, devOnly: isDevOnlyAddress(email) };
}

export async function listStaff(db, adminIds) {
  const rows = await db.query("SELECT u.dentist_id AS dentistId,u.email,d.name FROM users u JOIN dentists d ON d.id=u.dentist_id WHERE u.role='dentist' ORDER BY u.dentist_id");
  return rows.map((r) => ({ ...r, permissions: adminIds.includes(r.dentistId) ? 'clinic administrator (all appointments)' : 'own appointments only', devOnlyAddress: isDevOnlyAddress(r.email) }));
}
