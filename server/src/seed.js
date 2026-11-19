import pool from './db.js';
import seed from './seed-data.json' with {type:'json'};
import {DAYS, sqlTime} from './core.js';
// Seeds ONLY public clinic content: services, dentist profiles, service assignments, default weekly hours.
// It creates NO user accounts (staff: `npm run staff -- provision`; patients: Sign Up) and NO appointments.
// Every statement is INSERT IGNORE, so re-running never changes records that already exist.
const MAP={checkup:'General Dentistry',cleaning:'General Dentistry',filling:'General Dentistry',extraction:'General Dentistry',whitening:'General Dentistry',wisdom:'General Dentistry','partial-dentures':'General Dentistry','full-dentures':'General Dentistry',pediatric:'General Dentistry',veneers:'General Dentistry','braces-combo':'Orthodontics','braces-install':'Orthodontics',retainer:'Orthodontics'};
async function main(){
 const conn=await pool.getConnection();try{
  await conn.beginTransaction();
  for(const d of seed.dentists){await conn.query('INSERT IGNORE INTO dentists (id,name,title,specialty,experience_years,bio,photo_url) VALUES (?,?,?,?,?,?,?)',[d.id,d.name,d.title,d.specialty,d.experience,d.bio,d.photo]);}
  for(const s of seed.services){await conn.query('INSERT IGNORE INTO services (id,name,category,duration_minutes,price,icon,description,preparation,involves_json) VALUES (?,?,?,?,?,?,?,?,?)',[s.id,s.name,MAP[s.id]||'General Dentistry',s.duration,s.price,s.icon,s.description,s.preparation,JSON.stringify(s.involves)]);}
  for(const d of seed.dentists){for(const s of seed.services.filter(x=>d.services.includes(x.name))){await conn.query('INSERT IGNORE INTO dentist_services (dentist_id,service_id) VALUES (?,?)',[d.id,s.id]);}}
  for(const [dentistId,days] of Object.entries(seed.availability)){for(const [i,a] of days.entries()){await conn.query('INSERT IGNORE INTO weekly_availability (dentist_id,day_of_week,available,start_time,end_time,break_start,break_end) VALUES (?,?,?,?,?,?,?)',[dentistId,i,a.available?1:0,sqlTime(a.start),sqlTime(a.end),a.breakStart?sqlTime(a.breakStart):null,a.breakEnd?sqlTime(a.breakEnd):null]);}}
  await conn.commit();console.log(`Seeded clinic content: ${seed.services.length} services, ${seed.dentists.length} dentist profiles (existing records retained; no user accounts created).`);
 }catch(e){await conn.rollback();throw e;}finally{conn.release();await pool.end();}
}
main().catch(e=>{console.error(e.message);process.exitCode=1;pool.end().catch(()=>{});});
