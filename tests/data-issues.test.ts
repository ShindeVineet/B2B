import { test } from 'node:test';
import assert from 'node:assert/strict';
import { currentDataIssues } from '../src/lib/leads/data-issues';
const consultation = {outcome:'Wrong Location/Office closed',interest_level:'Low',visit_date:'2026-09-01',created_at:'2026-09-01'};
test('consultation correction flags are visible without geocode flags',()=>{
 assert.deepEqual(currentDataIssues({status:'New',geocode_status:'ok',consultations:[consultation]}),['Wrong Location/Office closed']);
});
test('latest consultation and onboarding precedence match the funnel',()=>{
 assert.deepEqual(currentDataIssues({status:'New',consultations:[{...consultation,outcome:'Nurturing required'}]}),[]);
 assert.deepEqual(currentDataIssues({status:'New',consultations:[consultation],partners:[{partner_status:'active'}]}),[]);
 assert.deepEqual(currentDataIssues({status:'New',consultations:[consultation],activity_logs:[{new_value:'Warm',created_at:'2026-10-01'}]}),[]);
});
test('geocode problems remain visible even on onboarded leads',()=>{
 assert.deepEqual(currentDataIssues({status:'New',geocode_status:'mismatch_flagged',partners:[{partner_status:'active'}]}),['Location: mismatch_flagged']);
});
