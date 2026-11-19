// Account registration, email verification and password recovery logic.
// Storage and mail are injected, so the security rules below can be unit-tested without a database.
//
// Rules implemented here:
//  - tokens are 256-bit random values; only their SHA-256 hash is stored; they are one-time and expire
//  - requesting a new token invalidates earlier unused tokens of the same purpose
//  - forgot-password / resend-verification return the SAME generic answer whether or not the account exists
//  - resetting a password never creates an account, never marks the email verified, and ends all sessions
//  - patients are the only accounts that can self-register; role is never taken from the request
import { fail, clean, validEmail, hashPassword, id, newToken, hashToken, normalizePhonePH, passwordProblem, makeRateLimiter, safeErrorSummary } from './core.js';
import { verificationEmail, passwordResetEmail } from './mail-templates.js';

export const RESET_TTL_SECONDS = 20 * 60;
export const VERIFY_TTL_SECONDS = 24 * 60 * 60;
export const GENERIC_RESET_MESSAGE = 'If that email address is registered, we have sent instructions. Please check your inbox (and spam folder).';
export const GENERIC_RESEND_MESSAGE = 'If that account exists and still needs verification, we have sent a new verification email. Please check your inbox (and spam folder).';
const INVALID_LINK = 'This link is invalid, has already been used, or has expired. Please request a new one.';

