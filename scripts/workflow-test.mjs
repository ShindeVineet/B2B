import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
const db=new PrismaClient();const tag='Workflow-'+randomUUID();const base='http://127.0.0.1:3000';
async function api(path,token,body,method=body?'POST':'GET'){const res=await fetch(base+path,{method,headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{})},body:body?JSON.stringify(body):undefined});return {status:res.status,data:await res.json()}}
try {
 const admin=await db.user.findFirst({where:{role:'b2b_head',active:true}});const rep=await db.user.findFirst({where:{role:'ground_rep',active:true}});const analyst=await db.user.findFirst({where:{role:'analyst',active:true}});
 const login=async user=>{const r=await api('/api/auth/login',null,{email:user.email,password:process.env.TEST_PASSWORD||'LeadMap@123'});assert.equal(r.status,200);return r.data.token};
 const at=await login(admin),rt=await login(rep),ot=await login(analyst);
 const lead=await db.lead.create({data:{company_name:tag,assigned_ground_rep_id:rep.id,lat:12.97,lng:77.59}});
 const outside=await db.lead.create({data:{company_name:tag+'-outside'}});
 const plan=await api('/api/trips/auto-plan',at,{ground_rep_id:rep.id,name:tag,start_date:'2026-09-28',total_days:2,leads_per_day:1,lead_ids:[lead.id]});
 assert.equal(plan.status,200,JSON.stringify(plan.data));assert.equal(plan.data.tripPlan.totalLeadsScheduled,1);
 assert.equal((await api('/api/trips/auto-plan',rt,{ground_rep_id:rep.id})).status,403);
 const visit=await api('/api/consultations',rt,{lead_id:lead.id,outcome:'Hot',visit_date:'2026-09-28',notes:'Workflow test'});assert.equal(visit.status,200,JSON.stringify(visit.data));
 assert.equal((await db.lead.findUnique({where:{id:lead.id}})).status,'Hot');
 assert.equal((await db.tripLead.findFirst({where:{lead_id:lead.id}})).completed,true);
 assert.equal((await api('/api/consultations',rt,{lead_id:outside.id,outcome:'Hot'})).status,404);
 assert.equal((await api('/api/consultations',ot,{lead_id:lead.id,outcome:'Hot'})).status,403);
 assert.equal((await api(`/api/leads/${lead.id}/location`,rt,{lat:12.98,lng:77.60},'PATCH')).status,200);
 assert.equal((await api(`/api/leads/${outside.id}/location`,rt,{lat:12.98,lng:77.60},'PATCH')).status,404);
 assert.equal((await api(`/api/leads/${lead.id}/location`,rt,{lat:12.98,lng:77.60,status:'Converted'},'PATCH')).status,400);
 assert.equal((await api(`/api/leads/${lead.id}/location`,rt,{lat:100,lng:77.60},'PATCH')).status,400);
 const trips=await api('/api/trips?date=2026-09-28',rt);assert.equal(trips.status,200);assert(trips.data.dayLeads.some(s=>s.lead.id===lead.id));
 console.log('PASS monthly plan creation, consultation save/status/completion, scoped trips, location-only edits and permission denials');
}finally{await db.tripPlan.deleteMany({where:{name:tag}});await db.lead.deleteMany({where:{company_name:{startsWith:tag}}});await db.$disconnect()}
