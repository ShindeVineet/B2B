import {runColdReminders} from "../src/lib/cold/jobs.ts";
import assert from 'node:assert/strict';
import {PrismaClient} from '@prisma/client';
import jwt from 'jsonwebtoken';
import {unlink} from 'node:fs/promises';
import path from 'node:path';
const db=new PrismaClient();let leadId; const planIds=[];
const base='http://127.0.0.1:3000';
const token=u=>jwt.sign({id:u.id},process.env.JWT_SECRET,{expiresIn:'10m'});
async function request(u,url,body,method='POST'){const r=await fetch(base+url,{method,headers:{Authorization:'Bearer '+token(u),'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});const d=await r.json();return {status:r.status,data:d};}
try {
 const head=await db.user.findFirstOrThrow({where:{role:'b2b_head',active:true}}),rep=await db.user.findFirstOrThrow({where:{role:'ground_rep',active:true}}),ops=await db.user.findFirstOrThrow({where:{role:'analyst',active:true}});
 const l=await db.lead.create({data:{company_name:'ABC verification fixture',assigned_ground_rep_id:rep.id,region:rep.region,lat:12.97,lng:77.69,geocode_status:'ok',location_verified:true}});leadId=l.id;
 const active=await db.tripPlan.create({data:{name:'Consultation link check',ground_rep_id:rep.id,start_date:new Date('2026-09-28'),end_date:new Date('2026-09-28'),status:'active',trip_leads:{create:{lead_id:l.id,scheduled_date:new Date('2026-09-28')}}}});planIds.push(active.id);
 const draft=await db.tripPlan.create({data:{name:'Consultation draft check',ground_rep_id:rep.id,start_date:new Date('2026-09-28'),end_date:new Date('2026-09-28'),status:'draft',trip_leads:{create:{lead_id:l.id,scheduled_date:new Date('2026-09-28')}}}});planIds.push(draft.id);
 const form=new FormData();form.append('lead_id',l.id);form.append('file',new Blob([Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jBz8AAAAASUVORK5CYII=','base64')],{type:'image/png'}),'test.png');
 const upload=await fetch(base+'/api/photos',{method:'POST',headers:{Authorization:'Bearer '+token(rep)},body:form});assert.equal(upload.status,200);const photo=await upload.json();
 const raw={decision_maker_name:'Test owner',company_name:l.company_name,decision_maker_phone:'9876543210',designation:'Director',lead_type:'Architect',interest_level:'Low',current_lead_status:'Fresh Lead - After Pre-qualification',outcome:'Dont want commission',visit_date:'2026-09-28',site_photos:[photo.url],visiting_card_photos:[photo.url],checklist:['Florzy Pitched'],notes:'Workflow validation',ground_staff_name:'Spoofed'};
 let result=await request(rep,'/api/consultations',{lead_id:l.id,responses:raw});assert.equal(result.status,200,JSON.stringify(result.data));assert.equal(result.data.consultation.ground_staff_name,rep.name);assert.deepEqual(result.data.consultation.responses.checklist,raw.checklist);
 const visits=await db.tripLead.findMany({where:{lead_id:l.id}});
 assert.equal(visits.find(v=>v.trip_id===active.id).completed,true);
 assert.equal(visits.find(v=>v.trip_id===draft.id).completed,false);
 assert.equal(result.data.consultation.lead_id,l.id);
 assert.equal(result.data.consultation.rep_id,rep.id);
 const history=await request(rep,`/api/consultations?lead_id=${l.id}`,null,'GET');
 assert.equal(history.status,200);
 assert.ok(history.data.consultations.some(c=>c.id===result.data.consultation.id));
 console.log('PASS: uploaded photos, consultation, lead history and active visit linked; draft visit preserved.');
}finally{await db.tripPlan.deleteMany({where:{id:{in:planIds}}});if(leadId){for(const p of await db.photoAsset.findMany({where:{lead_id:leadId}}))await unlink(path.join(process.env.PHOTO_STORAGE_DIR||'.data/photos',p.filename)).catch(()=>{});await db.$transaction([db.workflowNotification.deleteMany({where:{lead_id:leadId}}),db.callLog.deleteMany({where:{lead_id:leadId}}),db.coldLeadCase.deleteMany({where:{lead_id:leadId}}),db.followUp.deleteMany({where:{lead_id:leadId}}),db.photoAsset.deleteMany({where:{lead_id:leadId}}),db.lead.delete({where:{id:leadId}})]);}await db.$disconnect();}
