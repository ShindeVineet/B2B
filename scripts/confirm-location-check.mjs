import {PrismaClient} from '@prisma/client';
import jwt from 'jsonwebtoken';
import assert from 'node:assert/strict';
const db=new PrismaClient();let id;
try {
 const user=await db.user.findFirstOrThrow({where:{role:'b2b_head',active:true}});
 const lead=await db.lead.create({data:{company_name:'Confirmation check fixture',lat:12.97,lng:77.59,geocode_status:'mismatch_flagged'}});id=lead.id;
 const patch=async body=>fetch(`http://127.0.0.1:3000/api/mapping-issues/${id}`,{method:'PATCH',headers:{Authorization:'Bearer '+jwt.sign({id:user.id},process.env.JWT_SECRET),'Content-Type':'application/json'},body:JSON.stringify(body)});
 assert.equal((await patch({action:'confirm_location',lat:13,lng:77.59})).status,409);
 const r=await patch({action:'confirm_location',lat:12.97,lng:77.59});assert.equal(r.status,200,await r.text());
 const saved=await db.lead.findUniqueOrThrow({where:{id}});assert.equal(saved.geocode_status,'ok');assert.equal(saved.location_verified,true);assert.equal(saved.lat,12.97);
 console.log('PASS confirmation preserves coordinates, verifies lead and rejects stale location');
} finally {if(id)await db.lead.delete({where:{id}});await db.$disconnect();}
