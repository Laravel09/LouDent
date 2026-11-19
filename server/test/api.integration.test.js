// REAL-DATABASE INTEGRATION TEST for the LouDent Express API + MariaDB.
//
// It is skipped unless you opt in, because it creates and deletes rows:
//   PowerShell (from the server folder, after creating the loudent_test database - see README):
//     $env:RUN_DB_TESTS = "1"; npm.cmd test
//
// Safety: it uses server/.env.test (copy .env.example and set DB_NAME=loudent_test) and REFUSES to
// run when DB_NAME does not end in "_test", so it can never touch your real `loudent` data.
//
// Not-yet-verified note: when this file was written, no MariaDB server was available to the author,
// so the database branch (SQL fixtures, cleanup, real concurrency) had never been executed.
// A second mode (API_BASE=http://127.0.0.1:PORT) runs the same HTTP assertions against any server
// that speaks this API; it was used only to check the test logic itself against a simulated API.
import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const MODE = process.env.API_BASE ? 'external' : 'db';
const ENABLED = process.env.RUN_DB_TESTS === '1' || MODE === 'external';
const skip = ENABLED ? false : 'Set RUN_DB_TESTS=1 (and DB_NAME=...._test in server/.env.test) to run the real-database tests.';

const run = Date.now().toString(36);
const PASSWORD = 'IntegrationTest1!';
// Staff logins are provisioned by the test itself (the seed creates no accounts). In external mode the
// simulated API ships fixed fixtures instead.
const STAFF_PASSWORDS = MODE === 'external' ? { santos: 'SantosTest2026x', reyes: 'ReyesTest2026x' } : { santos: 'StaffSantos-IT-1!', reyes: 'StaffReyes-IT-1!' };
const STAFF_EMAIL = MODE === 'external' ? { santos: 'santos@loudent.test', reyes: 'reyes@loudent.test' } : null;
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

let base, server, pool, core, maintenance, staffLib;
const created = { patientIds: [], appointmentIds: [], dentistUserIds: [], blockedDates: [] };

