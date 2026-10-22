import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { openSync } from 'node:fs';
import { PrismaClient } from '@prisma/client';
import jwt from 'jsonwebtoken';
const db = new PrismaClient(), ids = [], planIds = [];
const base='http://127.0.0.1:3019';
let server;
const today=new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Kolkata'});
const day=n=>new Date(new Date(today).getTime()+n*86400000).toISOString().slice(0,10);
try {
 const rep=await db.user.findFirstOrThrow({where:{role:'ground_rep',active:true}});
 const head=await db.user.findFirstOrThrow({where:{role:'b2b_head',active:true}});
 const store=await db.user.findFirstOrThrow({where:{role:'store_associate',active:true}});
 const log=openSync('/tmp/revisit-followup-smoke.log','w');
 server=spawn('node',['node_modules/next/dist/bin/next','start','-p','3019'],{stdio:['ignore',log,log],env:process.env});
 let ready=false;for(let i=0;i<60;i++){try{if((await fetch(base+'/login')).ok){ready=true;break}}catch{}await new Promise(r=>setTimeout(r,500))}assert.ok(ready);
 const api=async(path,user,body)=>{const r=await fetch(base+path,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+jwt.sign({id:user.id},process.env.JWT_SECRET,{expiresIn:'10m'}),'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});return {status:r.status,data:await r.json()}};
 const make=async(channel,user)=>{
  const lead=await db.lead.create({data:{company_name:'Revisit follow-up verification',intake_team:channel,status:'Active — Nurturing',...(channel==='ground'?{assigned_ground_rep_id:user.id}:{calling_associate_id:user.id})}});ids.push(lead.id);
  const c=await db.consultation.create({data:{lead_id:lead.id,rep_id:user.id,visit_date:new Date(day(-3)),outcome:'Nurturing required',notes:'Original meeting',interest_level:'Medium'}});
  await db.followUp.create({data:{lead_id:lead.id,rep_id:user.id,due_date:new Date(day(-1))}});
  return {lead,c};
 };
 const {lead,c}=await make('ground',rep);
 const pending=await api('/api/follow-ups?view=pending&page=1',rep);assert.equal(pending.status,200);
 // Find this fixture even when a real team queue spans several pages.
 const all=await api('/api/follow-ups?mine=true',rep);assert.ok(all.data.followups.some(f=>f.lead.id===lead.id));
 const visit=async(user,id,body)=>{const r=await api(`/api/leads/${id}/revisit`,user,{date:today,...body});assert.equal(r.status,200,JSON.stringify(r));if(r.data.trip_lead_id){const v=await db.tripLead.findUniqueOrThrow({where:{id:r.data.trip_lead_id}});planIds.push(v.trip_id);assert.equal(v.completed,true)}return r};
 await visit(rep,lead.id,{outcome:"Couldn't meet",notes:'Office empty'});
 assert.equal((await db.followUp.findUniqueOrThrow({where:{lead_id:lead.id}})).active,true);
 await visit(rep,lead.id,{outcome:'Follow-up needed',notes:'Try later today',next_follow_up_date:today});
 assert.equal((await db.followUp.findUniqueOrThrow({where:{lead_id:lead.id}})).active,true);
 await visit(rep,lead.id,{outcome:'Ready for onboarding',notes:'Documents requested'});
 assert.equal((await db.followUp.findUniqueOrThrow({where:{lead_id:lead.id}})).active,false);
 let current=await db.consultation.findUniqueOrThrow({where:{id:c.id}});
 assert.equal(await db.consultation.count({where:{lead_id:lead.id}}),1);assert.equal(current.visit_date.toISOString(),c.visit_date.toISOString());assert.equal(current.notes,'Original meeting');assert.equal(current.responses.revisits.length,3);
 await db.followUp.update({where:{lead_id:lead.id},data:{due_date:new Date(day(2)),active:true}});
 const early=await api(`/api/leads/${lead.id}/calling-consultation`,head,{call_picked:true,notes:'Early check-in',interest_level:'High',whatsapp_group_created:false});assert.equal(early.status,200);
 assert.equal((await db.followUp.findUniqueOrThrow({where:{lead_id:lead.id}})).active,true);
 await db.followUp.update({where:{lead_id:lead.id},data:{due_date:new Date(day(-1))}});
 const reached=await api(`/api/leads/${lead.id}/calling-consultation`,head,{call_picked:true,notes:'Follow-up completed by head',interest_level:'High',whatsapp_group_created:false});assert.equal(reached.status,200);
 assert.equal((await db.followUp.findUniqueOrThrow({where:{lead_id:lead.id}})).active,false);
 const storeFixture=await make('store',store);
 await visit(store,storeFixture.lead.id,{outcome:'Ready for onboarding',notes:'Walk-in revisit'});
 assert.equal(await db.consultation.count({where:{lead_id:storeFixture.lead.id}}),1);
 assert.equal((await db.followUp.findUniqueOrThrow({where:{lead_id:storeFixture.lead.id}})).active,false);
 await visit(store,storeFixture.lead.id,{outcome:"Couldn't meet",notes:'Later attempt'});
 const reminders=await api('/api/onboarding-reminders',store);assert.equal(reminders.status,200);assert.ok(reminders.data.reminders.some(r=>r.id===storeFixture.lead.id),'readiness retained in history');
 const denied=await api(`/api/leads/${storeFixture.lead.id}/revisit`,rep,{date:today,outcome:'Ready for onboarding'});assert.equal(denied.status,403);
 const scoped=await api('/api/follow-ups?view=pending',rep);assert.ok(!scoped.data.followups.some(f=>f.lead.id===storeFixture.lead.id));
 assert.equal((await fetch(base+'/follow-ups')).status,200);
 console.log('PASS: ground/store revisit continuity, preserved visit records, failed contact persistence, same-day rescheduling, successful completion, early contact retention, cross-staff completion, role scope, readiness history and Follow Up page.');
} finally {
 server?.kill('SIGTERM');
 if(ids.length) await db.$transaction(async tx=>{
  const visits=await tx.tripLead.findMany({where:{lead_id:{in:ids}},select:{trip_id:true}});planIds.push(...visits.map(v=>v.trip_id));
  for(const model of ['workflowNotification','coldLeadCase','followUp','callLog','activityLog','consultation','tripLead'])await tx[model].deleteMany({where:{lead_id:{in:ids}}});
  await tx.tripPlan.deleteMany({where:{id:{in:planIds}}});await tx.lead.deleteMany({where:{id:{in:ids}}});
 });
 await db.$disconnect();
}
