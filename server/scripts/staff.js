// Local staff-login administration. NOT reachable through the web API.
//   npm.cmd run staff -- provision [--santos-email=a@b.c] [--reyes-email=c@d.e]
//   npm.cmd run staff -- reset-password santos|reyes [--prompt]
//   npm.cmd run staff -- set-email santos|reyes new@address
//   npm.cmd run staff -- list
// Passwords are shown ONCE in this terminal and are never written to a file or the database in plain text.
import pool from '../src/db.js';
import { parseAdminDentistIds, passwordProblem } from '../src/core.js';
import { provisionStaff, resetStaffPassword, setStaffEmail, listStaff, isDevOnlyAddress } from '../src/staff-lib.js';
import { missingSchema } from '../src/maintenance.js';

const [command, ...rest] = process.argv.slice(2);
const flags = Object.fromEntries(rest.filter((a) => a.startsWith('--')).map((a) => { const [k, ...v] = a.slice(2).split('='); return [k, v.length ? v.join('=') : true]; }));
const positional = rest.filter((a) => !a.startsWith('--'));

function promptHidden(question) {
  return new Promise((resolve) => {
    process.stdout.write(question);
    const stdin = process.stdin; stdin.setRawMode?.(true); stdin.resume(); let buffer = '';
    const onData = (chunk) => {
      const ch = chunk.toString();
      if (ch === '\r' || ch === '\n' || ch === '\u0004') { stdin.setRawMode?.(false); stdin.pause(); stdin.removeListener('data', onData); process.stdout.write('\n'); resolve(buffer); }
      else if (ch === '\u0003') process.exit(130);
      else if (ch === '\u007f' || ch === '\b') buffer = buffer.slice(0, -1);
      else buffer += ch;
    };
    stdin.on('data', onData);
  });
}
const banner = (title) => console.log(`\n${'='.repeat(64)}\n${title}\n${'='.repeat(64)}`);
const warnOnce = '  Save this password privately NOW. It is shown only once and cannot be recovered.\n  Change it after your first login if you wish (npm run staff -- reset-password <id> --prompt).';

try {
  console.log(`Database: ${process.env.DB_NAME || 'loudent'} on ${process.env.DB_HOST || '127.0.0.1'}`);
  const missing = await missingSchema(pool);
  if (missing.length) throw new Error(`Database is not up to date (missing: ${missing.join(', ')}). Run: npm.cmd run migrate`);
  const adminIds = parseAdminDentistIds(process.env.CLINIC_ADMIN_DENTIST_IDS);
  if (command === 'provision') {
    const results = await provisionStaff(pool, { emails: { santos: flags['santos-email'], reyes: flags['reyes-email'] } });
    for (const r of results) {
      banner(`${r.dentistId === 'santos' ? 'Dr. Maria Santos' : 'Dr. Adrian Reyes'} (${r.dentistId})`);
      if (!r.created) { console.log(`  Login already exists: ${r.email}\n  Password NOT changed. (To reset: npm run staff -- reset-password ${r.dentistId})`); continue; }
      console.log(`  Login email : ${r.email}${isDevOnlyAddress(r.email) ? '   <- development address: it does NOT receive real email' : ''}`);
      console.log(`  Password    : ${r.password}`);
      console.log(`  Permissions : ${adminIds.includes(r.dentistId) ? 'clinic administrator (all appointments)' : 'own appointments only'}`);
      console.log(warnOnce);
    }
    console.log('\nAccount list:'); console.table(await listStaff(pool, adminIds));
  } else if (command === 'reset-password') {
    const [dentistId] = positional; let password;
    if (flags.prompt) {
      password = await promptHidden('New password (hidden): ');
      const again = await promptHidden('Repeat password (hidden): ');
      if (password !== again) throw new Error('The two entries did not match; nothing changed.');
      const problem = passwordProblem(password); if (problem) throw new Error(problem);
    }
    const r = await resetStaffPassword(pool, dentistId, password ? { password } : undefined);
    banner(`Password reset for ${dentistId}`);
    console.log(`  Login email : ${r.email}`);
    if (!flags.prompt) { console.log(`  New password: ${r.password}`); console.log(warnOnce); } else console.log('  The password you typed is now active (it was not displayed).');
    console.log('  All existing sessions for this account were signed out.');
  } else if (command === 'set-email') {
    const [dentistId, email] = positional; const r = await setStaffEmail(pool, dentistId, email);
    console.log(`Login email for ${dentistId} is now ${r.email}.${r.devOnly ? '\n  Note: this looks like a development address; it will not receive real email.' : ''}`);
  } else if (command === 'list') {
    console.table(await listStaff(pool, adminIds));
  } else {
    console.log('Usage:\n  npm.cmd run staff -- provision [--santos-email=…] [--reyes-email=…]\n  npm.cmd run staff -- reset-password santos|reyes [--prompt]\n  npm.cmd run staff -- set-email santos|reyes new@address\n  npm.cmd run staff -- list');
    process.exitCode = command ? 1 : 0;
  }
} catch (error) {
  console.error(`\nStopped: ${String(error.text || error.message).split('\n')[0]}`);
  process.exitCode = 1;
} finally { await pool.end(); }
