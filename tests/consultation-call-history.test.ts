import test from 'node:test';
import assert from 'node:assert/strict';
import type { Consultation, Prisma } from '@prisma/client';
import { appendConsultationCall, attachConsultationCall, type ConsultationCall } from '../src/lib/consultations/call-history';
const original = { id: 'consultation-17', lead_id: 'lead', rep_id: 'original-author', visit_date: new Date('2026-10-17'), interest_level: 'High', next_follow_up_date: new Date('2026-10-19'), notes: 'Original notes', outcome: 'Nurturing required', responses: { kind: 'calling', notes: 'Original notes', interest_level: 'High', checklist: ['Pitched'] } } as unknown as Consultation;
const call: ConsultationCall = { call_id: 'call-21', called_at: '2026-10-21T10:00:00.000Z', caller: 'Another caller', actor_id: 'another-user', outcome: 'Call picked', notes: 'Outside now', interest_level: 'Medium', next_follow_up_date: '2026-10-26', whatsapp_group_created: false };
test('follow-up retains original identity/date/author/answers and records current interest separately', () => {
 const patch=appendConsultationCall(original,call);
 assert.equal(patch.interest_level,'Medium');
 assert.deepEqual(patch.next_follow_up_date,new Date('2026-10-26'));
 for(const field of ['id','visit_date','rep_id','notes','outcome','interaction_channel']) assert.equal(field in patch,false);
 const response=patch.responses as Record<string, unknown>;
 assert.deepEqual(response.follow_up_calls,[call]);
 assert.equal(response.notes,'Original notes');
 assert.deepEqual(response.checklist,['Pitched']);
 assert.equal((response.original_consultation as Record<string, unknown>).interest_level,'High');
});
test('unanswered attempt adds history without overwriting interest or consultation reminder', () => {
 const patch=appendConsultationCall(original,{...call,interest_level:null,outcome:'Call not picked'});
 assert.equal('interest_level' in patch,false);
 assert.equal('next_follow_up_date' in patch,false);
 assert.equal((patch.responses as Record<string, unknown[]>).follow_up_calls.length,1);
});
test('multiple calls retain history and original snapshot; same call cannot be appended twice', () => {
 const first=appendConsultationCall(original,call);
 const updated={...original,...first} as Consultation;
 assert.deepEqual(appendConsultationCall(updated,call),{});
 const second=appendConsultationCall(updated,{...call,call_id:'call-22',interest_level:'Low',next_follow_up_date:null});
 const response=second.responses as Record<string, unknown>;
 assert.equal((response.follow_up_calls as unknown[]).length,2);
 assert.equal((response.original_consultation as Record<string,unknown>).interest_level,'High');
 assert.equal(second.next_follow_up_date,null);
});
test('existing consultation is updated, no consultation is created; no prior consultation returns null', async () => {
 let writes=0;
 const tx={consultation:{findFirst:async()=>original,update:async(args:{where:{id:string}})=>{assert.equal(args.where.id,original.id);writes++;return original}}} as unknown as Prisma.TransactionClient;
 assert.equal((await attachConsultationCall(tx,'lead',call))?.id,original.id);
 assert.equal(writes,1);
 const empty={consultation:{findFirst:async()=>null}} as unknown as Prisma.TransactionClient;
 assert.equal(await attachConsultationCall(empty,'lead',call),null);
});
