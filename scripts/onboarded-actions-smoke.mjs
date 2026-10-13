import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {openSync} from 'node:fs';
import {PrismaClient} from '@prisma/client';
import jwt from 'jsonwebtoken';
const db=new PrismaClient(),base='http://127.0.0.1:3010';
let server;
try {
 const lead=await db.lead.findFirstOrThrow({where:{partners:{some:{partner_status:'active'}},ground_rep:{active:true}},include:{ground_rep:true}});
 const head=await db.user.findFirstOrThrow({where:{role:'b2b_head',active:true}});
 const before=await Promise.all([db.callLog.count(),db.consultation.count(),db.tripLead.count(),db.activityLog.count()]);
 const log=openSync('/tmp/onboarded-actions-server.log','w');
 server=spawn(process.execPath,['node_modules/next/dist/bin/next','start','-p','3010','-H','127.0.0.1'],{stdio:['ignore',log,log]});
 let ready=false;for(let i=0;i<80;i++){try{if((await fetch(base+'/login')).ok){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,250));}assert.ok(ready);
 for(const [action,user,body] of [['calls',head,{notes:'Onboarded action rejection regression'}],['revisit',lead.ground_rep,{}]]){
  const r=await fetch(`${base}/api/leads/${lead.id}/${action}`,{method:'POST',headers:{'Content-Type':'application/json',authorization:`Bearer ${jwt.sign({id:user.id},process.env.JWT_SECRET,{expiresIn:'5m'})}`},body:JSON.stringify(body)});
  assert.equal(r.status,409,action+' rejects onboarded lead');assert.match((await r.json()).error,/Onboarded leads cannot/);
 }
 assert.deepEqual(await Promise.all([db.callLog.count(),db.consultation.count(),db.tripLead.count(),db.activityLog.count()]),before);
 console.log('PASS: onboarded calls and revisits rejected with 409; record counts unchanged.');
}finally{server?.kill();await db.$disconnect();}
