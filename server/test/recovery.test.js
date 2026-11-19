import test from 'node:test';
import assert from 'node:assert/strict';
import { createRecoveryService, GENERIC_RESET_MESSAGE, GENERIC_RESEND_MESSAGE, RESET_TTL_SECONDS, VERIFY_TTL_SECONDS } from '../src/recovery.js';
import { createMailer } from '../src/mail.js';
import { hashToken, comparePassword, makeRateLimiter } from '../src/core.js';

// In-memory store with the same contract as the MariaDB store; the clock is injectable.
function memoryStore(clock) {
  const users = new Map(), tokens = [], sessions = [];
  const store = {
    users, tokens, sessions,
    async findUserByEmail(email) { const u = [...users.values()].find((x) => x.email === email); return u ? { id: u.id, role: u.role, name: u.name, email: u.email, emailVerified: Boolean(u.verifiedAt) } : null; },
    async createPatient({ id, name, email, phone, salt, hash }) { if ([...users.values()].some((u) => u.email === email)) { const e = new Error('dup'); e.code = 'ER_DUP_ENTRY'; throw e; } users.set(id, { id, role: 'patient', name, email, phone, salt, hash, verifiedAt: null }); return { id }; },
    async invalidateTokens(userId, purpose) { for (const t of tokens) if (t.userId === userId && t.purpose === purpose && !t.usedAt) t.usedAt = clock.now; },
    async insertToken({ id, userId, purpose, tokenHash, ttlSeconds }) { tokens.push({ id, userId, purpose, tokenHash, expiresAt: clock.now + ttlSeconds * 1000, usedAt: null }); },
    async findToken(tokenHash) { const t = tokens.find((x) => x.tokenHash === tokenHash); return t ? { id: t.id, userId: t.userId, purpose: t.purpose, used: Boolean(t.usedAt), expired: t.expiresAt <= clock.now } : null; },
    async consumeToken(id) { const t = tokens.find((x) => x.id === id); if (!t || t.usedAt || t.expiresAt <= clock.now) return false; t.usedAt = clock.now; return true; },
    async markVerified(userId) { const u = users.get(userId); u.verifiedAt ??= clock.now; },
    async setPassword(userId, salt, hash) { Object.assign(users.get(userId), { salt, hash }); },
    async deleteSessions(userId) { for (let i = sessions.length - 1; i >= 0; i--) if (sessions[i].userId === userId) sessions.splice(i, 1); },
    async transaction(fn) { return fn(store); },
  };
  return store;
}

function setup() {
  const clock = { now: 1_700_000_000_000 };
  const store = memoryStore(clock);
  const mailer = createMailer({ NODE_ENV: 'development', MAIL_TRANSPORT: 'preview' });
  const quiet = { error() {}, warn() {}, log() {} };
  const originalLog = console.log; console.log = () => {};                 // silence the preview printout
  const service = createRecoveryService({ store, mailer, baseUrl: 'http://localhost:5173', logger: quiet,
    limiters: { registerIp: makeRateLimiter({ windowMs: 900000, max: 10, now: () => clock.now }), recoveryIp: makeRateLimiter({ windowMs: 900000, max: 20, now: () => clock.now }), recoveryEmail: makeRateLimiter({ windowMs: 900000, max: 5, now: () => clock.now }), tokenIp: makeRateLimiter({ windowMs: 900000, max: 30, now: () => clock.now }) } });
  return { clock, store, mailer, service, restore: () => { console.log = originalLog; } };
}
const good = { name: 'Ana Reyes', email: 'ana@example.com', phone: '0917 123 4567', password: 'Sunrise2026', confirmPassword: 'Sunrise2026', acceptedTerms: true };
const tokenFrom = (mailer, email, key) => { const link = mailer.previewFor(email)[0].links[0]; return decodeURIComponent(new URL(link).searchParams.get(key)); };
const rejects = (promise, status) => assert.rejects(promise, (e) => { assert.equal(e.status, status, e.message); return true; });

test('registration: validation, patient-only role, hashing, duplicate', async (t) => {
  const { store, service, restore } = setup(); t.after(restore);
  await rejects(service.registerPatient({ ...good, name: 'A' }), 400);
  await rejects(service.registerPatient({ ...good, email: 'not-an-email' }), 400);
  await rejects(service.registerPatient({ ...good, phone: '12345' }), 400);
  await rejects(service.registerPatient({ ...good, password: 'short1' }), 400);
  await rejects(service.registerPatient({ ...good, password: 'onlyletters' }), 400);
  await rejects(service.registerPatient({ ...good, confirmPassword: 'Different2026' }), 400);
  await rejects(service.registerPatient({ ...good, acceptedTerms: false }), 400);
  assert.equal(store.users.size, 0, 'nothing created for invalid input');
  const res = await service.registerPatient({ ...good, role: 'dentist', dentistId: 'santos', isClinicAdmin: true });
  assert.equal(res.emailVerificationRequired, true);
  const user = [...store.users.values()][0];
  assert.equal(user.role, 'patient', 'role can never be chosen by the client');
  assert.equal(user.phone, '+639171234567');
  assert.notEqual(user.hash, good.password); assert.ok(await comparePassword(good.password, user.salt, user.hash));
  assert.equal(user.verifiedAt, null);
  await rejects(service.registerPatient({ ...good, email: 'ANA@example.com' }), 409);
  assert.equal(store.users.size, 1);
});

