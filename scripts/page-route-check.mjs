import {PrismaClient} from '@prisma/client';
import jwt from 'jsonwebtoken';
import assert from 'node:assert/strict';
const db=new PrismaClient();
try {
 for(const role of ['b2b_head','ground_rep']) {
  const user=await db.user.findFirstOrThrow({where:{role,active:true}});
  const cookie='leadmap_token='+jwt.sign({id:user.id},process.env.JWT_SECRET,{expiresIn:'10m'});
  const paths=role==='b2b_head'?['/dashboard','/leads','/map','/plans','/routes','/consultations','/partners','/stores','/import','/mapping-issues','/cold-leads']:['/rep-portal'];
  const lead=await db.lead.findFirst({where:role==='ground_rep'?{assigned_ground_rep_id:user.id}:{}});
  if(lead)paths.push('/leads/'+lead.id);
  for(const path of paths){const r=await fetch('http://127.0.0.1:3000'+path,{headers:{cookie}});const html=await r.text();assert.equal(r.status,200,role+' '+path);assert.ok(!html.includes('NEXT_HTTP_ERROR_FALLBACK;500'),path);console.log('PASS',role,path);}
 }
}finally{await db.$disconnect();}