export function createRecoveryService({ store, mailer, baseUrl, logger = console, limiters, ipLimitScale = 1 } = {}) {
  const base = String(baseUrl || 'http://localhost:5173').replace(/\/+$/, '');
  // Behind the Vite dev proxy every visitor shares one IP address, so the per-IP limits are generous by
  // default and can be scaled (AUTH_RATE_LIMIT_IP_SCALE). Per-ADDRESS limits are never scaled.
  const scale = Number.isFinite(ipLimitScale) && ipLimitScale >= 1 ? ipLimitScale : 1;
  const lim = limiters ?? {
    registerIp: makeRateLimiter({ windowMs: 15 * 60_000, max: 20 * scale }),
    recoveryIp: makeRateLimiter({ windowMs: 15 * 60_000, max: 30 * scale }),
    recoveryEmail: makeRateLimiter({ windowMs: 15 * 60_000, max: 5 }),
    tokenIp: makeRateLimiter({ windowMs: 15 * 60_000, max: 40 * scale }),
  };
  const inflight = new Set();

  function limit(limiter, key) {
    const r = limiter.hit(key);
    if (!r.allowed) {
      const e = fail(429, 'Too many requests. Please wait a few minutes and try again.');
      e.retryAfterSeconds = Math.ceil(r.retryAfterMs / 1000);
      throw e;
    }
  }

  // Mail is sent without making the HTTP response wait for it (equal response time whether or not the
  // account exists). Failures are logged, never shown to the requester.
  function deliver(message) {
    const p = mailer.send(message).then(
      (result) => result,
      (error) => { logger.error(`[mail] send failed: ${safeErrorSummary(error)}`); return { delivered: false, mode: mailer.mode, error: true }; },
    );
    inflight.add(p); p.finally(() => inflight.delete(p));
    return p;
  }

  async function issueToken(user, purpose) {
    const ttl = purpose === 'password_reset' ? RESET_TTL_SECONDS : VERIFY_TTL_SECONDS;
    const token = newToken();
    await store.transaction(async (tx) => {
      await tx.invalidateTokens(user.id, purpose);
      await tx.insertToken({ id: id(), userId: user.id, purpose, tokenHash: hashToken(token), ttlSeconds: ttl });
    });
    return token;
  }

  async function sendVerification(user) {
    const token = await issueToken(user, 'email_verify');
    const link = `${base}/?verify=${encodeURIComponent(token)}`;
    deliver({ to: user.email, links: [link], ...verificationEmail({ name: user.name, link, hours: VERIFY_TTL_SECONDS / 3600 }) });
  }

  return {
    mailMode: () => mailer.mode,
    /** Wait for any in-flight mail (tests, graceful shutdown). */
    drain: () => Promise.allSettled([...inflight]),

    async registerPatient(body, { ip = 'unknown' } = {}) {
      limit(lim.registerIp, `register:${ip}`);
      const name = clean(body.name, 150);
      const email = clean(body.email, 254).toLowerCase();
      const phone = normalizePhonePH(clean(body.phone, 40));
      if (name.length < 2) throw fail(400, 'Enter your full name.');
      if (!validEmail(email)) throw fail(400, 'Enter a valid email address.');
      if (!phone) throw fail(400, 'Enter a valid Philippine phone number, for example 0917 123 4567.');
      const problem = passwordProblem(body.password, { email, name });
      if (problem) throw fail(400, problem);
      if (body.confirmPassword !== undefined && body.confirmPassword !== body.password) throw fail(400, 'Passwords do not match.');
      if (body.acceptedTerms !== true) throw fail(400, 'You must accept the Terms and Privacy Policy to create an account.');
      const { salt, hash } = await hashPassword(body.password);
      let user;
      try {
        user = await store.createPatient({ id: id(), name, email, phone, salt, hash });
      } catch (error) {
        if (error?.code === 'ER_DUP_ENTRY') throw fail(409, 'An account with this email address already exists. Try logging in or resetting your password.');
        throw error;
      }
      try { await sendVerification({ id: user.id, email, name }); } catch (error) { logger.error(`[register] could not issue verification email: ${safeErrorSummary(error)}`); }
      return { message: 'Account created. Please verify your email address to start booking.', emailVerificationRequired: true, mailMode: mailer.mode };
    },

    async resendVerification(rawEmail, { ip = 'unknown' } = {}) {
      limit(lim.recoveryIp, `recovery:${ip}`);
      const email = clean(rawEmail, 254).toLowerCase();
      if (validEmail(email)) {
        limit(lim.recoveryEmail, `resend:${email}`);
        const user = await store.findUserByEmail(email);
        if (user && user.role === 'patient' && !user.emailVerified) await sendVerification(user);
      }
      return { message: GENERIC_RESEND_MESSAGE, mailMode: mailer.mode };
    },

    async verifyEmail(token, { ip = 'unknown' } = {}) {
      limit(lim.tokenIp, `token:${ip}`);
      if (typeof token !== 'string' || token.length < 20 || token.length > 200) throw fail(400, INVALID_LINK);
      const ok = await store.transaction(async (tx) => {
        const row = await tx.findToken(hashToken(token));
        if (!row || row.purpose !== 'email_verify' || row.used || row.expired) return false;
        if (!(await tx.consumeToken(row.id))) return false;        // atomic: only one request can win
        await tx.markVerified(row.userId);
        return true;
      });
      if (!ok) throw fail(400, INVALID_LINK);
      return { message: 'Your email address is verified. You can now book appointments.' };
    },

    async requestPasswordReset(rawEmail, { ip = 'unknown' } = {}) {
      limit(lim.recoveryIp, `recovery:${ip}`);
      const email = clean(rawEmail, 254).toLowerCase();
      if (validEmail(email)) {
        limit(lim.recoveryEmail, `reset:${email}`);
        const user = await store.findUserByEmail(email);
        if (user) {
          const token = await issueToken(user, 'password_reset');
          const link = `${base}/?reset=${encodeURIComponent(token)}`;
          deliver({ to: user.email, links: [link], ...passwordResetEmail({ name: user.name, link, minutes: RESET_TTL_SECONDS / 60 }) });
        }
      }
      return { message: GENERIC_RESET_MESSAGE, mailMode: mailer.mode };
    },

    async resetPassword(token, newPassword, { ip = 'unknown' } = {}) {
      limit(lim.tokenIp, `token:${ip}`);
      if (typeof token !== 'string' || token.length < 20 || token.length > 200) throw fail(400, INVALID_LINK);
      const problem = passwordProblem(newPassword);
      if (problem) throw fail(400, problem);
      const { salt, hash } = await hashPassword(newPassword);
      const ok = await store.transaction(async (tx) => {
        const row = await tx.findToken(hashToken(token));
        if (!row || row.purpose !== 'password_reset' || row.used || row.expired) return false;
        if (!(await tx.consumeToken(row.id))) return false;
        await tx.setPassword(row.userId, salt, hash);
        await tx.invalidateTokens(row.userId, 'password_reset');
        await tx.deleteSessions(row.userId);                          // every signed-in browser is logged out
        return true;
      });
      if (!ok) throw fail(400, INVALID_LINK);
      return { message: 'Your password has been changed. Please log in with your new password.' };
    },
  };
}

