import {test} from 'node:test';
import assert from 'node:assert/strict';
import {importLocation} from '../src/lib/import-location';
test('coordinates accept numbers and strings without external geocoding',()=>{
 assert.deepEqual(importLocation({lat:'12.8955003',lng:77.5591656}),{valid:true,lat:12.8955003,lng:77.5591656,mismatch:false});
});
test('missing coordinates stay unset and partial/invalid coordinates need review',()=>{
 assert.equal(importLocation({lat:'',lng:''}),null);
 for(const raw of [{lat:12},{lat:'x',lng:77},{lat:77,lng:12}])assert.equal(importLocation(raw)?.valid,false);
});
test('sample academy matched to a park is flagged rather than confirmed',()=>{
 const result=importLocation({company_name:'AAAAA Ananth’s Academy Of Architecture & Allied Arts',matched_name:'Dr. APJ Abdul Kalam Park',lat:12.8955003,lng:77.5591656});
 assert.ok(result?.valid && result.mismatch);
});