// ── tiny HTTP client with a cookie jar (one jar per simulated browser) ──────────────────────
class Client {
  constructor() { this.cookie = ''; }
  async call(method, path, body) {
    const res = await fetch(base + path, {
      method,
      headers: { 'Content-Type': 'application/json', ...(this.cookie ? { Cookie: this.cookie } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const set = res.headers.getSetCookie?.() ?? [];
    for (const line of set) {
      const pair = line.split(';')[0];
      if (/^ld_session=;?$/.test(pair) || /Max-Age=0/i.test(line)) this.cookie = '';
      else if (pair.startsWith('ld_session=')) this.cookie = pair;
    }
    let json = null; const text = await res.text(); try { json = text ? JSON.parse(text) : null; } catch { /* not json */ }
    return { status: res.status, json, setCookie: set };
  }
  get(p) { return this.call('GET', p); } post(p, b) { return this.call('POST', p, b ?? {}); }
  put(p, b) { return this.call('PUT', p, b); } patch(p, b) { return this.call('PATCH', p, b); } del(p) { return this.call('DELETE', p); }
}

async function newPatient(label, { verify = true } = {}) {
  const email = `it-${label}-${run}@example.test`;
  const c = new Client();
  const reg = await c.post('/api/auth/register', { name: `IT ${label}`, email, phone: '0917 123 4567', password: PASSWORD, confirmPassword: PASSWORD, acceptedTerms: true });
  assert.equal(reg.status, 201, 'register ' + JSON.stringify(reg.json));
  if (verify) await verifyEmailFor(email);
  const login = await c.post('/api/auth/login', { email, password: PASSWORD });
  assert.equal(login.status, 200, 'login');
  created.patientIds.push(login.json.user.id);
  return { c, user: login.json.user, email };
}
// Development mail preview (MAIL_TRANSPORT=preview): newest message first, links carry the one-time token.
async function mailLink(email, key) {
  const r = await new Client().get('/api/dev/mail-preview?to=' + encodeURIComponent(email));
  assert.equal(r.status, 200, 'dev mail preview needs MAIL_TRANSPORT=preview in server/.env.test');
  const link = r.json.flatMap((m) => m.links).find((l) => l.includes(key + '='));
  return link ? decodeURIComponent(new URL(link).searchParams.get(key)) : null;
}
async function verifyEmailFor(email) {
  const token = await mailLink(email, 'verify'); assert.ok(token, 'verification email for ' + email);
  assert.equal((await new Client().post('/api/auth/verify-email', { token })).status, 200);
}
async function expireToken(token) { // make a token expired without waiting 20 minutes
  if (MODE === 'external') { await fetch(`${base}/__advance?minutes=1500`); return; }
  await pool.query("UPDATE auth_tokens SET expires_at=DATE_SUB(UTC_TIMESTAMP(), INTERVAL 1 MINUTE) WHERE token_hash=?", [core.hashToken(token)]);
}
async function staffLogin(who) {
  const email = STAFF_EMAIL ? STAFF_EMAIL[who] : `${who}-it@example.test`;
  const c = new Client(); const r = await c.post('/api/auth/login', { email, password: STAFF_PASSWORDS[who] });
  assert.equal(r.status, 200, `staff login ${who}: ${JSON.stringify(r.json)}`); return { c, user: r.json.user };
}
const adminDentist = () => staffLogin('santos');   // Dr. Santos = clinic administrator
const createReyesLogin = () => staffLogin('reyes'); // Dr. Reyes = non-administrator dentist
async function provisionTestStaff() { // db mode only: two staff logins with KNOWN passwords for this test run
  await pool.query("DELETE FROM sessions");
  for (const who of ['santos', 'reyes']) {
    const existing = (await pool.query('SELECT id FROM users WHERE dentist_id=?', [who]))[0];
    if (existing) await pool.query('UPDATE users SET email=? WHERE id=?', [`${who}-it@example.test`, existing.id]);
  }
  await staffLib.provisionStaff(pool, { emails: { santos: 'santos-it@example.test', reyes: 'reyes-it@example.test' } });
  for (const who of ['santos', 'reyes']) await staffLib.resetStaffPassword(pool, who, { password: STAFF_PASSWORDS[who] });
}
async function createPastConfirmed(patientId, dentistId) {
  if (MODE === 'external') { const r = await fetch(`${base}/__past?dentist=${dentistId}`); return r.text(); }
  const id = core.id(), d = new Date(Date.now() - 3 * 86400000).toISOString().slice(0, 10);
  await pool.query("INSERT INTO appointments (id,reference,patient_id,dentist_id,service_id,appointment_date,start_time,duration_minutes,price,status) VALUES (?,?,?,?,'checkup',?,'09:00:00',30,500,'Confirmed')", [id, `LD-IT-${run}-${dentistId}`, patientId, dentistId, d]);
  created.appointmentIds.push(id); return id;
}
async function findOpenDates(dentistId, serviceId, count) {
  const out = [], c = new Client();
  for (let i = 1; i <= 40 && out.length < count; i++) {
    const date = new Date(Date.now() + i * 86400000).toISOString().slice(0, 10);
    const r = await c.get(`/api/slots?dentistId=${dentistId}&serviceId=${serviceId}&date=${date}`);
    if (r.status === 200) { const open = r.json.filter(s => s.available).map(s => s.time); if (open.length >= 2) out.push({ date, open }); }
  }
  assert.ok(out.length >= count, `need ${count} open dates for ${dentistId}`); return out;
}
const book = (c, dentistId, date, time, serviceId = 'checkup') => c.post('/api/appointments', { serviceId, dentistId, date, time });

test.before(async () => {
  if (!ENABLED) return;
  if (MODE === 'external') { base = process.env.API_BASE; return; }
  const { config } = await import('dotenv'); config({ path: fileURLToPath(new URL('../.env.test', import.meta.url)) });
  if (!/_test$/.test(process.env.DB_NAME || '')) throw new Error('Refusing to run: DB_NAME must end with "_test" (see server/README.md, "Real database tests").');
  core = await import('../src/core.js');
  maintenance = await import('../src/maintenance.js');
  staffLib = await import('../src/staff-lib.js');
  ({ default: pool } = await import('../src/db.js'));
  const { app } = await import('../src/app.js');
  server = await new Promise(res => { const s = app.listen(0, '127.0.0.1', () => res(s)); });
  base = `http://127.0.0.1:${server.address().port}`;
  const missing = await maintenance.missingSchema(pool);
  if (missing.length) throw new Error(`Test database schema is incomplete (${missing.join(', ')}). Re-run server/database/schema.test.sql.`);
  await provisionTestStaff();
});

test.after(async () => {
  if (!ENABLED || MODE === 'external') return;
  try {
    if (created.appointmentIds.length || created.patientIds.length) {
      await pool.query(`DELETE FROM appointments WHERE patient_id IN (${created.patientIds.map(() => '?').join(',') || "''"})`, created.patientIds);
    }
    for (const d of created.blockedDates) await pool.query('DELETE FROM blocked_dates WHERE dentist_id=? AND block_date=?', [d.dentistId, d.date]);
    await pool.query("DELETE FROM sessions WHERE user_id IN (SELECT id FROM users WHERE email LIKE ?)", [`it-%-${run}@example.test`]);
    await pool.query("DELETE FROM users WHERE email LIKE ?", [`it-%-${run}@example.test`]);
  } finally { await new Promise(r => server?.close(r)); await pool.end(); }
});

test('health: API reachable (database connected when running against MariaDB)', { skip }, async () => {
  const r = await new Client().get('/api/health'); assert.equal(r.status, 200); assert.equal(r.json.status, 'ok');
  if (MODE === 'db') assert.equal(r.json.database, 'connected');
});

test('catalog: services and dentists come from the database', { skip }, async () => {
  const c = new Client(); const s = await c.get('/api/services'), d = await c.get('/api/dentists');
  assert.equal(s.status, 200); assert.ok(s.json.length >= 13); assert.ok(s.json.every(x => x.id && x.name && x.category && Number(x.price) > 0 && x.duration > 0));
  assert.ok(s.json.some(x => x.category === 'Orthodontics'));
  assert.equal(d.status, 200); assert.deepEqual(d.json.map(x => x.id).sort(), ['reyes', 'santos']);
});

test('auth: register, login, session cookie, /me, logout, failed login, duplicate email', { skip }, async () => {
  const { c, user, email } = await newPatient('auth');
  assert.equal(user.role, 'patient'); assert.equal(user.isClinicAdmin, false); assert.equal(user.passwordHash, undefined); assert.equal(user.password_hash, undefined);
  const raw = await new Client().post('/api/auth/login', { email, password: PASSWORD });
  assert.ok(raw.setCookie.some(x => /HttpOnly/i.test(x) && /SameSite=Lax/i.test(x) && x.startsWith('ld_session=')), 'HttpOnly SameSite cookie');
  assert.equal((await c.get('/api/auth/me')).json.user.email, email);
  assert.equal((await new Client().get('/api/auth/me')).status, 401);
  assert.equal((await new Client().post('/api/auth/login', { email, password: 'wrong-password' })).status, 401);
  assert.equal((await new Client().post('/api/auth/register', { name: 'Dup', email, phone: '0917 123 4567', password: PASSWORD, acceptedTerms: true })).status, 409);
  assert.equal((await new Client().post('/api/auth/register', { name: 'Short', email: `it-short-${run}@example.test`, phone: '0917 123 4567', password: '123', acceptedTerms: true })).status, 400);
  assert.equal((await c.post('/api/auth/logout')).status, 200);
  assert.equal((await c.get('/api/auth/me')).status, 401, 'session invalid after logout');
});

test('profile and photo: PATCH /api/me, PUT /api/me/photo (valid, invalid, remove), no leakage', { skip }, async () => {
  const a = await newPatient('photo-a'), b = await newPatient('photo-b');
  assert.equal((await a.c.patch('/api/me', { name: 'IT Renamed', phone: '09170000000' })).status, 200);
  assert.equal((await a.c.patch('/api/me', { name: '   ', phone: '' })).status, 400);
  assert.equal((await a.c.put('/api/me/photo', { dataUrl: 'not-an-image' })).status, 400);
  assert.equal((await a.c.put('/api/me/photo', { dataUrl: PNG })).status, 200);
  assert.equal((await a.c.get('/api/auth/me')).json.user.photoDataUrl, PNG);
  assert.equal((await b.c.get('/api/auth/me')).json.user.photoDataUrl, null, 'photo does not leak to another account');
  assert.equal((await a.c.put('/api/me/photo', { dataUrl: null })).status, 200);
  assert.equal((await a.c.get('/api/auth/me')).json.user.photoDataUrl, null);
});

test('booking lifecycle with clinic administrator and non-admin dentist permissions', { skip }, async () => {
  const patient = await newPatient('life'), other = await newPatient('other');
  const santos = await adminDentist(), reyes = await createReyesLogin();
  assert.equal(santos.user.isClinicAdmin, true); assert.equal(reyes.user.isClinicAdmin, false);
  const sDates = await findOpenDates('santos', 'checkup', 3), rDates = await findOpenDates('reyes', 'checkup', 3);

  // create (Pending, price/duration from the server), patient isolation
  const a1 = await book(patient.c, 'santos', sDates[0].date, sDates[0].open[0]);
  assert.equal(a1.status, 201); assert.equal(a1.json.status, 'Pending'); assert.equal(a1.json.price, 500); assert.equal(a1.json.duration, 30); assert.equal(a1.json.time, sDates[0].open[0]);
  assert.equal((await other.c.get('/api/appointments/' + a1.json.id)).status, 404);
  assert.deepEqual((await other.c.get('/api/appointments')).json, []);
  assert.equal((await other.c.post(`/api/appointments/${a1.json.id}/cancel`)).status, 404);
  assert.equal((await patient.c.patch(`/api/appointments/${a1.json.id}/status`, { status: 'Confirmed' })).status, 403);
  assert.equal((await new Client().get('/api/appointments')).status, 401);

  // validation
  assert.equal((await book(patient.c, 'santos', '2020-01-06', '9:00 AM')).status, 400, 'past date');
  assert.equal((await book(patient.c, 'santos', sDates[0].date, '12:00 PM')).status, 400, 'not an offered slot');
  assert.equal((await book(patient.c, 'reyes', rDates[0].date, rDates[0].open[0], 'veneers')).status, 400, 'dentist does not offer service');

  // slot becomes unavailable and double booking is refused
  const taken = (await new Client().get(`/api/slots?dentistId=santos&serviceId=checkup&date=${sDates[0].date}`)).json.find(s => s.time === sDates[0].open[0]);
  assert.equal(taken.available, false);
  assert.equal((await book(other.c, 'santos', sDates[0].date, sDates[0].open[0])).status, 409);

  // Reyes appointment managed by the administrator (Santos); non-admin Reyes cannot manage Santos's
  const r1 = await book(patient.c, 'reyes', rDates[0].date, rDates[0].open[0]); assert.equal(r1.status, 201);
  assert.equal((await reyes.c.patch(`/api/appointments/${a1.json.id}/status`, { status: 'Confirmed' })).status, 403);
  assert.equal((await reyes.c.post(`/api/appointments/${a1.json.id}/cancel`)).status, 403);
  assert.equal((await reyes.c.get('/api/appointments/' + a1.json.id)).status, 404);
  assert.ok((await reyes.c.get('/api/appointments')).json.every(x => x.dentistId === 'reyes'), 'non-admin sees only own');
  const adminList = (await santos.c.get('/api/appointments')).json; assert.ok(adminList.some(x => x.dentistId === 'reyes') && adminList.some(x => x.dentistId === 'santos'));
  assert.equal((await santos.c.patch(`/api/appointments/${r1.json.id}/status`, { status: 'Confirmed' })).json.status, 'Confirmed', 'admin confirms Reyes appointment');
  assert.equal((await patient.c.get('/api/appointments/' + r1.json.id)).json.status, 'Confirmed', 'patient sees confirmed');
  assert.equal((await santos.c.post(`/api/appointments/${r1.json.id}/cancel`)).json.status, 'Cancelled', 'admin cancels Reyes appointment');
  assert.equal((await santos.c.patch(`/api/appointments/${r1.json.id}/status`, { status: 'Confirmed' })).status, 409, 'cancelled cannot be re-confirmed');

  // decline with reason (admin on Reyes, Reyes on own)
  const r2 = await book(patient.c, 'reyes', rDates[1].date, rDates[1].open[0]);
  const dec = await santos.c.patch(`/api/appointments/${r2.json.id}/status`, { status: 'Declined', declineReason: 'Dr. Reyes is on leave' });
  assert.equal(dec.json.status, 'Declined'); assert.equal(dec.json.declineReason, 'Dr. Reyes is on leave');
  assert.equal((await patient.c.get('/api/appointments/' + r2.json.id)).json.declineReason, 'Dr. Reyes is on leave');
  const r3 = await book(patient.c, 'reyes', rDates[2].date, rDates[2].open[0]);
  assert.equal((await reyes.c.patch(`/api/appointments/${r3.json.id}/status`, { status: 'Confirmed' })).json.status, 'Confirmed', 'non-admin confirms own');

  // completion: never for the future; allowed once the time has passed
  assert.equal((await santos.c.patch(`/api/appointments/${r3.json.id}/status`, { status: 'Completed' })).status, 409, 'future appointment cannot be completed');
  const past1 = await createPastConfirmed(patient.user.id, 'reyes'), past2 = await createPastConfirmed(patient.user.id, 'santos');
  const list = (await santos.c.get('/api/appointments')).json; const pastIds = list.filter(x => /LD-(IT|PAST)/.test(x.reference) && x.status === 'Confirmed' && x.date < new Date().toISOString().slice(0, 10)).map(x => x.id);
  assert.ok(pastIds.length >= 2, 'past confirmed fixtures visible to administrator');
  for (const id of pastIds.slice(0, 2)) assert.equal((await santos.c.patch(`/api/appointments/${id}/status`, { status: 'Completed' })).json.status, 'Completed');
  void past1; void past2;

  // patient cancel and rebook the same slot
  assert.equal((await patient.c.post(`/api/appointments/${a1.json.id}/cancel`)).json.status, 'Cancelled');
  assert.equal((await book(other.c, 'santos', sDates[0].date, sDates[0].open[0])).status, 201, 'cancelled slot can be rebooked');
});

test('reschedule: same slot allowed, taken slot rejected, original reference kept', { skip }, async () => {
  const p = await newPatient('resched'), q = await newPatient('resched-q');
  const d = await findOpenDates('santos', 'checkup', 3);
  const a = await book(p.c, 'santos', d[1].date, d[1].open[0]); assert.equal(a.status, 201);
  const same = await p.c.post(`/api/appointments/${a.json.id}/reschedule`, { serviceId: 'checkup', dentistId: 'santos', date: d[1].date, time: d[1].open[0] });
  assert.equal(same.status, 200, 'own current slot allowed'); assert.equal(same.json.reference, a.json.reference); assert.equal(same.json.id, a.json.id);
  const own = (await p.c.get(`/api/slots?dentistId=santos&serviceId=checkup&date=${d[1].date}&excludeAppointmentId=${a.json.id}`)).json.find(s => s.time === d[1].open[0]);
  assert.equal(own.available, true, 'slots endpoint honours excludeAppointmentId for the owner');
  const asOther = (await q.c.get(`/api/slots?dentistId=santos&serviceId=checkup&date=${d[1].date}&excludeAppointmentId=${a.json.id}`)).json.find(s => s.time === d[1].open[0]);
  assert.equal(asOther.available, false, 'exclude is ignored for non-owners');
  const b = await book(q.c, 'santos', d[2].date, d[2].open[0]); assert.equal(b.status, 201);
  assert.equal((await p.c.post(`/api/appointments/${a.json.id}/reschedule`, { serviceId: 'checkup', dentistId: 'santos', date: d[2].date, time: d[2].open[0] })).status, 409, 'taken slot rejected');
  const free = d[2].open.find(t => t !== d[2].open[0]);
  const moved = await p.c.post(`/api/appointments/${a.json.id}/reschedule`, { serviceId: 'checkup', dentistId: 'santos', date: d[2].date, time: free });
  assert.equal(moved.status, 200); assert.equal(moved.json.status, 'Pending'); assert.equal(moved.json.date, d[2].date); assert.equal(moved.json.reference, a.json.reference);
  assert.equal((await q.c.post(`/api/appointments/${a.json.id}/reschedule`, { serviceId: 'checkup', dentistId: 'santos', date: d[2].date, time: free })).status, 404, "cannot reschedule someone else's appointment");
});

test('CONCURRENCY: simultaneous bookings and reschedules never create overlapping appointments', { skip }, async () => {
  const people = await Promise.all([newPatient('c1'), newPatient('c2'), newPatient('c3')]);
  const d = await findOpenDates('santos', 'checkup', 2);
  const slot = { date: d[0].date, time: d[0].open[0] };
  // 9 simultaneous attempts (3 per patient) at the same slot
  const attempts = await Promise.all(people.flatMap(p => [0, 1, 2].map(() => book(p.c, 'santos', slot.date, slot.time))));
  const ok = attempts.filter(x => x.status === 201), refused = attempts.filter(x => x.status === 409);
  assert.equal(ok.length, 1, `exactly one booking may win (got ${ok.length})`); assert.equal(refused.length, 8, 'every other attempt gets 409');
  // overlapping times (checkup is 30 min; cleaning is 45 min and overlaps the following slot when adjacent)
  const day = (await new Client().get(`/api/slots?dentistId=santos&serviceId=checkup&date=${d[1].date}`)).json.filter(s => s.available).map(s => s.time);
  const raced = await Promise.all(people.map(p => book(p.c, 'santos', d[1].date, day[0])));
  assert.equal(raced.filter(x => x.status === 201).length, 1);
  // two patients reschedule their own appointments into the same free slot at once
  const mine = []; for (let i = 0; i < 2; i++) { const r = await book(people[i].c, 'santos', d[1].date, day[i + 1] ?? day[1]); if (r.status === 201) mine.push({ p: people[i], a: r.json }); }
  if (mine.length === 2) {
    const target = (await new Client().get(`/api/slots?dentistId=santos&serviceId=checkup&date=${d[0].date}`)).json.filter(s => s.available).map(s => s.time)[0];
    if (target) {
      const res = await Promise.all(mine.map(m => m.p.c.post(`/api/appointments/${m.a.id}/reschedule`, { serviceId: 'checkup', dentistId: 'santos', date: d[0].date, time: target })));
      assert.equal(res.filter(x => x.status === 200).length, 1, 'only one concurrent reschedule may take the slot');
    }
  }
  // final invariant: no two active appointments overlap for the dentist on these dates
  const all = (await (await adminDentist()).c.get('/api/appointments')).json.filter(x => x.dentistId === 'santos' && ['Pending', 'Confirmed'].includes(x.status));
  for (const x of all) for (const y of all) if (x.id < y.id && x.date === y.date) {
    const m = t => { const k = t.match(/(\d+):(\d+) (AM|PM)/); return ((+k[1]) % 12 + (k[3] === 'PM' ? 12 : 0)) * 60 + (+k[2]); };
    assert.ok(!(m(x.time) < m(y.time) + y.duration && m(x.time) + x.duration > m(y.time)), `overlap: ${x.reference} vs ${y.reference}`);
  }
});

test('dentist schedule and blocked dates: validation, conflicts, immediate effect on slots', { skip }, async () => {
  const patient = await newPatient('sched'), santos = await adminDentist(), reyes = await createReyesLogin();
  const original = (await santos.c.get('/api/dentists/santos/schedule')).json;
  assert.equal(original.days.length, 7);
  const d = await findOpenDates('santos', 'checkup', 4);
  const booked = await book(patient.c, 'santos', d[0].date, d[0].open[0]); assert.equal(booked.status, 201);
  const wd = new Date(d[0].date + 'T12:00:00Z').getUTCDay(), name = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][wd];
  const mutate = (fn) => original.days.map(x => ({ ...x, ...(x.day === name ? fn(x) : {}) }));
  assert.equal((await santos.c.put('/api/dentists/santos/schedule', { days: mutate(() => ({ start: '6:00 PM', end: '9:00 AM' })) })).status, 400, 'start after end');
  assert.equal((await santos.c.put('/api/dentists/santos/schedule', { days: mutate(() => ({ breakStart: '12:00 PM', breakEnd: null })) })).status, 400, 'incomplete break');
  assert.equal((await santos.c.put('/api/dentists/santos/schedule', { days: original.days.slice(0, 6) })).status, 400, 'needs all seven days');
  assert.equal((await santos.c.put('/api/dentists/santos/schedule', { days: mutate(() => ({ start: '3:00 PM', end: '5:00 PM' })) })).status, 409, 'would strand an active booking');
  assert.equal((await reyes.c.put('/api/dentists/santos/schedule', { days: original.days })).status, 403, 'only the dentist edits their own schedule');
  assert.equal((await patient.c.put('/api/dentists/santos/schedule', { days: original.days })).status, 403);
  assert.equal((await santos.c.post('/api/dentists/santos/blocked-dates', { date: d[0].date })).status, 409, 'date with an active booking cannot be blocked');
  // free date: block and unblock
  const free = d[d.length - 1].date; created.blockedDates.push({ dentistId: 'santos', date: free });
  assert.equal((await santos.c.post('/api/dentists/santos/blocked-dates', { date: free })).status, 200);
  assert.ok((await new Client().get('/api/dentists/santos/schedule')).json.blockedDates.includes(free));
  assert.ok((await new Client().get(`/api/slots?dentistId=santos&serviceId=checkup&date=${free}`)).json.every(s => !s.available), 'blocked date has no slots');
  assert.equal((await book(patient.c, 'santos', free, d[d.length - 1].open[0])).status, 409);
  assert.equal((await santos.c.del(`/api/dentists/santos/blocked-dates/${free}`)).status, 200);
  assert.ok((await new Client().get(`/api/slots?dentistId=santos&serviceId=checkup&date=${free}`)).json.some(s => s.available), 'slots return after unblocking');
  assert.equal((await santos.c.post('/api/dentists/santos/blocked-dates', { date: 'not-a-date' })).status, 400);
  // profile
  assert.equal((await santos.c.patch('/api/dentists/santos/profile', { name: 'Dr. Maria Santos', title: 'DMD', specialty: '', bio: 'x' })).status, 400);
  assert.equal((await reyes.c.patch('/api/dentists/santos/profile', { name: 'Hacker', specialty: 'x', bio: 'x' })).status, 403);
  // dentist photo set / remove is reflected in the public list and does not bring the stock photo back
  assert.equal((await santos.c.put('/api/me/photo', { dataUrl: PNG })).status, 200);
  assert.equal((await new Client().get('/api/dentists')).json.find(x => x.id === 'santos').photo, PNG);
});

// ── Registration, email verification and the booking gate ───────────────────────────────────
test('registration validation, patient-only role, email verification and the booking gate', { skip }, async () => {
  const c = new Client(); const email = `it-gate-${run}@example.test`;
  const ok = { name: 'IT Gate', email, phone: '0917 123 4567', password: PASSWORD, confirmPassword: PASSWORD, acceptedTerms: true };
  for (const [bad, why] of [[{ name: 'A' }, 'short name'], [{ email: 'nope' }, 'bad email'], [{ phone: '12345' }, 'bad phone'], [{ password: 'abc', confirmPassword: 'abc' }, 'weak password'], [{ confirmPassword: 'Other1234x' }, 'mismatch'], [{ acceptedTerms: false }, 'terms']]) {
    assert.equal((await c.post('/api/auth/register', { ...ok, ...bad })).status, 400, why);
  }
  const reg = await c.post('/api/auth/register', { ...ok, role: 'dentist', dentistId: 'santos', isClinicAdmin: true });
  assert.equal(reg.status, 201); assert.equal(reg.json.emailVerificationRequired, true);
  assert.equal((await new Client().post('/api/auth/register', ok)).status, 409, 'duplicate email');
  const login = await c.post('/api/auth/login', { email, password: PASSWORD }); created.patientIds.push(login.json.user.id);
  assert.equal(login.json.user.role, 'patient'); assert.equal(login.json.user.dentistId, null); assert.equal(login.json.user.isClinicAdmin, false); assert.equal(login.json.user.emailVerified, false);
  const d = (await findOpenDates('santos', 'checkup', 1))[0];
  const blocked = await book(c, 'santos', d.date, d.open[0]);
  assert.equal(blocked.status, 403); assert.equal(blocked.json.code, 'EMAIL_NOT_VERIFIED');
  const token = await mailLink(email, 'verify'); assert.ok(token);
  assert.equal((await new Client().post('/api/auth/verify-email', { token: 'x'.repeat(40) })).status, 400);
  assert.equal((await new Client().post('/api/auth/verify-email', { token })).status, 200);
  assert.equal((await new Client().post('/api/auth/verify-email', { token })).status, 400, 'one-time');
  assert.equal((await c.get('/api/auth/me')).json.user.emailVerified, true);
  assert.equal((await book(c, 'santos', d.date, d.open[0])).status, 201, 'verified patient can book');
});

test('forgot / reset password: generic answers, one-time, expiry, superseded, sessions ended, old password rejected', { skip }, async () => {
  const p = await newPatient('reset'); const other = new Client();
  const known = await other.post('/api/auth/forgot-password', { email: p.email }), unknown = await other.post('/api/auth/forgot-password', { email: `it-ghost-${run}@example.test` });
  assert.equal(known.status, 200); assert.deepEqual(known.json, unknown.json, 'no account enumeration');
  assert.equal((await new Client().post('/api/auth/login', { email: `it-ghost-${run}@example.test`, password: PASSWORD })).status, 401, 'reset request never creates an account');
  const first = await mailLink(p.email, 'reset'); assert.ok(first);
  assert.equal((await new Client().get('/api/dev/mail-preview?to=' + encodeURIComponent(`it-ghost-${run}@example.test`))).json.length, 0);
  await other.post('/api/auth/forgot-password', { email: p.email }); const second = await mailLink(p.email, 'reset'); assert.notEqual(first, second);
  assert.equal((await new Client().post('/api/auth/reset-password', { token: first, password: 'Fresh-Pass-2026' })).status, 400, 'superseded token refused');
  assert.equal((await new Client().post('/api/auth/reset-password', { token: second, password: 'weak' })).status, 400, 'weak password refused without burning the token');
  assert.equal((await p.c.get('/api/auth/me')).status, 200, 'signed in before the reset');
  assert.equal((await new Client().post('/api/auth/reset-password', { token: second, password: 'Fresh-Pass-2026' })).status, 200);
  assert.equal((await p.c.get('/api/auth/me')).status, 401, 'every session of the account was ended');
  assert.equal((await new Client().post('/api/auth/login', { email: p.email, password: PASSWORD })).status, 401, 'old password rejected');
  assert.equal((await new Client().post('/api/auth/login', { email: p.email, password: 'Fresh-Pass-2026' })).status, 200, 'new password works');
  assert.equal((await new Client().post('/api/auth/reset-password', { token: second, password: 'Another-2026x' })).status, 400, 'reuse refused');
  await other.post('/api/auth/forgot-password', { email: p.email }); const third = await mailLink(p.email, 'reset'); await expireToken(third);
  assert.equal((await new Client().post('/api/auth/reset-password', { token: third, password: 'Another-2026x' })).status, 400, 'expired token refused');
  // a reset does not verify an unverified address
  const u = await newPatient('unverified-reset', { verify: false });
  await other.post('/api/auth/forgot-password', { email: u.email }); const t = await mailLink(u.email, 'reset');
  assert.equal((await new Client().post('/api/auth/reset-password', { token: t, password: 'Fresh-Pass-2026' })).status, 200);
  const again = new Client(); await again.post('/api/auth/login', { email: u.email, password: 'Fresh-Pass-2026' });
  assert.equal((await again.get('/api/auth/me')).json.user.emailVerified, false);
  // throttling: the sixth request for one address inside the window is refused
  const codes = []; for (let i = 0; i < 7; i++) codes.push((await other.post('/api/auth/forgot-password', { email: `it-rate-${run}@example.test` })).status);
  assert.ok(codes.includes(429), 'rate limited: ' + codes.join(','));
});

// ── Everything below needs the real database (skipped against the simulator) ────────────────
const dbOnly = skip || (MODE === 'external' ? 'real-database only' : false);

test('database schema is current and the cleanup tool refuses any target except local "loudent"', { skip: dbOnly }, async () => {
  assert.deepEqual(await maintenance.missingSchema(pool), []);
  assert.throws(() => maintenance.assertLocalDevTarget({ DB_HOST: '127.0.0.1', DB_NAME: 'loudent_test' }), /Refusing to run/);
  assert.throws(() => maintenance.assertLocalDevTarget({ DB_HOST: 'db.example.com', DB_NAME: 'loudent' }), /Refusing to run/);
});

test('cleanup (library, on the _test database) removes accounts/appointments/sessions/tokens and preserves clinic data and dentist pictures; staff re-provisioning is idempotent', { skip: dbOnly }, async () => {
  // data that must survive: a dentist picture set through the API
  const santos = await adminDentist(); assert.equal((await santos.c.put('/api/me/photo', { dataUrl: PNG })).status, 200);
  assert.equal((await pool.query("SELECT photo_url AS p FROM dentists WHERE id='santos'"))[0].p, PNG, 'dentist picture is stored on the dentist profile');
  assert.equal((await pool.query("SELECT COUNT(*) AS n FROM users WHERE role='dentist' AND photo_data_url IS NOT NULL"))[0].n.toString(), '0');
  const p = await newPatient('cleanup'); const d = (await findOpenDates('santos', 'checkup', 1))[0]; assert.equal((await book(p.c, 'santos', d.date, d.open[0])).status, 201);
  await new Client().post('/api/auth/forgot-password', { email: p.email });
  const plan = await maintenance.planCleanup(pool);
  assert.ok(plan.counts.users >= 3 && plan.counts.appointments >= 1 && plan.counts.auth_tokens >= 1 && plan.counts.sessions >= 1);
  assert.equal((await maintenance.planCleanup(pool)).counts.users, plan.counts.users, 'dry run changes nothing');
  const result = await maintenance.runCleanup(pool);
  for (const t of maintenance.CLEARED_TABLES) assert.equal(result.after[t], 0, t);
  for (const t of maintenance.PRESERVED_TABLES) assert.equal(result.after[t], result.before[t], t);
  assert.equal((await pool.query("SELECT photo_url AS p FROM dentists WHERE id='santos'"))[0].p, PNG, 'dentist picture survived the cleanup');
  assert.equal(result.after.dentists, 2); assert.ok(result.after.services >= 13);
  // staff provisioning after the cleanup: exactly two dentist logins, idempotent, never silently reset
  const made = await staffLib.provisionStaff(pool, { emails: { santos: 'santos-it@example.test', reyes: 'reyes-it@example.test' } });
  assert.deepEqual(made.map((x) => x.created), [true, true]);
  assert.equal((await pool.query("SELECT COUNT(*) AS n FROM users"))[0].n.toString(), '2'); assert.equal((await pool.query("SELECT COUNT(*) AS n FROM users WHERE role='dentist'"))[0].n.toString(), '2');
  const hashes = (await pool.query('SELECT password_hash AS h FROM users ORDER BY dentist_id')).map((r) => r.h);
  const again = await staffLib.provisionStaff(pool); assert.ok(again.every((x) => !x.created));
  assert.deepEqual((await pool.query('SELECT password_hash AS h FROM users ORDER BY dentist_id')).map((r) => r.h), hashes, 'rerun did not touch passwords');
  assert.ok(made.every((x) => x.password.length >= 20) && made[0].password !== made[1].password);
  assert.ok(!JSON.stringify(await pool.query('SELECT * FROM users')).includes(made[0].password), 'plaintext password is not stored');
  await staffLib.resetStaffPassword(pool, 'santos', { password: STAFF_PASSWORDS.santos }); await staffLib.resetStaffPassword(pool, 'reyes', { password: STAFF_PASSWORDS.reyes });
  const s = await adminDentist(), r = await createReyesLogin();
  assert.equal(s.user.isClinicAdmin, true); assert.equal(r.user.isClinicAdmin, false); assert.equal(r.user.dentistId, 'reyes');
  assert.equal((await new Client().post('/api/auth/login', { email: 'santos-it@example.test', password: 'wrong' })).status, 401);
});
