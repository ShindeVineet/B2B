import test from 'node:test';
import assert from 'node:assert/strict';
import type { Consultation, Prisma } from '@prisma/client';
import { appendRevisit, type RevisitEntry } from '../src/lib/consultations/revisit-history';
import { completeDueFollowUp, followUpWindow } from '../src/lib/follow-ups/service';
const original = {id:'original',rep_id:'first-rep',visit_date:new Date('2026-10-17'),outcome:'Nurturing required',interest_level:'Medium',notes:'Original notes',next_follow_up_date:new Date('2026-10-22'),responses:{kind:'calling',follow_up_calls:[{call_id:'call-one'}],checklist:['Pitched']}} as unknown as Consultation;
const revisit: RevisitEntry={id:'revisit',visited_at:'2026-10-22T09:00:00.000Z',actor_id:'rep',staff_name:'Rep',trip_lead_id:'visit',channel:'ground',outcome:'Follow-up needed',notes:'Visit notes',next_follow_up_date:'2026-10-24'};
test('revisit preserves original identity, full answers and calls, with its own visit reference',()=>{
 const update=appendRevisit(original,revisit);
 for(const field of ['id','rep_id','visit_date','notes','trip_lead_id','interaction_channel','interest_level'])assert.equal(field in update,false);
 const response=update.responses as Record<string,unknown>;
 assert.deepEqual(response.revisits,[revisit]);assert.deepEqual(response.follow_up_calls,[{call_id:'call-one'}]);assert.deepEqual(response.checklist,['Pitched']);
 assert.equal(update.outcome,'Follow-up needed');assert.deepEqual(update.next_follow_up_date,new Date('2026-10-24'));
 assert.equal((response.original_consultation as Record<string,unknown>).outcome,'Nurturing required');
 const updated={...original,...update} as Consultation;
 assert.deepEqual(appendRevisit(updated,revisit),{});
 assert.equal(((appendRevisit(updated,{...revisit,id:'another'}).responses as Record<string,unknown>).revisits as unknown[]).length,2);
});
test('could not meet retains prior reminder; a successful revisit can clear it',()=>{
 assert.equal('next_follow_up_date' in appendRevisit(original,{...revisit,outcome:"Couldn't meet",next_follow_up_date:null}),false);
 assert.equal(appendRevisit(original,{...revisit,outcome:'Ready for onboarding',next_follow_up_date:null}).next_follow_up_date,null);
});
test('pending includes due today and all overdue dates without a lower bound',()=>{
 assert.deepEqual(followUpWindow('pending','2026-10-22'),{lte:new Date('2026-10-22')});
 assert.deepEqual(followUpWindow('today','2026-10-22'),{equals:new Date('2026-10-22')});
 assert.deepEqual(followUpWindow('overdue','2026-10-22'),{lt:new Date('2026-10-22')});
 assert.deepEqual(followUpWindow('upcoming','2026-10-22'),{gt:new Date('2026-10-22')});
});
test('successful contact completes only reminders due by the contact day, regardless of caller ownership',async()=>{
 let args: unknown;
 const tx={followUp:{updateMany:async(value:unknown)=>{args=value;return {count:1}}}} as unknown as Prisma.TransactionClient;
 await completeDueFollowUp(tx,'lead','2026-10-22');
 assert.deepEqual(args,{where:{lead_id:'lead',active:true,due_date:{lte:new Date('2026-10-22')}},data:{active:false}});
});
