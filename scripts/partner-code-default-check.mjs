import {PrismaClient} from '@prisma/client';
import assert from 'node:assert/strict';
const db=new PrismaClient();
try {
 const old=await db.partner.findFirstOrThrow();
 const rollback=Error('verification rollback');
 try { await db.$transaction(async tx=>{
  const {id,partner_code,created_at,updated_at,...data}=old;
  const a=await tx.partner.create({data});
  const b=await tx.partner.create({data});
  assert.match(a.partner_code,/^FLZ-P-\d{4,}$/);
  assert.notEqual(a.partner_code,b.partner_code);
  assert.equal(BigInt(b.partner_code.slice(6)),BigInt(a.partner_code.slice(6))+1n);
  throw rollback;
 }); } catch(e){if(e!==rollback)throw e;}
 console.log('PASS PostgreSQL default generates distinct incremental codes with no supplied partner_code; fixture inserts rolled back');
}finally{await db.$disconnect();}
