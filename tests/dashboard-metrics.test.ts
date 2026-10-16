import test from 'node:test';
import assert from 'node:assert/strict';
import { summarizeChannels, channelFor, latestByLead } from '../src/lib/dashboard/metrics';
import { partnerType, partnerEmailName } from '../src/lib/partners/identity';
const entry=(id:string,lead_id:string,date:string,interest_level:string,channel:'ground'|'store'='ground')=>({id,lead_id,visit_date:date,interest_level,channel});
test('distinct consultation totals retain repeats and use latest dated rating/channel',()=>{
 const records=[entry('a','one','2026-01-02','High'),entry('b','one','2026-01-03','Medium','store'),entry('c','two','2026-01-01','Low')];
 const result=summarizeChannels(records,[{id:'partner',channel:'store'}]);
 assert.equal(result.consultedLeads,2);assert.equal(result.consultationRecords,3);assert.equal(result.repeatConsultations,1);assert.equal(result.channels.find(c=>c.key==='store')?.warm,1);assert.equal(result.channels.find(c=>c.key==='ground')?.cold,1);assert.equal(result.onboarded,1);
 assert.deepEqual(latestByLead(records).map(c=>c.id),['b','c']);
});
test('missing ratings remain accounted for and deterministic timestamp ties',()=>{
 const records=[entry('a','one','2026-01-02','High'),entry('z','one','2026-01-02','')];
 const result=summarizeChannels(records,[]);assert.equal(result.channels[0].unclassified,1);assert.equal(result.channels[0].hot,0);
});
test('explicit interaction and direct meetings override intake channel',()=>{
 assert.equal(channelFor({lead_source:'Walk-in',intake_team:'ground'}),'store');
 assert.equal(channelFor({lead_source:'Google Maps',intake_team:'caller'}),'caller');
 assert.equal(channelFor({lead_source:'LinkedIn',direct_store_meeting:true}),'store');
 assert.equal(channelFor({lead_source:'Walk-in',interaction_channel:'ground'}),'ground');
 assert.equal(channelFor({lead_source:'Walk-in',interaction_channel:'store',direct_store_meeting:true,rep_role:'ground_rep'}),'ground');
});
test('GST defaults partner classification and allows explicit override',()=>{
 assert.equal(partnerType('', 'GST123'),'Company');assert.equal(partnerType('', ''),'Individual');assert.equal(partnerType('Individual','GST123'),'Individual');assert.throws(()=>partnerType('other',''),RangeError);
});
test('email naming prefers legal name then lead identity',()=>{
 const p={company_firm_name:'Current name',company_legal_name:'Legal LLP',source_lead:{company_name:'Lead name'}};
 assert.equal(partnerEmailName(p),'Legal LLP');assert.equal(partnerEmailName({...p,company_legal_name:' '}),'Lead name');assert.equal(partnerEmailName({company_firm_name:'Partner'}),'Partner');
});

test('onboarding channel respects recorded acquisition source',async()=>{
 const {onboardingChannel}=await import('../src/lib/dashboard/metrics');
 assert.equal(onboardingChannel('Walk in (Direct)',null,'ground'),'store');
 assert.equal(onboardingChannel('Walk in (On Ground)',null,'store'),'ground');
 assert.equal(onboardingChannel('Other','Follow Up Call','ground'),'caller');
 assert.equal(onboardingChannel('Other','Old Onboardings','head'),'head');
});