test('email verification: hashed, one-time, expiring, superseded by resend', async (t) => {
  const { clock, store, mailer, service, restore } = setup(); t.after(restore);
  await service.registerPatient(good); await service.drain();
  const token = tokenFrom(mailer, good.email, 'verify');
  assert.ok(!JSON.stringify(store.tokens).includes(token), 'plaintext token is never stored');
  assert.equal(store.tokens[0].tokenHash, hashToken(token));
  assert.equal(store.tokens[0].expiresAt - clock.now, VERIFY_TTL_SECONDS * 1000);
  // resend supersedes the first token
  const generic = await service.resendVerification(good.email); await service.drain();
  assert.equal(generic.message, GENERIC_RESEND_MESSAGE);
  await rejects(service.verifyEmail(token), 400);                                     // superseded
  const fresh = tokenFrom(mailer, good.email, 'verify');
  assert.notEqual(fresh, token);
  await service.verifyEmail(fresh);
  assert.ok([...store.users.values()][0].verifiedAt, 'account is verified');
  await rejects(service.verifyEmail(fresh), 400);                                     // one-time
  // an expired link
  const other = { ...good, email: 'ben@example.com' };
  await service.registerPatient(other); await service.drain();
  const t2 = tokenFrom(mailer, other.email, 'verify');
  clock.now += VERIFY_TTL_SECONDS * 1000 + 1000;
  await rejects(service.verifyEmail(t2), 400);
  await rejects(service.verifyEmail('x'.repeat(40)), 400);                            // unknown token
  // resend never mails verified accounts or unknown addresses, but answers identically
  const before = mailer.previewFor(good.email).length;
  const a = await service.resendVerification(good.email), b = await service.resendVerification('nobody@example.com'); await service.drain();
  assert.deepEqual(a, b); assert.equal(mailer.previewFor(good.email).length, before);
  assert.equal(mailer.previewFor('nobody@example.com').length, 0);
});

test('password reset: generic answers, one-time, 20-minute expiry, sessions ended, no account creation, no verification bypass', async (t) => {
  const { clock, store, mailer, service, restore } = setup(); t.after(restore);
  await service.registerPatient(good); await service.drain();
  const uid = [...store.users.keys()][0]; const user = store.users.get(uid);
  store.sessions.push({ userId: uid, token: 'a' }, { userId: uid, token: 'b' }, { userId: 'someone-else', token: 'c' });
  const known = await service.requestPasswordReset(good.email), unknown = await service.requestPasswordReset('ghost@example.com'); await service.drain();
  assert.equal(known.message, GENERIC_RESET_MESSAGE); assert.deepEqual(known, unknown, 'identical response for unknown addresses');
  assert.equal(store.users.size, 1, 'a reset request never creates an account');
  assert.equal(mailer.previewFor('ghost@example.com').length, 0);
  const token = tokenFrom(mailer, good.email, 'reset');
  const row = store.tokens.find((x) => x.purpose === 'password_reset');
  assert.equal(row.expiresAt - clock.now, RESET_TTL_SECONDS * 1000); assert.equal(RESET_TTL_SECONDS, 1200);
  assert.ok(!JSON.stringify(store.tokens).includes(token));
  // weak password does not burn the token
  await rejects(service.resetPassword(token, 'abc'), 400);
  const oldHash = user.hash;
  const done = await service.resetPassword(token, 'BrandNew2026');
  assert.match(done.message, /changed/);
  assert.notEqual(user.hash, oldHash);
  assert.ok(await comparePassword('BrandNew2026', user.salt, user.hash)); assert.ok(!(await comparePassword(good.password, user.salt, user.hash)), 'old password rejected');
  assert.deepEqual(store.sessions.map((s) => s.token), ['c'], 'all sessions of that user ended, others untouched');
  assert.equal(user.verifiedAt, null, 'resetting a password does not verify the email');
  await rejects(service.resetPassword(token, 'AnotherOne2026'), 400);                 // reuse
  // superseded + expired
  await service.requestPasswordReset(good.email); await service.drain(); const first = tokenFrom(mailer, good.email, 'reset');
  clock.now += 1000; await service.requestPasswordReset(good.email); await service.drain();
  const second = mailer.previewFor(good.email)[0].links[0]; const secondToken = decodeURIComponent(new URL(second).searchParams.get('reset'));
  assert.notEqual(first, secondToken); await rejects(service.resetPassword(first, 'AnotherOne2026'), 400);
  clock.now += 19 * 60_000; // still valid at 19 minutes
  assert.ok((await store.findToken(hashToken(secondToken))).expired === false);
  clock.now += 2 * 60_000;  // expired at 21 minutes
  await rejects(service.resetPassword(secondToken, 'AnotherOne2026'), 400);
  // a verification token cannot be used to reset a password (purpose is checked)
  await service.resendVerification(good.email); await service.drain();
  await rejects(service.resetPassword(tokenFrom(mailer, good.email, 'verify'), 'AnotherOne2026'), 400);
});

