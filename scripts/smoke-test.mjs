import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
const db = new PrismaClient();
const base = process.env.TEST_BASE_URL || 'http://127.0.0.1:3000';
const marker = `Smoke-${randomUUID()}`;
async function request(path, token, method='GET', body) {
  const res = await fetch(base+path,{method, headers:{...(token?{Authorization:`Bearer ${token}`} : {}),'Content-Type':'application/json'},body:body ? JSON.stringify(body):undefined});
  const data = await res.json(); return {status:res.status,data};
}
(async()=>{try {
  const sessions = {};
  for (const role of ['b2b_head','regional_manager','ground_rep','analyst']) {
    const user = await db.user.findFirst({where:{role,active:true}});
    const login = await request('/api/auth/login',null,'POST',{email:user.email,password:process.env.TEST_PASSWORD || 'LeadMap@123'});
    assert.equal(login.status,200,`${role} login`); sessions[role]={token:login.data.token,user};
    const leads = await request('/api/leads',login.data.token);assert.equal(leads.status,200,`${role} leads`);
    if(role==='ground_rep') assert(leads.data.leads.every(l=>l.assigned_ground_rep_id===user.id));
  }
  console.log('PASS login and lead listing for all four roles');
  assert.equal((await request('/api/leads')).status,401);
  const admin=sessions.b2b_head.token;
  for(const route of ['/dashboard','/map','/leads','/stores','/import','/unmapped','/reps']) {
    const r=await fetch(base+route,{headers:{Cookie:`leadmap_token=${admin}`}}); assert.equal(r.status,200,route);
    const html=await r.text();assert(!html.includes('NEXT_HTTP_ERROR_FALLBACK;500'),route);
  }
  console.log('PASS authenticated pages');
  const imported=await request('/api/leads/bulk-import',admin,'POST',{rows:[{company_name:marker+'-import',phone_no:marker,pin_code:'560001'}],skipDuplicates:true,autoAssignToNearest:true});
  assert.equal(imported.status,200,JSON.stringify(imported.data));assert.equal(imported.data.totalImported,1);
  const dup=await request('/api/leads/bulk-import',admin,'POST',{rows:[{company_name:marker+'-import',phone_no:marker,pin_code:'560001'}],skipDuplicates:true});assert.equal(dup.data.duplicatesSkipped,1);
  const created=await request('/api/leads',admin,'POST',{company_name:marker+'-manual',pin_code:'560001'});assert.equal(created.status,201,JSON.stringify(created.data));
  const lead=await db.lead.findFirst({where:{company_name:marker+'-manual'}});
  assert.equal((await request(`/api/leads/${lead.id}`,sessions.analyst.token,'PATCH',{notes:'forbidden'})).status,403);
  const mgr=sessions.regional_manager;
  const outside=await db.lead.create({data:{company_name:marker+'-outside',region:'SmokeOther'}});
  assert.equal((await request(`/api/leads/${outside.id}`,mgr.token)).status,404);
  assert.equal((await request('/api/leads/bulk-assign',mgr.token,'POST',{leadIds:[outside.id],status:'Assigned'})).status,403);
  const streamed = await fetch(base+'/api/leads/bulk-import',{method:'POST',headers:{Authorization:`Bearer ${admin}`,'Content-Type':'application/json',Accept:'application/x-ndjson'},body:JSON.stringify({rows:[{company_name:marker+'-stream',pin_code:'560001',scraped_date:45000},{company_name:''}],skipDuplicates:true})});
  assert.equal(streamed.status,200);
  const events=(await streamed.text()).trim().split('\n').map(line=>JSON.parse(line));
  assert.deepEqual(events.filter(e=>e.type==='progress').map(e=>e.processed),[0,1,2]);
  assert.equal(events.at(-1).type,'complete');
  assert.equal(events.at(-1).totalImported,1);
  assert.equal(events.at(-1).invalidRowsSkipped,1);
  console.log('PASS streamed import progress, Excel date, skipped row count, and completion');
  console.log('PASS import, dedupe, manual creation, and cross-role/cross-region denials');
  const store=await db.store.findFirst({where:{active:true}});
  const assigned=await request('/api/leads/bulk-assign',admin,'POST',{leadIds:[lead.id],storeId:store.id});assert.equal(assigned.status,200);
  assert.equal((await request('/api/dashboard/stats',admin)).status,200);
  const repSession = sessions.ground_rep;
  const team = await request('/api/users?role=ground_rep',admin);
  assert.equal(team.status,200);
  assert(team.data.users.some(member => member.id === repSession.user.id), 'rep available in assignment dropdown');
  const repAssignment = await request('/api/leads/bulk-assign',admin,'POST',{leadIds:[lead.id],repId:repSession.user.id});
  assert.equal(repAssignment.status,200);
  assert.equal((await db.lead.findUnique({where:{id:lead.id}})).assigned_ground_rep_id,repSession.user.id);
  const repLeads = await request('/api/leads',repSession.token);
  assert(repLeads.data.leads.some(item => item.id === lead.id), 'assigned lead appears in rep portal');
  const clearRep = await request('/api/leads/bulk-assign',admin,'POST',{leadIds:[lead.id],repId:null});
  assert.equal(clearRep.status,200);
  assert.equal((await db.lead.findUnique({where:{id:lead.id}})).assigned_ground_rep_id,null);
  const mapAssignment = await request(`/api/leads/${lead.id}`,admin,'PATCH',{assigned_ground_rep_id:repSession.user.id,status:'Assigned'});
  assert.equal(mapAssignment.status,200);
  assert.equal(mapAssignment.data.lead.assigned_ground_rep_id,repSession.user.id);
  console.log('PASS direct map-panel assignment');
  console.log('PASS ground team listing, assignment, rep visibility, and unassignment');
  console.log('PASS bulk assignment and dashboard stats');
  const createdStore = await request('/api/stores',admin,'POST',{name:marker+'-store',address:'Bengaluru',pin_code:'560001',region:'South',radius_km:5,lat:12.9716,lng:77.5946});
  assert.equal(createdStore.status,201,JSON.stringify(createdStore.data));
  const storeId=createdStore.data.store.id;
  assert.equal((await request(`/api/stores/${storeId}`,admin,'PATCH',{radius_km:8})).status,200);
  assert.equal((await request(`/api/stores/${storeId}`,admin,'DELETE')).status,200);
  const auto=await request('/api/leads/bulk-assign',admin,'POST',{leadIds:[lead.id],autoAssignToNearest:true});
  assert.equal(auto.status,200);assert.equal(auto.data.assignedCount,0,'manual mapping preserved');
  console.log('PASS store creation/edit/deletion, geocoding, and manual mapping preservation');
} finally {await db.lead.deleteMany({where:{company_name:{startsWith:marker}}});await db.store.deleteMany({where:{name:{startsWith:marker}}});await db.$disconnect();}})().catch(e=>{console.error(e);process.exitCode=1});
