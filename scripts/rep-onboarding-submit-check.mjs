import {PrismaClient} from '@prisma/client';
import jwt from 'jsonwebtoken';
import assert from 'node:assert/strict';
const db=new PrismaClient();let id;
try {
 const rep=await db.user.findFirstOrThrow({where:{role:'ground_rep',active:true}});
 const seed=await db.partner.findFirstOrThrow();
 const raw={...seed,company_firm_name:'Onboarding verification '+Date.now(),contact_person_name:'Test',designation:'Test',gst_certificate_url:null,pan_card_url:null,source_lead_id:null,expected_monthly_order_value:String(seed.expected_monthly_order_value)};
 const r=await fetch('http://127.0.0.1:3000/api/partners',{method:'POST',headers:{Authorization:'Bearer '+jwt.sign({id:rep.id},process.env.JWT_SECRET),'Content-Type':'application/json'},body:JSON.stringify(raw)});
 const d=await r.json();id=d.partner?.id;assert.equal(r.status,201,JSON.stringify(d));assert.equal(d.partner.partner_status,'pending_review');assert.match(d.partner.partner_code,/^FLZ-P-/);
 const denied=await fetch(`http://127.0.0.1:3000/api/partners/${id}`,{method:'PATCH',headers:{Authorization:'Bearer '+jwt.sign({id:rep.id},process.env.JWT_SECRET),'Content-Type':'application/json'},body:JSON.stringify({action:'activate',lead_gen_source:'CDT'})});assert.equal(denied.status,403);
 console.log('PASS actual ground-rep onboarding submission, generated code, pending status and approval denial');
}finally{if(id){await db.partnerActivity.deleteMany({where:{partner_id:id}});await db.partner.delete({where:{id}});}await db.$disconnect();}