test('password reset race: two simultaneous uses of one token -> exactly one wins', async (t) => {
  const { store, mailer, service, restore } = setup(); t.after(restore);
  await service.registerPatient(good); await service.requestPasswordReset(good.email); await service.drain();
  const token = tokenFrom(mailer, good.email, 'reset');
  const results = await Promise.allSettled([service.resetPassword(token, 'RaceWinner2026'), service.resetPassword(token, 'RaceLoser2026'), service.resetPassword(token, 'RaceThird2026')]);
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
  const u = [...store.users.values()][0];
  const matches = [];
  for (const candidate of ['RaceWinner2026', 'RaceLoser2026', 'RaceThird2026']) if (await comparePassword(candidate, u.salt, u.hash)) matches.push(candidate);
  assert.equal(matches.length, 1, 'the stored password is exactly the winner\'s, never a mix');
  const winner = results.findIndex((r) => r.status === 'fulfilled');
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1, 'exactly one request wins; which one depends on hashing speed');
  assert.deepEqual(matches, [['RaceWinner2026', 'RaceLoser2026', 'RaceThird2026'][winner]], 'the stored password belongs to the winning request');
});

test('rate limits are keyed by address and apply to unknown addresses equally', async (t) => {
  const { clock, service, restore } = setup(); t.after(restore);
  for (let i = 0; i < 5; i++) await service.requestPasswordReset('ghost@example.com', { ip: `10.0.0.${i}` });
  await rejects(service.requestPasswordReset('ghost@example.com', { ip: '10.0.0.9' }), 429);   // same limit as a real account would hit
  clock.now += 15 * 60_000 + 1;
  await service.requestPasswordReset('ghost@example.com', { ip: '10.0.0.9' });                  // window passed
  for (let i = 0; i < 20; i++) await service.requestPasswordReset(`u${i}@example.com`, { ip: '10.1.1.1' });
  await rejects(service.requestPasswordReset('another@example.com', { ip: '10.1.1.1' }), 429);   // per-IP limit
});

test('mail transports: preview refused in production; SMTP success only when accepted; none sends nothing', async () => {
  assert.throws(() => createMailer({ NODE_ENV: 'production', MAIL_TRANSPORT: 'preview' }), /development-only/);
  assert.equal(createMailer({ NODE_ENV: 'production' }).mode, 'none', 'production default is none, never preview');
  assert.equal(createMailer({ NODE_ENV: 'development' }).mode, 'preview');
  assert.throws(() => createMailer({ MAIL_TRANSPORT: 'carrier-pigeon' }), /Unknown MAIL_TRANSPORT/);
  const none = createMailer({ NODE_ENV: 'production', MAIL_TRANSPORT: 'none' }); const warn = console.warn; console.warn = () => {};
  assert.deepEqual(await none.send({ to: 'a@b.c', subject: 's', text: 't' }), { delivered: false, mode: 'none' }); console.warn = warn;
  assert.deepEqual(createMailer({ NODE_ENV: 'production', MAIL_TRANSPORT: 'none' }).previewFor('a@b.c'), [], 'no preview outside preview mode');
  const env = { NODE_ENV: 'production', MAIL_TRANSPORT: 'smtp', MAIL_SMTP_HOST: 'smtp.example.com', MAIL_FROM: 'x@example.com' };
  let sent; const fake = (accepted) => async () => ({ default: { createTransport: (cfg) => ({ sendMail: async (m) => { sent = { cfg, m }; return { accepted }; } }) } });
  assert.equal((await createMailer(env, { importNodemailer: fake(['a@b.c']) }).send({ to: 'a@b.c', subject: 's', text: 't' })).delivered, true);
  assert.equal(sent.cfg.host, 'smtp.example.com'); assert.equal(sent.cfg.port, 587);
  assert.equal((await createMailer(env, { importNodemailer: fake([]) }).send({ to: 'a@b.c', subject: 's', text: 't' })).delivered, false, 'not accepted by the provider -> not reported as delivered');
  await assert.rejects(createMailer({ ...env, MAIL_SMTP_HOST: '' }).send({ to: 'a@b.c', subject: 's', text: 't' }), /not configured/);
});
