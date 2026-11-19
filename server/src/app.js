import express from 'express';
import pool from './db.js';
import {createMailer} from './mail.js';
import {createRecoveryService,mariadbStore} from './recovery.js';
import {id,fail,clean,validEmail,hashPassword,comparePassword,hashToken,newToken,parseCookies,dateValid,weekday,minutes,sqlTime,prettyTime,scheduleValid,inSchedule,overlap,isFuture,manilaNow,DAYS,SLOTS,validatePhoto,parseAdminDentistIds,isClinicAdmin,canManageAppointment,safeErrorSummary} from './core.js';
const adminIds=()=>parseAdminDentistIds(process.env.CLINIC_ADMIN_DENTIST_IDS);
export const mailer=createMailer(process.env);
function appBaseUrl(){
 const raw=(process.env.APP_BASE_URL||process.env.FRONTEND_ORIGIN||'http://localhost:5173').replace(/\/+$/,'');
 let u;try{u=new URL(raw);}catch{throw new Error('APP_BASE_URL / FRONTEND_ORIGIN must be a full URL such as http://localhost:5173');}
 if(!['http:','https:'].includes(u.protocol))throw new Error('APP_BASE_URL must start with http:// or https://');
 if(process.env.NODE_ENV==='production'&&u.protocol!=='https:')throw new Error('APP_BASE_URL must use https:// when NODE_ENV=production');
 return u.origin;
}
export const recovery=createRecoveryService({store:mariadbStore(pool),mailer,baseUrl:appBaseUrl(),ipLimitScale:Number(process.env.AUTH_RATE_LIMIT_IP_SCALE||1)});

