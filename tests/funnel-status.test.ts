import test from 'node:test';
import assert from 'node:assert/strict';
import { funnelStatus } from '../src/lib/leads/funnel-status';
const lead=(interest_level:string|null,outcome='Nurturing required')=>({status:'New',consultations:[{interest_level,outcome,visit_date:'2026-10-10T10:00:00Z'}]});
test('imported New leads derive hot, warm and cold from latest consultation',()=>{
 assert.equal(funnelStatus(lead('High')),'Hot');assert.equal(funnelStatus(lead('MEDIUM')),'Warm');assert.equal(funnelStatus(lead('low')),'Cold');assert.equal(funnelStatus(lead(null)),'Consulted');
});
test('active and pending onboarding take precedence over imported defaults',()=>{
 assert.equal(funnelStatus({...lead('Low'),partners:[{partner_status:'active'}]}),'Converted');
 assert.equal(funnelStatus({...lead('High'),partners:[{partner_status:'pending_review'}]}),'Onboarding Pending');
 assert.equal(funnelStatus({...lead('Medium'),partners:[{partner_status:'rejected'}]}),'Warm');
 assert.equal(funnelStatus(lead('High','On-boarding Done')),'Ready for Onboarding');
});
test('lost, review, location and visit outcomes are represented explicitly',()=>{
 assert.equal(funnelStatus(lead('High','Lost Lead - (does not do tiles business)')),'Lost');
 assert.equal(funnelStatus(lead('High','Wrong Location/Office closed')),'Needs Data Correction');
 assert.equal(funnelStatus(lead('High','Dont want commission')),'Needs Manager Review');
 assert.equal(funnelStatus({...lead('Medium'),store_visits:[{status:'scheduled'}]}),'Visit Scheduled');
});
test('unconsulted assignments do not appear as New',()=>{
 assert.equal(funnelStatus({status:'New',calling_associate_id:'caller'}),'Assigned');assert.equal(funnelStatus({status:'New'}),'New');
});
test('manual funnel edits last until a newer consultation; active onboarding remains authoritative',()=>{
 const edited={...lead('High'),activity_logs:[{new_value:'Cold',created_at:'2026-10-11T00:00:00Z'}]};
 assert.equal(funnelStatus(edited),'Cold');assert.equal(funnelStatus({...edited,partners:[{partner_status:'active'}]}),'Converted');
 assert.equal(funnelStatus({...edited,activity_logs:[{new_value:'Cold',created_at:'2026-10-09T00:00:00Z'}]}),'Hot');
});