// ── MariaDB-backed store ───────────────────────────────────────────────────────────────────────
// Expiry is computed by the database clock in UTC (matching sessions.expires_at), never in JS.
function storeFor(db, transactionRunner) {
  return {
    async findUserByEmail(email) {
      const rows = await db.query('SELECT id,role,full_name AS name,email,(email_verified_at IS NOT NULL) AS emailVerified FROM users WHERE email=?', [email]);
      const u = rows[0];
      return u ? { id: u.id, role: u.role, name: u.name, email: u.email, emailVerified: Boolean(u.emailVerified) } : null;
    },
    async createPatient({ id: uid, name, email, phone, salt, hash }) {
      await db.query("INSERT INTO users (id,role,full_name,email,phone,password_salt,password_hash) VALUES (?,'patient',?,?,?,?,?)", [uid, name, email, phone, salt, hash]);
      return { id: uid };
    },
    async invalidateTokens(userId, purpose) {
      await db.query('UPDATE auth_tokens SET used_at=UTC_TIMESTAMP() WHERE user_id=? AND purpose=? AND used_at IS NULL', [userId, purpose]);
    },
    async insertToken({ id: tid, userId, purpose, tokenHash, ttlSeconds }) {
      await db.query('INSERT INTO auth_tokens (id,user_id,purpose,token_hash,expires_at) VALUES (?,?,?,?,DATE_ADD(UTC_TIMESTAMP(), INTERVAL ? SECOND))', [tid, userId, purpose, tokenHash, ttlSeconds]);
    },
    async findToken(tokenHash) {
      const rows = await db.query('SELECT id,user_id AS userId,purpose,(used_at IS NOT NULL) AS used,(expires_at<=UTC_TIMESTAMP()) AS expired FROM auth_tokens WHERE token_hash=? FOR UPDATE', [tokenHash]);
      const r = rows[0];
      return r ? { id: r.id, userId: r.userId, purpose: r.purpose, used: Boolean(r.used), expired: Boolean(r.expired) } : null;
    },
    async consumeToken(tokenId) {
      const res = await db.query('UPDATE auth_tokens SET used_at=UTC_TIMESTAMP() WHERE id=? AND used_at IS NULL AND expires_at>UTC_TIMESTAMP()', [tokenId]);
      return Number(res.affectedRows) === 1;
    },
    async markVerified(userId) { await db.query('UPDATE users SET email_verified_at=COALESCE(email_verified_at,UTC_TIMESTAMP()) WHERE id=?', [userId]); },
    async setPassword(userId, salt, hash) { await db.query('UPDATE users SET password_salt=?,password_hash=? WHERE id=?', [salt, hash, userId]); },
    async deleteSessions(userId) { await db.query('DELETE FROM sessions WHERE user_id=?', [userId]); },
    transaction: transactionRunner,
  };
}

export function mariadbStore(pool) {
  const run = async (fn) => {
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      const result = await fn(storeFor(conn, (inner) => inner(storeFor(conn, null))));
      await conn.commit();
      return result;
    } catch (error) { await conn.rollback(); throw error; } finally { conn.release(); }
  };
  return storeFor(pool, run);
}