export const app=express();
app.disable('x-powered-by');
app.use((req,res,next)=>{req.requestId=id().slice(0,8);res.set('X-Request-Id',req.requestId);next();});
app.use(express.json({limit:'450kb'}));
app.use((req,res,next)=>{if(!req.body||typeof req.body!=='object'||Array.isArray(req.body))req.body={};next();});
const wrap=fn=>(req,res,next)=>Promise.resolve(fn(req,res,next)).catch(next);
const allowOrigin=req=>{
 const origin=req.get('origin'); if(!origin)return true;
 const configured=process.env.FRONTEND_ORIGIN||'http://localhost:5173';
 return origin===configured || (process.env.NODE_ENV!=='production' && /^http:\/\/(localhost|127\.0\.0\.1):\d{2,5}$/.test(origin));
};
app.use('/api',(req,res,next)=>{
 if(!allowOrigin(req))return res.status(403).json({error:'Origin is not allowed'});
 const origin=req.get('origin');if(origin){res.set('Access-Control-Allow-Origin',origin);res.set('Vary','Origin');res.set('Access-Control-Allow-Credentials','true');res.set('Access-Control-Allow-Headers','Content-Type');res.set('Access-Control-Allow-Methods','GET,POST,PUT,PATCH,DELETE,OPTIONS');}
 if(req.method==='OPTIONS')return res.sendStatus(204);
 next();
});
function cookie(token,erase=false){return `ld_session=${token||''}; Path=/api; HttpOnly; SameSite=Lax; ${process.env.NODE_ENV==='production'?'Secure; ':''}${erase?'Max-Age=0':'Max-Age=604800'}`;}
async function session(req,res,next){
 try{
  const token=parseCookies(req.get('cookie')||'').ld_session;
  if(token){const rows=await pool.query("SELECT u.id,u.role,u.dentist_id AS dentistId,u.full_name AS name,u.email,u.phone,(u.email_verified_at IS NOT NULL) AS emailVerified,CASE WHEN u.role='dentist' THEN d.photo_url ELSE u.photo_data_url END AS photoDataUrl FROM sessions s JOIN users u ON u.id=s.user_id LEFT JOIN dentists d ON d.id=u.dentist_id WHERE s.token_hash=? AND s.expires_at>UTC_TIMESTAMP()",[hashToken(token)]);req.user=rows[0]||null;}
  next();
 }catch(e){next(e)}
}
app.use('/api',session);
const requireAuth=(req,res,next)=>req.user?next():res.status(401).json({error:'Please log in.'});
const role=(name)=>(req,res,next)=>req.user?.role===name?next():res.status(403).json({error:'Insufficient permissions'});
function userShape(u){return {id:u.id,role:u.role,dentistId:u.dentistId||null,isClinicAdmin:isClinicAdmin(u,adminIds()),name:u.name,email:u.email,phone:u.phone||'',emailVerified:Boolean(u.emailVerified),photoDataUrl:u.photoDataUrl||null};}
function requireDentistSelf(req){if(req.user.role!=='dentist'||req.user.dentistId!==req.params.id)throw fail(403,'You may only edit your own dentist schedule/profile.');}
function validBookingInput({serviceId,dentistId,date,time}){
 if(!clean(serviceId,80)||!clean(dentistId,40)||!dateValid(date)||!SLOTS.includes(time))throw fail(400,'Select a valid service, dentist, date and time.');
 if(!isFuture(date,time))throw fail(400,'Please select a future appointment date and time.');
}
async function getSchedule(client,dentistId){
 const days=await client.query('SELECT day_of_week AS dayIndex,available,start_time AS start,end_time AS end,break_start AS breakStart,break_end AS breakEnd FROM weekly_availability WHERE dentist_id=? ORDER BY day_of_week',[dentistId]);
 const dates=await client.query("SELECT DATE_FORMAT(block_date,'%Y-%m-%d') AS date FROM blocked_dates WHERE dentist_id=? ORDER BY block_date",[dentistId]);
 return {days:days.map(d=>({day:DAYS[d.dayIndex],available:!!d.available,start:prettyTime(d.start),end:prettyTime(d.end),breakStart:d.breakStart?prettyTime(d.breakStart):null,breakEnd:d.breakEnd?prettyTime(d.breakEnd):null})),blockedDates:dates.map(d=>d.date)};
}
const appointmentSelect="SELECT a.id,a.reference,a.patient_id AS patientId,u.full_name AS patientName,a.dentist_id AS dentistId,d.name AS dentistName,a.service_id AS serviceId,s.name AS serviceName,DATE_FORMAT(a.appointment_date,'%Y-%m-%d') AS date,TIME_FORMAT(a.start_time,'%H:%i:%s') AS time,a.duration_minutes AS duration,a.price,a.status,a.decline_reason AS declineReason,a.created_at AS createdAt FROM appointments a JOIN users u ON u.id=a.patient_id JOIN dentists d ON d.id=a.dentist_id JOIN services s ON s.id=a.service_id";
function appointmentShape(a){return {...a,time:prettyTime(a.time),price:Number(a.price),declineReason:a.declineReason||null};}
async function loadAppointment(client,uid){const rows=await client.query(appointmentSelect+' WHERE a.id=?',[uid]);return rows[0]?appointmentShape(rows[0]):null;}
async function findServiceAndDentist(conn,serviceId,dentistId){
 const services=await conn.query('SELECT id,name,duration_minutes AS duration,price FROM services WHERE id=?',[serviceId]);
 if(!services.length)throw fail(404,'Dental service was not found.');
 const eligible=await conn.query('SELECT dentist_id FROM dentist_services WHERE dentist_id=? AND service_id=?',[dentistId,serviceId]);
 if(!eligible.length)throw fail(400,'This dentist does not provide the selected service.');
 return services[0];
}
async function assertSlot(conn,{serviceId,dentistId,date,time,excludeId=null}){
 validBookingInput({serviceId,dentistId,date,time});
 // All booking/reschedule writers lock the same dentist row: concurrent requests for a
 // single dentist are serialized before availability and overlap checks.
 const lock=await conn.query('SELECT id FROM dentists WHERE id=? FOR UPDATE',[dentistId]);
 if(!lock.length)throw fail(404,'Dentist not found.');
 const service=await findServiceAndDentist(conn,serviceId,dentistId);
 const day=weekday(date),start=minutes(time);
 const days=await conn.query('SELECT available,start_time AS start,end_time AS end,break_start AS breakStart,break_end AS breakEnd FROM weekly_availability WHERE dentist_id=? AND day_of_week=? FOR UPDATE',[dentistId,day]);
 const a=days[0];
 if(!a||!inSchedule({available:!!a.available,start:a.start,end:a.end,breakStart:a.breakStart,breakEnd:a.breakEnd},start,service.duration))throw fail(409,'The selected time is outside the dentist’s working schedule.');
 const blocked=await conn.query('SELECT dentist_id FROM blocked_dates WHERE dentist_id=? AND block_date=? FOR UPDATE',[dentistId,date]);
 if(blocked.length)throw fail(409,'The dentist is unavailable on this date.');
 const active=await conn.query("SELECT id,start_time AS time,duration_minutes AS duration FROM appointments WHERE dentist_id=? AND appointment_date=? AND status IN ('Pending','Confirmed') FOR UPDATE",[dentistId,date]);
 if(active.some(row=>row.id!==excludeId&&overlap(start,service.duration,minutes(row.time),row.duration)))throw fail(409,'This time is already reserved. Choose another slot.');
 return service;
}
async function transaction(fn){const conn=await pool.getConnection();try{await conn.beginTransaction();const result=await fn(conn);await conn.commit();return result;}catch(e){await conn.rollback();throw e;}finally{conn.release();}}

