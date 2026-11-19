import test from 'node:test';import assert from 'node:assert/strict';
import {hashPassword,comparePassword,minutes,sqlTime,prettyTime,scheduleValid,inSchedule,overlap,weekday,dateValid,validatePhoto,parseAdminDentistIds,isClinicAdmin,canManageAppointment} from '../src/core.js';
test('password hashes use unique salts and verify securely',async()=>{const a=await hashPassword('Patient123!'),b=await hashPassword('Patient123!');assert.notEqual(a.hash,b.hash);assert.equal(await comparePassword('Patient123!',a.salt,a.hash),true);assert.equal(await comparePassword('bad',a.salt,a.hash),false)});
test('time conversion and dates',()=>{assert.equal(minutes('1:00 PM'),780);assert.equal(sqlTime('1:00 PM'),'13:00:00');assert.equal(prettyTime('09:30:00'),'9:30 AM');assert.equal(weekday('2026-11-09'),0);assert.equal(dateValid('2026-02-29'),false)});
test('schedule validation and break',()=>{const a={available:true,start:'9:00 AM',end:'5:00 PM',breakStart:'12:00 PM',breakEnd:'1:00 PM'};assert.equal(scheduleValid(a),true);assert.equal(inSchedule(a,660,30),true);assert.equal(inSchedule(a,720,30),false);assert.equal(scheduleValid({...a,end:'8:00 AM'}),false)});
test('interval overlaps',()=>{assert.equal(overlap(600,60,630,30),true);assert.equal(overlap(600,60,660,30),false)});
test('reject bad photo payload',()=>{assert.throws(()=>validatePhoto('not-an-image'));assert.equal(validatePhoto(null),null)});
test('clinic administrator authorization',()=>{
 const ids=parseAdminDentistIds(undefined);assert.deepEqual(ids,['santos']);assert.deepEqual(parseAdminDentistIds(' santos , reyes '),['santos','reyes']);
 const santos={role:'dentist',dentistId:'santos'},reyes={role:'dentist',dentistId:'reyes'},patient={role:'patient',dentistId:null};
 const own={dentistId:'reyes'},other={dentistId:'santos'};
 assert.equal(isClinicAdmin(santos,ids),true);assert.equal(isClinicAdmin(reyes,ids),false);assert.equal(isClinicAdmin(patient,ids),false);
 assert.equal(canManageAppointment(santos,own,ids),true,'admin manages another dentist\'s appointment');
 assert.equal(canManageAppointment(reyes,own,ids),true,'dentist manages own appointment');
 assert.equal(canManageAppointment(reyes,other,ids),false,'non-admin dentist cannot manage another dentist\'s appointment');
 assert.equal(canManageAppointment(patient,own,ids),false);assert.equal(canManageAppointment(null,own,ids),false);
 assert.equal(canManageAppointment({role:'dentist',dentistId:'santos'},own,[]),false,'empty admin list means nobody is admin');
});
