import {test} from 'node:test';
import assert from 'node:assert/strict';
import {leadGenSource,LEAD_GEN_SOURCES} from '../src/lib/partners/lead-gen-source';
test('source required and Other needs explanation',()=>{
 assert.throws(()=>leadGenSource({}));
 assert.throws(()=>leadGenSource({lead_gen_source:'Other'}));
 assert.deepEqual(leadGenSource({lead_gen_source:'Other',lead_gen_source_other:' Campaign '}),{lead_gen_source:'Other',lead_gen_source_other:'Campaign'});
 for(const source of LEAD_GEN_SOURCES.filter(s=>s!=='Other')) assert.equal(leadGenSource({lead_gen_source:source,lead_gen_source_other:'ignored'}).lead_gen_source_other,null);
});