app.get('/api/health',wrap(async(req,res)=>{await pool.query('SELECT 1 AS ok');res.json({status:'ok',database:'connected'});}));
app.post('/api/auth/register',wrap(async(req,res)=>{
 // Patients only. The role is never read from the request.
 res.status(201).json(await recovery.registerPatient(req.body,{ip:req.ip}));
}));
app.post('/api/auth/verify-email',wrap(async(req,res)=>{res.json(await recovery.verifyEmail(req.body.token,{ip:req.ip}));}));
app.post('/api/auth/resend-verification',wrap(async(req,res)=>{res.json(await recovery.resendVerification(req.body.email,{ip:req.ip}));}));
app.post('/api/auth/forgot-password',wrap(async(req,res)=>{res.json(await recovery.requestPasswordReset(req.body.email,{ip:req.ip}));}));
app.post('/api/auth/reset-password',wrap(async(req,res)=>{res.json(await recovery.resetPassword(req.body.token,req.body.password,{ip:req.ip}));}));
app.get('/api/auth/mail-mode',(req,res)=>{res.json({mode:recovery.mailMode()});});
// Development-only: shows what WOULD have been emailed. Absent unless MAIL_TRANSPORT=preview, and loopback only.
app.get('/api/dev/mail-preview',(req,res)=>{
 const loopback=['127.0.0.1','::1','::ffff:127.0.0.1'].includes(req.ip);
 if(recovery.mailMode()!=='preview'||!loopback)return res.status(404).json({error:'Not found'});
 res.json(mailer.previewFor(clean(req.query.to,254)).map(m=>({subject:m.subject,links:m.links,at:m.at})));
});
const failedLogins=new Map();
const LOGIN_LIMIT=8,LOGIN_WINDOW_MS=15*60*1000;
function loginKey(req,email){return `${req.ip}|${email}`;}
function loginBlocked(key){const e=failedLogins.get(key);if(!e)return false;if(Date.now()-e.first>LOGIN_WINDOW_MS){failedLogins.delete(key);return false;}return e.count>=LOGIN_LIMIT;}
function loginFailed(key){const e=failedLogins.get(key);if(!e||Date.now()-e.first>LOGIN_WINDOW_MS)failedLogins.set(key,{first:Date.now(),count:1});else e.count++;}
app.post('/api/auth/login',wrap(async(req,res)=>{
 const email=clean(req.body.email,254).toLowerCase(),password=req.body.password;
 if(!validEmail(email)||typeof password!=='string'||password.length>128)throw fail(400,'Enter a valid email and password.');
 const key=loginKey(req,email);if(loginBlocked(key))throw fail(429,'Too many failed attempts. Please wait a few minutes and try again.');
 const rows=await pool.query('SELECT u.id,u.role,u.dentist_id AS dentistId,u.full_name AS name,u.email,u.phone,(u.email_verified_at IS NOT NULL) AS emailVerified,CASE WHEN u.role=\'dentist\' THEN d.photo_url ELSE u.photo_data_url END AS photoDataUrl,u.password_salt,u.password_hash FROM users u LEFT JOIN dentists d ON d.id=u.dentist_id WHERE u.email=?',[email]);
 const u=rows[0];if(!u || !(await comparePassword(password,u.password_salt,u.password_hash))){loginFailed(key);throw fail(401,'Incorrect email or password.');}
 failedLogins.delete(key);
 await pool.query('DELETE FROM sessions WHERE expires_at<=UTC_TIMESTAMP()');
 const token=newToken(),expires=new Date(Date.now()+7*86400000);
 await pool.query('INSERT INTO sessions (token_hash,user_id,expires_at) VALUES (?,?,?)',[hashToken(token),u.id,expires.toISOString().slice(0,19).replace('T',' ')]);
 res.setHeader('Set-Cookie',cookie(token));res.json({user:userShape(u)});
}));
app.post('/api/auth/logout',requireAuth,wrap(async(req,res)=>{const token=parseCookies(req.get('cookie')||'').ld_session;if(token)await pool.query('DELETE FROM sessions WHERE token_hash=?',[hashToken(token)]);res.setHeader('Set-Cookie',cookie('',true));res.json({ok:true});}));
app.get('/api/auth/me',requireAuth,(req,res)=>res.json({user:userShape(req.user)}));
app.patch('/api/me',requireAuth,wrap(async(req,res)=>{
 const name=clean(req.body.name,150),phone=clean(req.body.phone,40);
 if(!name)throw fail(400,'Name cannot be blank.');
 await pool.query('UPDATE users SET full_name=?,phone=? WHERE id=?',[name,phone,req.user.id]);res.json({ok:true,name,phone});
}));
app.put('/api/me/photo',requireAuth,wrap(async(req,res)=>{
 const photo=validatePhoto(req.body.dataUrl);
 // A dentist's picture belongs to the dentist PROFILE (so it survives staff account re-creation);
 // a patient's belongs to the user row. Removing sets NULL, which restores initials.
 if(req.user.role==='dentist'&&req.user.dentistId)await pool.query('UPDATE dentists SET photo_url=? WHERE id=?',[photo,req.user.dentistId]);
 else await pool.query('UPDATE users SET photo_data_url=? WHERE id=?',[photo,req.user.id]);
 res.json({ok:true,photoDataUrl:photo});
}));
app.get('/api/services',wrap(async(req,res)=>{
 const data=await pool.query('SELECT id,name,category,duration_minutes AS duration,price,icon,description,preparation,involves_json FROM services ORDER BY name');
 res.json(data.map(row=>({id:row.id,name:row.name,category:row.category,duration:row.duration,price:Number(row.price),icon:row.icon,description:row.description,preparation:row.preparation,involves:JSON.parse(row.involves_json||'[]')})));
}));
app.get('/api/dentists',wrap(async(req,res)=>{
 const data=await pool.query('SELECT d.id,d.name,d.title,d.specialty,d.experience_years AS experience,d.bio,d.photo_url AS photo FROM dentists d ORDER BY d.name');
 const links=await pool.query('SELECT ds.dentist_id AS dentistId,s.name FROM dentist_services ds JOIN services s ON s.id=ds.service_id');
 const profiles=[];for(const d of data){const avail=await getSchedule(pool,d.id);profiles.push({id:d.id,name:d.name,title:d.title,specialty:d.specialty,experience:d.experience,bio:d.bio,photo:d.photo||null,services:links.filter(x=>x.dentistId===d.id).map(x=>x.name),availableDays:avail.days.filter(x=>x.available).map(x=>x.day),hours:'See weekly availability',nextAvailable:'See live availability'});}res.json(profiles);
}));
app.get('/api/dentists/:id/schedule',wrap(async(req,res)=>{
 const dentist=await pool.query('SELECT id FROM dentists WHERE id=?',[req.params.id]);if(!dentist.length)throw fail(404,'Dentist not found.');res.json(await getSchedule(pool,req.params.id));
}));
app.get('/api/appointments',requireAuth,wrap(async(req,res)=>{
 // Patients: their own. Clinic administrator: every appointment. Other dentists: only those assigned to them.
 const scope=req.user.role==='patient'?{sql:' WHERE a.patient_id=?',args:[req.user.id]}:isClinicAdmin(req.user,adminIds())?{sql:'',args:[]}:{sql:' WHERE a.dentist_id=?',args:[req.user.dentistId]};
 const rows=await pool.query(appointmentSelect+scope.sql+' ORDER BY a.appointment_date DESC,a.start_time DESC',scope.args);
 res.json(rows.map(appointmentShape));
}));
app.get('/api/appointments/:id',requireAuth,wrap(async(req,res)=>{
 const a=await loadAppointment(pool,req.params.id);if(!a||req.user.role==='patient'&&a.patientId!==req.user.id||req.user.role==='dentist'&&!canManageAppointment(req.user,a,adminIds()))throw fail(404,'Appointment not found.');res.json(a);
}));
app.get('/api/slots',wrap(async(req,res)=>{
 const {dentistId,serviceId,date}=req.query;
 if(!clean(serviceId,80)||!clean(dentistId,40)||!dateValid(date)||date<manilaNow().date)throw fail(400,'Select a valid dentist, service and current or future date.');
 const service=await findServiceAndDentist(pool,serviceId,dentistId),schedule=await getSchedule(pool,dentistId);
 const day=schedule.days[weekday(date)];
 // Rescheduling: the patient's own appointment must not block its own slot. Only honoured for its owner.
 let excludeId=null;const wanted=clean(req.query.excludeAppointmentId,40);
 if(wanted&&req.user?.role==='patient'){const own=await pool.query('SELECT id FROM appointments WHERE id=? AND patient_id=?',[wanted,req.user.id]);if(own.length)excludeId=wanted;}
 const active=(await pool.query("SELECT id,start_time AS time,duration_minutes AS duration FROM appointments WHERE dentist_id=? AND appointment_date=? AND status IN ('Pending','Confirmed')",[dentistId,date])).filter(x=>x.id!==excludeId);
 res.json(SLOTS.map(time=>({time,available:isFuture(date,time)&&!schedule.blockedDates.includes(date)&&inSchedule(day,minutes(time),service.duration)&&!active.some(x=>overlap(minutes(time),service.duration,minutes(x.time),x.duration))})));
}));
app.post('/api/appointments',requireAuth,role('patient'),wrap(async(req,res)=>{
 if(!req.user.emailVerified){const e=fail(403,'Please verify your email address before booking an appointment. Check your inbox for the verification link.');e.code='EMAIL_NOT_VERIFIED';throw e;}
 const {serviceId,dentistId,date,time}=req.body;
 const result=await transaction(async conn=>{
  const service=await assertSlot(conn,{serviceId,dentistId,date,time});
  const appointmentId=id(),reference=`LD-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2,6).toUpperCase()}`;
  await conn.query('INSERT INTO appointments (id,reference,patient_id,dentist_id,service_id,appointment_date,start_time,duration_minutes,price) VALUES (?,?,?,?,?,?,?,?,?)',[appointmentId,reference,req.user.id,dentistId,serviceId,date,sqlTime(time),service.duration,service.price]);
  return loadAppointment(conn,appointmentId);
 });res.status(201).json(result);
}));
app.post('/api/appointments/:id/reschedule',requireAuth,role('patient'),wrap(async(req,res)=>{
 const {serviceId,dentistId,date,time}=req.body;
 const result=await transaction(async conn=>{
  await conn.query('SELECT id FROM appointments WHERE id=? FOR UPDATE',[req.params.id]);
  const old=await loadAppointment(conn,req.params.id);
  if(!old||old.patientId!==req.user.id)throw fail(404,'Appointment not found.');
  if(!['Pending','Confirmed'].includes(old.status))throw fail(409,'Only active appointments can be rescheduled.');
  const service=await assertSlot(conn,{serviceId,dentistId,date,time,excludeId:old.id});
  await conn.query("UPDATE appointments SET dentist_id=?,service_id=?,appointment_date=?,start_time=?,duration_minutes=?,price=?,status='Pending',decline_reason=NULL WHERE id=?",[dentistId,serviceId,date,sqlTime(time),service.duration,service.price,old.id]);
  return loadAppointment(conn,old.id);
 });res.json(result);
}));
app.post('/api/appointments/:id/cancel',requireAuth,wrap(async(req,res)=>{
 const result=await transaction(async conn=>{
  await conn.query('SELECT id FROM appointments WHERE id=? FOR UPDATE',[req.params.id]);
  const old=await loadAppointment(conn,req.params.id);
  if(!old||req.user.role==='patient'&&old.patientId!==req.user.id)throw fail(404,'Appointment not found.');
  if(req.user.role==='dentist'&&!canManageAppointment(req.user,old,adminIds()))throw fail(403,'You may only manage your own appointments.');
  if(!['Pending','Confirmed'].includes(old.status))throw fail(409,'This appointment cannot be cancelled.');
  await conn.query("UPDATE appointments SET status='Cancelled' WHERE id=?",[old.id]);return loadAppointment(conn,old.id);
 });res.json(result);
}));
app.patch('/api/appointments/:id/status',requireAuth,role('dentist'),wrap(async(req,res)=>{
 const {status}=req.body,reason=clean(req.body.declineReason,500);
 const result=await transaction(async conn=>{
  await conn.query('SELECT id FROM appointments WHERE id=? FOR UPDATE',[req.params.id]);
  const old=await loadAppointment(conn,req.params.id);if(!old)throw fail(404,'Appointment not found.');
  if(!canManageAppointment(req.user,old,adminIds()))throw fail(403,'Only the assigned dentist or the clinic administrator can manage this appointment.');
  const allowed={Pending:['Confirmed','Declined'],Confirmed:['Completed','Cancelled']};
  if(!allowed[old.status]?.includes(status))throw fail(409,'Invalid appointment status transition.');
  if(status==='Completed'&&isFuture(old.date,old.time))throw fail(409,'Cannot complete an appointment scheduled in the future.');
  await conn.query('UPDATE appointments SET status=?,decline_reason=? WHERE id=?',[status,status==='Declined'?reason:null,old.id]);return loadAppointment(conn,old.id);
 });res.json(result);
}));
app.put('/api/dentists/:id/schedule',requireAuth,wrap(async(req,res)=>{
 requireDentistSelf(req);
 const days=req.body.days;
 if(!Array.isArray(days)||days.length!==7||new Set(days.map(x=>x.day)).size!==7||!DAYS.every(day=>days.some(d=>d.day===day))||days.some(d=>!scheduleValid(d)))throw fail(400,'Provide seven valid working-day schedules and break ranges.');
 const result=await transaction(async conn=>{
  await conn.query('SELECT id FROM dentists WHERE id=? FOR UPDATE',[req.params.id]);
  const upcoming=await conn.query("SELECT DATE_FORMAT(appointment_date,'%Y-%m-%d') AS date,start_time AS time,duration_minutes AS duration FROM appointments WHERE dentist_id=? AND status IN ('Pending','Confirmed') AND appointment_date>=?",[req.params.id,manilaNow().date]);
  for(const a of upcoming){const schedule=days.find(x=>x.day===DAYS[weekday(a.date)]);if(!inSchedule(schedule,minutes(a.time),a.duration))throw fail(409,`An existing appointment on ${a.date} conflicts with the proposed hours. Reschedule it first.`);}
  for(const [i,dayName] of DAYS.entries()){
   const d=days.find(x=>x.day===dayName);
   await conn.query('INSERT INTO weekly_availability (dentist_id,day_of_week,available,start_time,end_time,break_start,break_end) VALUES (?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE available=VALUES(available),start_time=VALUES(start_time),end_time=VALUES(end_time),break_start=VALUES(break_start),break_end=VALUES(break_end)',[req.params.id,i,!!d.available,sqlTime(d.start||'9:00 AM'),sqlTime(d.end||'5:00 PM'),d.breakStart?sqlTime(d.breakStart):null,d.breakEnd?sqlTime(d.breakEnd):null]);
  }
  return getSchedule(conn,req.params.id);
 });res.json(result);
}));
app.post('/api/dentists/:id/blocked-dates',requireAuth,wrap(async(req,res)=>{
 requireDentistSelf(req);const {date}=req.body;if(!dateValid(date))throw fail(400,'Invalid date.');
 await transaction(async conn=>{
  await conn.query('SELECT id FROM dentists WHERE id=? FOR UPDATE',[req.params.id]);
  const bookings=await conn.query("SELECT id FROM appointments WHERE dentist_id=? AND appointment_date=? AND status IN ('Pending','Confirmed')",[req.params.id,date]);
  if(bookings.length)throw fail(409,'This date has active appointments. Resolve them first.');
  await conn.query('INSERT IGNORE INTO blocked_dates (dentist_id,block_date) VALUES (?,?)',[req.params.id,date]);
 });res.json({ok:true,date});
}));
app.delete('/api/dentists/:id/blocked-dates/:date',requireAuth,wrap(async(req,res)=>{
 requireDentistSelf(req);if(!dateValid(req.params.date))throw fail(400,'Invalid date.');await pool.query('DELETE FROM blocked_dates WHERE dentist_id=? AND block_date=?',[req.params.id,req.params.date]);res.json({ok:true});
}));
app.patch('/api/dentists/:id/profile',requireAuth,wrap(async(req,res)=>{
 requireDentistSelf(req);
 const name=clean(req.body.name,150),specialty=clean(req.body.specialty,160),bio=clean(req.body.bio,4000),title=clean(req.body.title,80);
 if(!name||!specialty)throw fail(400,'Dentist name and specialty are required.');
 const experience=req.body.experience===undefined?null:Number(req.body.experience);
 if(experience!==null&&(!Number.isInteger(experience)||experience<0||experience>80))throw fail(400,'Experience must be a whole number of years.');
 await transaction(async conn=>{
  await conn.query('UPDATE dentists SET name=?,specialty=?,bio=?,title=?,experience_years=COALESCE(?,experience_years) WHERE id=?',[name,specialty,bio,title,experience,req.params.id]);
  await conn.query('UPDATE users SET full_name=? WHERE id=?',[name,req.user.id]);
 });res.json({ok:true});
}));
app.use('/api',(req,res)=>res.status(404).json({error:'API endpoint not found'}));
app.use((error,req,res,next)=>{
 const status=error.status||(error.code==='ER_DUP_ENTRY'?409:500);
 if(status>=500){
  // Never log error.message/error.sql directly: the driver appends SQL parameters (emails, hashes).
  console.error(`API error [${req.requestId}] ${req.method} ${req.path} -> ${error.code||error.name||'Error'}${error.errno?` errno=${error.errno}`:''}${error.sqlState?` sqlState=${error.sqlState}`:''}: ${safeErrorSummary(error)}`);
 }
 if(error.retryAfterSeconds)res.set('Retry-After',String(error.retryAfterSeconds));
 const body={error:status>=500?'The server hit an unexpected problem. Please try again in a moment.':error.message};
 if(error.code&&status<500&&typeof error.code==='string'&&/^[A-Z_]+$/.test(error.code))body.code=error.code;
 if(status>=500)body.requestId=req.requestId;
 res.status(status).json(body);
});
