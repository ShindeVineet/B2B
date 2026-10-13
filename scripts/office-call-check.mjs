import {PrismaClient} from '@prisma/client';
import jwt from 'jsonwebtoken';
import assert from 'node:assert/strict';
const db=new PrismaClient();let id;
const request=async(u,path,body)=>{const r=await fetch('http://127.0.0.1:3000'+path,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+jwt.sign({id:u.id},process.env.JWT_SECRET,{expiresIn:'10m'}),'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});return {status:r.status,data:await r.json()};};
try{
 const rep=await db.user.findFirstOrThrow({where:{role:'ground_rep',active:true}}), head=await db.user.findFirstOrThrow({where:{role:'b2b_head',active:true}}), analyst=await db.user.findFirstOrThrow({where:{role:'analyst',active:true}});
 const lead=await db.lead.create({data:{company_name:'Office call verification fixture',assigned_ground_rep_id:rep.id,status:'Assigned'}});id=lead.id;
 let r=await request(rep,`/api/leads/${id}/calls`,{notes:'Called from office',next_follow_up_date:'2099-01-01'});assert.equal(r.status,200,JSON.stringify(r.data));
 assert.equal((await db.followUp.findUnique({where:{lead_id:id}})).rep_id,rep.id);
 assert.equal((await db.lead.findUnique({where:{id}})).status,'Assigned');
 r=await request(head,'/api/follow-ups');assert.ok(r.data.followups.some(f=>f.lead.id===id&&f.rep.id===rep.id));
 assert.equal((await request(analyst,`/api/leads/${id}/calls`,{notes:'Denied'})).status,403);
 assert.equal((await request(rep,`/api/leads/${id}/calls`,{notes:' '})).status,400);
 assert.equal((await request(rep,`/api/leads/${id}/calls`,{notes:'Second office call'})).status,200);
 assert.equal((await db.followUp.findUnique({where:{lead_id:id}})).due_date.toISOString().slice(0,10),'2099-01-01');
 assert.equal((await request(rep,`/api/leads/${id}/calls`)).data.calls.length,2);
 console.log('PASS office call history, optional follow-up, assigned owner, team visibility, unchanged outcome and permission checks');
}finally{if(id){await db.callLog.deleteMany({where:{lead_id:id}});await db.followUp.deleteMany({where:{lead_id:id}});await db.lead.delete({where:{id}});}await db.$disconnect();}
