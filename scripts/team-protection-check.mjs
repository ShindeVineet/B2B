import {PrismaClient} from '@prisma/client';
import jwt from 'jsonwebtoken';
import assert from 'node:assert/strict';
const db=new PrismaClient();let id;const marker='CDT check '+Date.now();
try{
 const head=await db.user.findFirstOrThrow({where:{role:'b2b_head',active:true}}),rep=await db.user.findFirstOrThrow({where:{role:'ground_rep',active:true}});
 const request=async(u,path,body,method='POST')=>{const r=await fetch('http://127.0.0.1:3000'+path,{method,headers:{Authorization:'Bearer '+jwt.sign({id:u.id},process.env.JWT_SECRET),'Content-Type':'application/json'},body:JSON.stringify(body)});return {status:r.status,data:await r.json()};};
 let r=await request(head,'/api/leads/cdt-import',{rows:[{name:marker}]});assert.equal(r.status,200,JSON.stringify(r.data));
 const lead=await db.lead.findFirstOrThrow({where:{company_name:marker}});id=lead.id;assert.equal(lead.assigned_ground_rep_id,null);assert.equal(lead.phone_no,null);assert.equal(lead.lead_source,'CDT');
 await db.lead.update({where:{id},data:{assigned_ground_rep_id:rep.id}});
 assert.equal((await request(rep,`/api/leads/${id}/location`,{lat:12.97,lng:77.59},'PATCH')).status,403);
 assert.equal((await request(rep,`/api/leads/${id}`,{company_name:'changed'},'PATCH')).status,403);
 assert.equal((await request(rep,`/api/leads/${id}/phones`,{phone_number:'9876543210'})).status,403);
 console.log('PASS optional CDT intake, no ground assignment and ground edit/location/phone protection');
}finally{if(id)await db.lead.delete({where:{id}});await db.$disconnect();}
