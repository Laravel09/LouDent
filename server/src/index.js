import 'dotenv/config';
import pool from './db.js';
import {app,mailer} from './app.js';
import {missingSchema} from './maintenance.js';
const port=Number(process.env.PORT||3001);
// Fail fast with instructions instead of answering every request with a 500 when a migration is pending.
try{
 const missing=await missingSchema(pool);
 if(missing.length){
  console.error(`\nThe database is not up to date. Missing: ${missing.join(', ')}.\nRun this once, then start the API again:\n    npm.cmd run migrate\n`);
  process.exit(1);
 }
}catch(error){
 console.error(`\nCannot check the database (${error.code||error.name}). Is MariaDB running and server/.env correct?\nRun "npm.cmd run diagnose" for details.\n`);
 process.exit(1);
}
try{
 const [{n}]=await pool.query("SELECT COUNT(*) AS n FROM users WHERE email LIKE '%@loudent.demo'");
 if(Number(n)>0)console.warn(`\nNOTE: ${n} old demo account(s) (@loudent.demo) still exist with publicly known passwords.\nRemove them with the approved cleanup in ACCOUNT_SETUP_AND_RECOVERY.md (backup first).\n`);
}catch{/* informational only */}
app.listen(port,'127.0.0.1',()=>{
 console.log(`LouDent API running at http://localhost:${port}/api/health`);
 console.log(mailer.mode==='preview'?'Mail: PREVIEW mode (development only) - no real email is sent; messages are shown here and in the dev preview panel.':mailer.mode==='smtp'?'Mail: SMTP delivery is enabled.':'Mail: not configured (MAIL_TRANSPORT=none) - password reset / verification emails are NOT sent.');
});
