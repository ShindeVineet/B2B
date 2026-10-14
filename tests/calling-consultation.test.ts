import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCallingConsultation, callingFormFor } from '../src/lib/consultations/calling';

test('unanswered calls schedule next calendar day and discard hidden consultation values', () => {
  assert.deepEqual(parseCallingConsultation({ call_picked: false, interest_level: 'High', whatsapp_group_created: true, next_follow_up_date: '2099-01-01' }, '2026-12-31'), { picked: false, interest: null, followUp: '2027-01-01', group: undefined });
  assert.equal(parseCallingConsultation({ call_picked: false }, '2028-02-28').followUp, '2028-02-29');
});
test('answered calls need only interest and group state; follow-up is optional', () => {
  assert.deepEqual(parseCallingConsultation({ call_picked: true, interest_level: 'Medium', whatsapp_group_created: false }, '2026-10-14'), { picked: true, interest: 'Medium', group: false, followUp: null });
  for (const patch of [{ call_picked: 'No' }, { interest_level: '' }, { whatsapp_group_created: 'true' }, { next_follow_up_date: '2026-10-13' }, { next_follow_up_date: '2026-02-30' }]) {
    assert.throws(() => parseCallingConsultation({ call_picked: true, interest_level: 'High', whatsapp_group_created: true, ...patch }, '2026-10-14'));
  }
});
test('calling sources use compact form; assigned field visits and ground reps retain full form', () => {
  for (const lead_source of ['Phone', 'CDT', 'LinkedIn']) {
    assert.equal(callingFormFor({ lead_source }, 'store_associate'), true);
    assert.equal(callingFormFor({ lead_source }, 'b2b_head', 'visit-id'), false);
    assert.equal(callingFormFor({ lead_source }, 'ground_rep'), false);
  }
  assert.equal(callingFormFor({ lead_source: 'Google Maps' }, 'b2b_head'), false);
});
