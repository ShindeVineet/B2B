import { test } from 'node:test';
import assert from 'node:assert/strict';
import { interestBucket, isWonLead } from '../src/lib/leads/interest-bucket';
test('onboarded leads belong only to Won regardless of historical interest', () => {
  for (const interest of ['High', 'Medium', 'Low']) {
    assert.equal(interestBucket({ status: 'New', latest_interest_level: interest, partners: [{partner_status:'active'}] }), 'Won');
  }
  assert.equal(isWonLead({funnel_status:'Converted'}), true);
});
test('pending and deboarded partners remain eligible for interest follow-up', () => {
  for (const partner_status of ['pending_review', 'rejected']) {
    assert.equal(interestBucket({status:'Converted', latest_interest_level:'Medium', partners:[{partner_status}]}), 'Warm Leads');
  }
  assert.equal(interestBucket({latest_interest_level:'High'}), 'Hot Leads');
  assert.equal(interestBucket({latest_interest_level:'Low'}), 'Cold Leads');
  assert.equal(interestBucket({status:'New'}), null);
});
