import { randomBytes, randomInt, randomUUID, scrypt as scryptCallback, timingSafeEqual, createHash } from 'node:crypto';
import { promisify } from 'node:util';
const scrypt = promisify(scryptCallback);
export const DAYS=['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];
export const SLOTS=['9:00 AM','10:00 AM','11:00 AM','1:00 PM','2:00 PM','3:00 PM','4:00 PM'];
export const id=()=>randomUUID();
export function fail(code,message){const e=new Error(message); e.status=code; return e;}
export function clean(v,max=150){return typeof v==='string'?v.trim().slice(0,max):'';}
export function validEmail(s){return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s) && s.length<=254;}
export async function hashPassword(password,salt=randomBytes(16).toString('hex')){
 const digest=await scrypt(password,salt,64);
 return {salt,hash:digest.toString('hex')};
}
export async function comparePassword(password,salt,hash){
 if(!salt||!hash||!/^[0-9a-f]{128}$/i.test(hash))return false;
 const got=(await scrypt(password,salt,64));return timingSafeEqual(got,Buffer.from(hash,'hex'));
}
export const hashToken=token=>createHash('sha256').update(token).digest('hex');
export const newToken=()=>randomBytes(32).toString('base64url');
export function parseCookies(header=''){
 const out={}; for(const entry of header.split(';')){const i=entry.indexOf('=');if(i>0)out[entry.slice(0,i).trim()]=entry.slice(i+1).trim();}return out;
}
export function dateValid(date){
 if(typeof date!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(date))return false;
 const parsed=new Date(date+'T00:00:00Z');return !Number.isNaN(parsed.getTime())&&parsed.toISOString().slice(0,10)===date;
}
export function weekday(date){const d=new Date(date+'T12:00:00Z');return (d.getUTCDay()+6)%7;}
export function minutes(s){
 if(typeof s!=='string')return NaN;
 const a=s.match(/^(\d{1,2}):(\d{2})\s?(AM|PM)$/i);
 if(a){const h=Number(a[1]),m=Number(a[2]);if(h<1||h>12||m>59)return NaN;return (h%12+(a[3].toUpperCase()==='PM'?12:0))*60+m;}
 const b=s.match(/^(\d{2}):(\d{2})(?::\d{2})?$/); if(b){const h=Number(b[1]),m=Number(b[2]);return h<24&&m<60?h*60+m:NaN;}
 return NaN;
}
export function sqlTime(s){const n=minutes(s);if(!Number.isFinite(n))throw fail(400,'Invalid time');return `${String(Math.floor(n/60)).padStart(2,'0')}:${String(n%60).padStart(2,'0')}:00`;}
export function prettyTime(s){const n=minutes(s);if(!Number.isFinite(n))return s;const h=Math.floor(n/60);return `${h%12||12}:${String(n%60).padStart(2,'0')} ${h<12?'AM':'PM'}`;}
export function scheduleValid(a){
 if(!a.available)return true;
 const start=minutes(a.start),end=minutes(a.end),bs=a.breakStart?minutes(a.breakStart):null,be=a.breakEnd?minutes(a.breakEnd):null;
 if(!Number.isFinite(start)||!Number.isFinite(end)||start>=end)return false;
 if((bs==null)!==(be==null))return false;
 return bs==null||(Number.isFinite(bs)&&Number.isFinite(be)&&start<=bs&&bs<be&&be<=end);
}
export function inSchedule(schedule,start,duration){
 if(!schedule||!schedule.available)return false;
 const from=minutes(schedule.start),to=minutes(schedule.end),end=start+duration;
 if(!Number.isFinite(start)||start<from||end>to)return false;
 if(schedule.breakStart&&schedule.breakEnd && start<minutes(schedule.breakEnd)&&end>minutes(schedule.breakStart))return false;
 return true;
}
export function overlap(aStart,aLength,bStart,bLength){return aStart<bStart+bLength && aStart+aLength>bStart;}
export function manilaNow(){
 const parts=new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Manila',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date());
 const o=Object.fromEntries(parts.map(x=>[x.type,x.value]));return {date:`${o.year}-${o.month}-${o.day}`,minute:Number(o.hour)*60+Number(o.minute)};
}
export function isFuture(date,time){const now=manilaNow();return date>now.date||(date===now.date&&minutes(time)>now.minute);}
export function validatePhoto(data){
 if(data===null||data==='')return null;
 if(typeof data!=='string'||data.length>350000||!/^data:image\/(png|jpeg|webp);base64,[a-zA-Z0-9+/=]+$/.test(data))throw fail(400,'Use a JPEG, PNG or WebP photo under 250 KB.');
 const content=Buffer.from(data.slice(data.indexOf(',')+1),'base64');if(content.length>256000)throw fail(400,'Photo is too large.');
 return data;
}

