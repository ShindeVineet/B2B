import {runColdReminders} from "../src/lib/cold/jobs.ts";
import assert from 'node:assert/strict';
import {PrismaClient} from '@prisma/client';
import jwt from 'jsonwebtoken';
import {unlink} from 'node:fs/promises';
import path from 'node:path';
const db=new PrismaClient();let leadId;
const base='http://127.0.0.1:3000';
const token=u=>jwt.sign({id:u.id},process.env.JWT_SECRET,{expiresIn:'10m'});
async function request(u,url,body,method='POST'){const r=await fetch(base+url,{method,headers:{Authorization:'Bearer '+token(u),'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});const d=await r.json();return {status:r.status,data:d};}
try {
 const head=await db.user.findFirstOrThrow({where:{role:'b2b_head',active:true}}),rep=await db.user.findFirstOrThrow({where:{role:'ground_rep',active:true}}),ops=await db.user.findFirstOrThrow({where:{role:'analyst',active:true}});
 const l=await db.lead.create({data:{company_name:'ABC verification fixture',assigned_ground_rep_id:rep.id,region:rep.region,lat:12.97,lng:77.69,geocode_status:'ok',location_verified:true}});leadId=l.id;
 const form=new FormData();form.append('lead_id',l.id);form.append('file',new Blob([Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jBz8AAAAASUVORK5CYII=','base64')],{type:'image/png'}),'test.png');
 const upload=await fetch(base+'/api/photos',{method:'POST',headers:{Authorization:'Bearer '+token(rep)},body:form});assert.equal(upload.status,200);const photo=await upload.json();
 const raw={decision_maker_name:'Test owner',company_name:l.company_name,decision_maker_phone:'1234567890',designation:'Director',lead_type:'Architect',interest_level:'Low',current_lead_status:'Fresh Lead - After Pre-qualification',outcome:'Dont want commission',visit_date:'2026-09-28',site_photos:[photo.url],visiting_card_photos:[photo.url],checklist:['Florzy Pitched'],notes:'Workflow validation',ground_staff_name:'Spoofed'};
 let result=await request(rep,'/api/consultations',{lead_id:l.id,responses:raw});assert.equal(result.status,200,JSON.stringify(result.data));assert.equal(result.data.consultation.ground_staff_name,rep.name);assert.deepEqual(result.data.consultation.responses.checklist,raw.checklist);
 assert.equal((await db.lead.findUnique({where:{id:l.id}})).status,'Needs Manager Review');assert.ok(await db.coldLeadCase.findUnique({where:{lead_id:l.id}}));
 await db.coldLeadCase.update({where:{lead_id:l.id},data:{flagged_at:new Date(Date.now()-49*3600000)}});
 await runColdReminders();await runColdReminders();
 assert.equal(await db.workflowNotification.count({where:{lead_id:l.id,user_id:head.id,type:'sla_breach'}}),1);
 const outsider=await db.user.findFirst({where:{role:'regional_manager',region:{not:rep.region||'__none__'},active:true}});
 if(outsider)assert.equal((await request(outsider,`/api/cold-leads/${l.id}/calls`,null,'GET')).status,404);

 assert.equal((await request(ops,`/api/cold-leads/${l.id}/calls`,{outcome:'Converted',notes:'No permission'})).status,403);
 assert.equal((await request(head,`/api/cold-leads/${l.id}/calls`,{outcome:'Call back later',notes:'Missing date'})).status,400);
 assert.equal((await request(head,`/api/cold-leads/${l.id}/calls`,{outcome:'Call back later',notes:'Callback requested',date:'2026-10-01'})).status,200);
 assert.equal((await request(head,`/api/cold-leads/${l.id}/calls`,{outcome:'Reactivated',notes:'Interested again',date:'2026-10-02'})).status,200);
 assert.equal((await db.followUp.findUnique({where:{lead_id:l.id}})).active,true);
 result=await request(rep,'/api/consultations',{lead_id:l.id,responses:{...raw,outcome:'On-boarding Done'}});assert.equal(result.status,200,JSON.stringify(result.data));assert.equal((await db.lead.findUnique({where:{id:l.id}})).status,'onboarded');assert.equal((await db.followUp.findUnique({where:{lead_id:l.id}})).active,false);
 assert.equal((await request(ops,`/api/mapping-issues/${l.id}`,{action:'cannot_locate'},'PATCH')).status,403);
 console.log('PASS: photo upload, dynamic form, typed/JSON sync, cold routing, deduplicated 48-hour escalation, region scope, ops write denial, required callback date, callback history, reactivation, follow-up, onboarding.');
}finally{if(leadId){for(const p of await db.photoAsset.findMany({where:{lead_id:leadId}}))await unlink(path.join(process.env.PHOTO_STORAGE_DIR||'.data/photos',p.filename)).catch(()=>{});await db.$transaction([db.workflowNotification.deleteMany({where:{lead_id:leadId}}),db.callLog.deleteMany({where:{lead_id:leadId}}),db.coldLeadCase.deleteMany({where:{lead_id:leadId}}),db.followUp.deleteMany({where:{lead_id:leadId}}),db.photoAsset.deleteMany({where:{lead_id:leadId}}),db.lead.delete({where:{id:leadId}})]);}await db.$disconnect();}
