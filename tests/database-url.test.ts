import test from 'node:test';
import assert from 'node:assert/strict';
import {databaseUrl} from '../src/lib/database-url';
test('database pools are bounded without losing connection settings',()=>{
 const url=new URL(databaseUrl('postgresql://user:secret@localhost:5432/app?schema=public&sslmode=require')!);
 assert.equal(url.searchParams.get('connection_limit'),'5');
 assert.equal(url.searchParams.get('pool_timeout'),'10');
 assert.equal(url.searchParams.get('schema'),'public');
 assert.equal(url.searchParams.get('sslmode'),'require');
 const custom=new URL(databaseUrl('postgresql://localhost/app?connection_limit=2&pool_timeout=30')!);
 assert.equal(custom.searchParams.get('connection_limit'),'2');
 assert.equal(custom.searchParams.get('pool_timeout'),'30');
 assert.equal(databaseUrl(undefined),undefined);
});