// ── Authorization (pure functions, unit-tested offline) ─────────────────────────────────────
// LouDent has two roles only: patient and dentist. A dentist whose dentist id is listed in
// CLINIC_ADMIN_DENTIST_IDS (default: "santos") also acts as clinic administrator.
export function parseAdminDentistIds(value){
 const raw=typeof value==='string'&&value.trim()?value:'santos';
 return raw.split(',').map(x=>x.trim()).filter(Boolean);
}
export function isClinicAdmin(user,adminIds){
 return !!user&&user.role==='dentist'&&!!user.dentistId&&Array.isArray(adminIds)&&adminIds.includes(user.dentistId);
}
// May this user confirm / decline / complete / cancel the appointment as a dentist?
// Clinic administrators: every appointment. Other dentists: only appointments assigned to them.
export function canManageAppointment(user,appointment,adminIds){
 if(!user||!appointment||user.role!=='dentist')return false;
 return isClinicAdmin(user,adminIds)||appointment.dentistId===user.dentistId;
}

// ── Registration / recovery validation (pure functions) ────────────────────────────────────────
/** Philippine phone number -> normalised "+63…" / area-code form, or null when it is not plausible. */
export function normalizePhonePH(input){
 if(typeof input!=='string')return null;
 const trimmed=input.trim();if(!trimmed||trimmed.length>25||/[^0-9+()\-.\s]/.test(trimmed))return null;
 let d=trimmed.replace(/[^0-9]/g,'');
 if(trimmed.startsWith('+')&&!d.startsWith('63'))return null;
 if(d.startsWith('63')&&d.length===12)d='0'+d.slice(2);                 // +63 9xx xxx xxxx -> 09xx xxx xxxx
 if(/^09\d{9}$/.test(d))return '+63'+d.slice(1);                          // mobile
 if(/^0(2\d{8}|[3-8]\d{1}\d{7})$/.test(d)||/^0[3-8]\d{2}\d{7}$/.test(d))return d; // landline with area code
 return null;
}
const COMMON_PASSWORDS=new Set(['password','password1','password123','12345678','123456789','qwerty123','qwertyuiop','iloveyou1','admin1234','letmein123','welcome123','loudent123']);
/** Returns an error message, or null when the password is acceptable. */
export function passwordProblem(password,{email='',name=''}={}){
 if(typeof password!=='string')return 'Enter a password.';
 if(password.length<8)return 'Password must be at least 8 characters.';
 if(password.length>128)return 'Password must be 128 characters or fewer.';
 if(!/[A-Za-z]/.test(password)||!/[0-9]/.test(password))return 'Password must contain at least one letter and one number.';
 const lower=password.toLowerCase();
 if(COMMON_PASSWORDS.has(lower))return 'That password is too common. Choose a less predictable one.';
 const local=String(email).split('@')[0].toLowerCase();
 if(local.length>=4&&lower.includes(local))return 'Password must not contain your email name.';
 return null;
}
/** Sliding-window style limiter: at most `max` hits per `windowMs` per key. Time source is injectable for tests. */
export function makeRateLimiter({windowMs,max,now=Date.now}){
 const hits=new Map();
 return {
  hit(key){
   const t=now();const e=hits.get(key);
   if(!e||t-e.start>=windowMs){hits.set(key,{start:t,count:1});if(hits.size>5000)for(const [k,v] of hits)if(t-v.start>=windowMs)hits.delete(k);return {allowed:true,retryAfterMs:0};}
   e.count++;
   return e.count>max?{allowed:false,retryAfterMs:windowMs-(t-e.start)}:{allowed:true,retryAfterMs:0};
  },
  reset(key){hits.delete(key);},
 };
}
/** Cryptographically random password using an unambiguous alphabet (no 0/O/1/l/I). Contains all classes. */
export function generateStrongPassword(length=20){
 const sets=['ABCDEFGHJKLMNPQRSTUVWXYZ','abcdefghijkmnpqrstuvwxyz','23456789','!@#$%^&*-_=+?'];
 const all=sets.join('');const out=sets.map(set=>set[randomInt(set.length)]);
 while(out.length<Math.max(length,12))out.push(all[randomInt(all.length)]);
 for(let i=out.length-1;i>0;i--){const j=randomInt(i+1);[out[i],out[j]]=[out[j],out[i]];}
 return out.join('');
}
/** Error text that is safe to log: the mariadb driver appends "sql: … parameters:[…]" (emails, hashes) to messages. */
export function safeErrorSummary(error){
 if(!error)return 'unknown error';
 const raw=String(error.text||error.sqlMessage||error.message||error);
 const firstLine=raw.split('\n')[0].replace(/\(conn=[^)]*\)\s*/,'');
 return firstLine.replace(/parameters:\s*\[[\s\S]*$/,'').slice(0,300);
}
