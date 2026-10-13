import {PrismaClient} from '@prisma/client';
import jwt from 'jsonwebtoken';
import assert from 'node:assert/strict';
const db=new PrismaClient();let uid;const ids=[];
try {
 const rep=await db.user.findFirstOrThrow({where:{role:'ground_rep',active:true}}),manager=await db.user.findFirstOrThrow({where:{role:'regional_manager',active:true}});
 const store=await db.store.findFirstOrThrow();
 const associate=await db.user.create({data:{name:'Role verification',email:`role-check-${Date.now()}@example.test`,password_hash:'disabled-test-login',role:'store_associate',store_id:store.id}});uid=associate.id;
 const own=await db.lead.create({data:{company_name:'Role own CDT',lead_source:'CDT',assigned_store_id:store.id}});ids.push(own.id);
 const shared=await db.lead.create({data:{company_name:'Role ground assignment',assigned_ground_rep_id:rep.id}});ids.push(shared.id);
 const hidden=await db.lead.create({data:{company_name:'Role private unassigned',region:'outside'}});ids.push(hidden.id);
 const call=async(u,path,body,method=body?'PATCH':'GET')=>{const r=await fetch('http://127.0.0.1:3000'+path,{method,headers:{Authorization:'Bearer '+jwt.sign({id:u.id},process.env.JWT_SECRET),'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});return {status:r.status,data:await r.json()};};
 for(const id of ids)assert.equal((await call(manager,`/api/leads/${id}`)).status,200);
 assert.equal((await call(associate,`/api/leads/${own.id}`)).status,200);
 assert.equal((await call(associate,`/api/leads/${shared.id}`)).status,200);
 assert.equal((await call(associate,`/api/leads/${hidden.id}`)).status,404);
 assert.equal((await call(rep,`/api/leads/${shared.id}`)).status,200);
 assert.equal((await call(rep,`/api/leads/${own.id}`)).status,404);
 assert.equal((await call(associate,`/api/leads/${own.id}`,{company_name:'Completed CDT company'})).status,200);
 assert.equal((await call(associate,`/api/leads/${shared.id}`,{company_name:'Forbidden edit'})).status,404);
 assert.equal((await call(associate,`/api/leads/${own.id}`,{assigned_ground_rep_id:rep.id})).status,403);
 assert.equal((await call(associate,'/api/users',{id:associate.id,role:'b2b_head'})).status,403);
 console.log('PASS Head/Store Lead breadth, associate own/shared visibility, own-store editing, assignment/role denial and ground isolation');
}finally{await db.lead.deleteMany({where:{id:{in:ids}}});if(uid)await db.user.delete({where:{id:uid}});await db.$disconnect();}
