import assert from 'node:assert/strict';
import {PrismaClient} from '@prisma/client';
import jwt from 'jsonwebtoken';
const db=new PrismaClient();let planId;const leadIds=[];const createdPlans=[];
try{
 const head=await db.user.findFirstOrThrow({where:{role:'b2b_head',active:true}}),rep=await db.user.findFirstOrThrow({where:{role:'ground_rep',active:true}});
 const headers={Authorization:'Bearer '+jwt.sign({id:head.id},process.env.JWT_SECRET,{expiresIn:'10m'}),'Content-Type':'application/json'};
 async function call(url,body,method='PATCH'){const r=await fetch('http://127.0.0.1:3000/api'+url,{method,headers,body:JSON.stringify(body)});return {status:r.status,data:await r.json()};}
 for(let i=0;i<3;i++){const lead=await db.lead.create({data:{company_name:`Plan edit verification ${i}`,assigned_ground_rep_id:rep.id,lat:12.97+i*.01,lng:77.69,geocode_status:'ok',location_verified:true}});leadIds.push(lead.id);}
 const plan=await db.tripPlan.create({data:{name:'Plan edit verification',ground_rep_id:rep.id,start_date:new Date('2099-01-01'),end_date:new Date('2099-01-03'),leads_per_day:1,status:'draft',assignment:{create:{ground_rep_id:rep.id,start_date:new Date('2099-01-01'),end_date:new Date('2099-01-03'),leads_per_day_default:1,base_working_days:['mon','tue','wed','thu','fri','sat','sun']}}}});planId=plan.id;
 const a=await db.tripLead.create({data:{trip_id:plan.id,lead_id:leadIds[0],scheduled_date:new Date('2099-01-01')}});await db.tripLead.create({data:{trip_id:plan.id,lead_id:leadIds[1],scheduled_date:new Date('2099-01-02')}});
 const generation={ground_rep_id:rep.id,start_date:'2099-01-01',leads_per_day:1,total_days:1,lead_ids:[leadIds[2]],base_working_days:['mon','tue','wed','thu','fri','sat','sun']};
 const conflict=await call('/trips/auto-plan',generation,'POST');assert.equal(conflict.status,409,JSON.stringify(conflict.data));assert.equal(conflict.data.conflicts[0].id,a.id);
 const body={expected_date:'2099-01-01',expected_lead_id:leadIds[0],lead_id:leadIds[0]};
 assert.equal((await call(`/visits/${a.id}/edit`,{...body,date:'2099-01-02'})).status,409);
 assert.equal((await call(`/visits/${a.id}/edit`,{...body,date:'2099-01-04'})).status,400);
 assert.equal((await call(`/visits/${a.id}/edit`,{...body,date:'2099-01-03'})).status,200);
 assert.equal((await call(`/visits/${a.id}/edit`,{...body,expected_date:'2099-01-03',lead_id:leadIds[2],date:'2099-01-03'})).status,200);
 const success=await call('/trips/auto-plan',{...generation,lead_ids:[leadIds[0]]},'POST');if(success.data.tripPlan?.id)createdPlans.push(success.data.tripPlan.id);assert.equal(success.status,200,JSON.stringify(success.data));
 assert.equal(await db.missedVisit.count({where:{trip_lead_id:a.id}}),0);
 console.log('PASS: capacity conflict lists editable visits; full-day and end-date checks; move and replace lead; retry succeeds; no false missed-visit event.');
}finally{
 const ids=[planId,...createdPlans].filter(Boolean);await db.tripAssignment.deleteMany({where:{trip_id:{in:ids}}});await db.tripPlan.deleteMany({where:{id:{in:ids}}});await db.lead.deleteMany({where:{id:{in:leadIds}}});await db.$disconnect();
}
