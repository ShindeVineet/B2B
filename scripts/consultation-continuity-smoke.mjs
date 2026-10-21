import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { openSync } from 'node:fs';
import { PrismaClient } from '@prisma/client';
import jwt from 'jsonwebtoken';
const db = new PrismaClient();
const base = 'http://127.0.0.1:3018';
let server, leadId;
try {
  const head = await db.user.findFirstOrThrow({where:{role:'b2b_head',active:true}});
  const log = openSync('/tmp/consultation-continuity-smoke.log','w');
  server=spawn('node',['node_modules/next/dist/bin/next','start','-p','3018'],{stdio:['ignore',log,log],env:process.env});
  let ready=false;
  for(let i=0;i<60;i++){try{if((await fetch(base+'/login')).ok){ready=true;break}}catch{}await new Promise(r=>setTimeout(r,500))}
  assert.ok(ready,'production build starts');
  const lead=await db.lead.create({data:{company_name:'Consultation continuity verification',lead_source:'Phone',intake_team:'caller',calling_associate_id:head.id,status:'New'}});leadId=lead.id;
  const headers={Authorization:'Bearer '+jwt.sign({id:head.id},process.env.JWT_SECRET,{expiresIn:'10m'}),'Content-Type':'application/json'};
  const send=async body=>{const r=await fetch(`${base}/api/leads/${leadId}/calling-consultation`,{method:'POST',headers,body:JSON.stringify(body)});const data=await r.json();assert.equal(r.status,200,JSON.stringify(data));return data};
  await send({call_picked:false});
  assert.equal(await db.consultation.count({where:{lead_id:leadId}}),0);
  const body={call_picked:true,notes:'First conversation',interest_level:'High',whatsapp_group_created:false};
  const first=await send(body);
  const followups=await Promise.all([send({...body,notes:'Follow-up one',interest_level:'Medium'}),send({...body,notes:'Follow-up two',interest_level:'Medium'})]);
  for(const f of followups) assert.equal(f.consultation.id,first.consultation.id);
  let c=await db.consultation.findUniqueOrThrow({where:{id:first.consultation.id}});
  assert.equal(await db.consultation.count({where:{lead_id:leadId}}),1);
  assert.equal(c.visit_date.toISOString(),first.consultation.visit_date);
  assert.equal(c.notes,'First conversation');assert.equal(c.responses.follow_up_calls.length,2);
  await send({call_picked:false});
  c=await db.consultation.findUniqueOrThrow({where:{id:c.id}});
  assert.equal(c.interest_level,'Medium');assert.equal(c.responses.follow_up_calls.length,3);
  await send({...body,notes:'Low interest',interest_level:'Low'});
  assert.equal((await db.coldLeadCase.findUniqueOrThrow({where:{lead_id:leadId}})).resolved_at,null);
  await send({...body,notes:'Interested again'});
  assert.ok((await db.coldLeadCase.findUniqueOrThrow({where:{lead_id:leadId}})).resolved_at);
  await send({...body,notes:'Interest declined again',interest_level:'Low'});
  assert.equal((await db.coldLeadCase.findUniqueOrThrow({where:{lead_id:leadId}})).resolved_at,null);
  const response=await fetch(`${base}/api/leads/${leadId}/history`,{headers});assert.equal(response.status,200);
  const history=(await response.json()).lead;
  assert.equal(history.consultations.length,1);assert.equal(history.consultations[0].responses.follow_up_calls.length,6);
  assert.equal(await db.callLog.count({where:{lead_id:leadId}}),8);
  console.log('PASS: first/unanswered/concurrent follow-up calls, stable consultation ID/date/notes, full history and repeated cold-case reevaluation.');
} finally {
 server?.kill('SIGTERM');
 if(leadId) await db.$transaction(async tx=>{
  for(const model of ['workflowNotification','coldLeadCase','followUp','callLog','activityLog','consultation'])await tx[model].deleteMany({where:{lead_id:leadId}});
  await tx.lead.delete({where:{id:leadId}});
 });
 await db.$disconnect();
}
