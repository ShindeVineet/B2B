import { PrismaClient } from '@prisma/client';
import { funnelStatus } from '../src/lib/leads/funnel-status';
import assert from 'node:assert/strict';
const db=new PrismaClient();
async function main() {
try {
 const rows=await db.lead.findMany({select:{status:true,assigned_store_id:true,assigned_ground_rep_id:true,calling_associate_id:true,partners:{select:{partner_status:true}},consultations:{orderBy:[{visit_date:'desc'},{created_at:'desc'},{id:'desc'}],take:1,select:{outcome:true,interest_level:true,visit_date:true,created_at:true}},store_visits:{where:{status:'scheduled'},select:{status:true}},activity_logs:{where:{action:'FUNNEL_STATUS_UPDATED'},orderBy:{created_at:'desc'},take:1,select:{new_value:true,created_at:true}}}});
 const stored:Record<string,number>={},funnel:Record<string,number>={};
 for(const row of rows){stored[row.status]=(stored[row.status]||0)+1;const stage=funnelStatus(row);funnel[stage]=(funnel[stage]||0)+1;if(row.partners.some(p=>p.partner_status==='active'))assert.equal(stage,'Converted');if(row.consultations.length&&!row.activity_logs.length)assert.notEqual(stage,'New');}
 console.log(JSON.stringify({leads:rows.length,stored,funnel},null,2));
} finally {await db.$disconnect();}

}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
