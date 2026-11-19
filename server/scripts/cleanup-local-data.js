// LOCAL DEVELOPMENT DATA CLEANUP (destructive). Authorized target: local database "loudent" ONLY.
//   npm.cmd run cleanup:local -- --dry-run                       (default; changes nothing)
//   npm.cmd run cleanup:local -- --execute --backup-file="C:\Users\You\LouDentBackups\loudent-….sql"
// Deletes: ALL patients, ALL appointments, ALL dentist login accounts, sessions, email/reset tokens.
// Keeps:   dentist profiles + pictures, services/prices, dentist-service links, weekly hours, blocked dates.
// It is never run by npm install, npm run dev, npm run seed or API start-up.
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline/promises';
import { fileURLToPath } from 'node:url';
import pool from '../src/db.js';
import { assertLocalDevTarget, planCleanup, runCleanup, verifyBackupFile, missingSchema, formatCleanupReport, CONFIRMATION_PHRASE, PRESERVED_TABLES, CLEARED_TABLES } from '../src/maintenance.js';

const args = process.argv.slice(2);
const flag = (name) => { const hit = args.find((a) => a === `--${name}` || a.startsWith(`--${name}=`)); return hit === undefined ? undefined : (hit.includes('=') ? hit.slice(hit.indexOf('=') + 1) : true); };
const execute = flag('execute') === true;

try {
  const target = assertLocalDevTarget(process.env);
  console.log(`\nTarget : ${target.host}:${target.port}  database "${target.database}"  (NODE_ENV=${target.nodeEnv})`);
  const missing = await missingSchema(pool, target.database);
  if (missing.length) throw new Error(`The database schema is not up to date (missing: ${missing.join(', ')}). Run "npm.cmd run migrate" first.`);
  const plan = await planCleanup(pool);

  console.log('\nWould DELETE:');
  for (const t of CLEARED_TABLES) console.log(`  ${t.padEnd(14)} ${String(plan.counts[t]).padStart(6)} row(s)${t === 'users' ? `   (${plan.patients} patient(s), ${plan.dentistLogins} dentist login(s))` : ''}`);
  console.log('Would KEEP (not touched):');
  for (const t of PRESERVED_TABLES) console.log(`  ${t.padEnd(20)} ${String(plan.counts[t]).padStart(6)} row(s)`);
  if (plan.legacyPhotos > 0) console.log(`\n!! ${plan.legacyPhotos} dentist login(s) still hold a picture on the login row. Run "npm.cmd run migrate" before cleaning.`);

  if (!execute) { console.log('\nDRY RUN ONLY - nothing was changed. To delete, make a backup first, then add --execute --backup-file="<path>".'); process.exit(0); }

  const backup = verifyBackupFile(flag('backup-file'), { database: target.database, tablesWithData: Object.entries(plan.counts).filter(([, n]) => n > 0).map(([t]) => t) });
  if (!backup.ok) { console.error('\nBackup NOT verified - nothing was deleted:'); for (const p of backup.problems) console.error(`  - ${p}`); process.exit(2); }
  console.log(`\nBackup verified: ${backup.bytes} bytes, saved ${backup.modifiedAt} (definitions + data present, dump completed).`);

  if (!process.stdin.isTTY) throw new Error('Confirmation must be typed in an interactive terminal.');
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const typed = (await rl.question(`\nThis permanently deletes the data listed above from "${target.database}".\nType exactly  ${CONFIRMATION_PHRASE}  to continue: `)).trim();
  rl.close();
  if (typed !== CONFIRMATION_PHRASE) { console.error('Confirmation phrase did not match. Nothing was deleted.'); process.exit(3); }

  const result = await runCleanup(pool);
  const report = formatCleanupReport({ ...result, database: target.database, host: target.host });
  console.log(`\n${report}`);
  const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'reports');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `cleanup-report-${new Date().toISOString().replace(/[:.]/g, '-')}.txt`);
  fs.writeFileSync(file, report);
  console.log(`Report saved: ${file}\nNext: npm.cmd run staff -- provision`);
} catch (error) {
  console.error(`\nStopped: ${String(error.text || error.message).split('\n')[0]}`);
  process.exitCode = 1;
} finally { await pool.end(); }
