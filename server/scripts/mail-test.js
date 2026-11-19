// Sends one test message through the configured mail transport so you can prove delivery.
//   npm.cmd run mail:test -- you@example.com
// Success is reported ONLY when the SMTP server accepted the message for that address.
import 'dotenv/config';
import { createMailer } from '../src/mail.js';
const to = process.argv[2];
if (!to || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) { console.error('Usage: npm.cmd run mail:test -- you@example.com'); process.exit(1); }
try {
  const mailer = createMailer(process.env);
  console.log(`Mail transport: ${mailer.mode}`);
  const result = await mailer.send({ to, subject: 'LouDent mail test', text: 'If you can read this, LouDent can send email through your SMTP provider.', html: '<p>If you can read this, LouDent can send email through your SMTP provider.</p>' });
  if (result.mode === 'smtp') console.log(result.delivered ? `ACCEPTED by the SMTP server for ${to}. Check the inbox (and spam).` : `The SMTP server did NOT accept ${to}.`);
  else console.log(result.mode === 'preview' ? 'Preview mode: nothing was sent (development only). Set MAIL_TRANSPORT=smtp in server/.env to send real email.' : 'MAIL_TRANSPORT is "none": nothing was sent.');
  process.exitCode = result.mode === 'smtp' && !result.delivered ? 2 : 0;
} catch (error) { console.error(`Mail test failed: ${String(error.message).split('\n')[0]}`); process.exitCode = 1; }
