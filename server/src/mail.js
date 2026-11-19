// Mail provider abstraction. Credentials come ONLY from private server/.env values; nothing here
// is ever sent to the browser.
//
//   MAIL_TRANSPORT=preview  development only. No email is sent. Messages are printed to the API
//                           terminal and kept in memory so the dev UI can show them. Refused when
//                           NODE_ENV=production.
//   MAIL_TRANSPORT=smtp     real delivery through your SMTP provider (Gmail SMTP with an app
//                           password, Brevo, SendGrid SMTP, Mailgun, …) using nodemailer.
//   MAIL_TRANSPORT=none     (default in production when unset) nothing is sent; requests succeed
//                           generically and the API logs that mail is not configured.
// When MAIL_TRANSPORT is unset: "preview" in development, "none" in production.

const OUTBOX_LIMIT = 50;

export function createMailer(env = process.env, { importNodemailer = () => import('nodemailer') } = {}) {
  const nodeEnv = env.NODE_ENV || 'development';
  const requested = (env.MAIL_TRANSPORT || '').trim().toLowerCase();
  const mode = requested || (nodeEnv === 'production' ? 'none' : 'preview');
  if (!['preview', 'smtp', 'none'].includes(mode)) throw new Error(`Unknown MAIL_TRANSPORT "${requested}". Use preview, smtp or none.`);
  if (mode === 'preview' && nodeEnv === 'production') {
    throw new Error('MAIL_TRANSPORT=preview is development-only and is refused when NODE_ENV=production.');
  }

  const outbox = [];
  let smtp = null;

  async function smtpTransport() {
    if (smtp) return smtp;
    const missing = ['MAIL_SMTP_HOST', 'MAIL_FROM'].filter((key) => !env[key]);
    if (missing.length) throw new Error(`SMTP is not configured (missing ${missing.join(', ')} in server/.env).`);
    const nodemailer = (await importNodemailer()).default ?? (await importNodemailer());
    const port = Number(env.MAIL_SMTP_PORT || 587);
    smtp = nodemailer.createTransport({
      host: env.MAIL_SMTP_HOST,
      port,
      secure: String(env.MAIL_SMTP_SECURE || (port === 465)).toLowerCase() === 'true',
      auth: env.MAIL_SMTP_USER ? { user: env.MAIL_SMTP_USER, pass: env.MAIL_SMTP_PASS || '' } : undefined,
    });
    return smtp;
  }

  return {
    mode,
    /** Resolves { delivered, mode }. `delivered` is true ONLY when a real SMTP server accepted the message. */
    async send({ to, subject, text, html, links = [] }) {
      if (mode === 'preview') {
        outbox.push({ to: to.toLowerCase(), subject, text, links, at: new Date().toISOString() });
        if (outbox.length > OUTBOX_LIMIT) outbox.shift();
        console.log(`\n[DEV MAIL PREVIEW - NOT SENT] to=${to}\nsubject: ${subject}\n${text}\n`);
        return { delivered: false, mode };
      }
      if (mode === 'none') {
        console.warn('[mail] MAIL_TRANSPORT is not configured; no email was sent.');
        return { delivered: false, mode };
      }
      const transport = await smtpTransport();
      const info = await transport.sendMail({ from: env.MAIL_FROM, to, subject, text, html });
      const accepted = Array.isArray(info?.accepted) && info.accepted.map((x) => String(x).toLowerCase()).includes(to.toLowerCase());
      return { delivered: accepted, mode };
    },
    /** Development preview only: the latest messages for one address (newest first). */
    previewFor(to) {
      if (mode !== 'preview') return [];
      return outbox.filter((m) => m.to === String(to).toLowerCase()).reverse();
    },
  };
}
