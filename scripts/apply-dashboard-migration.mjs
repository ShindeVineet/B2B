import { spawnSync } from 'node:child_process';
import { mkdirSync, chmodSync } from 'node:fs';
import { PrismaClient } from '@prisma/client';
const db=new PrismaClient();
try {
 const migration='202610110001_dashboard_workflows';
 const applied=await db.$queryRaw`SELECT migration_name FROM _prisma_migrations WHERE migration_name=${migration} AND finished_at IS NOT NULL`;
 if(applied.length){console.log('Migration already recorded');process.exitCode=0;}
 else {
  mkdirSync('.data/backups',{recursive:true});
  const file=`.data/backups/dashboard-${new Date().toISOString().replaceAll(':','-')}.dump`;
  const url=new URL(process.env.DATABASE_URL);const env={...process.env,PGHOST:url.hostname,PGPORT:url.port||'5432',PGUSER:decodeURIComponent(url.username),PGPASSWORD:decodeURIComponent(url.password),PGDATABASE:url.pathname.slice(1)};
  let result=spawnSync('pg_dump',['--format=custom','--no-owner','--no-acl','--file',file],{env,encoding:'utf8'});
  if(result.status!==0)throw Error('Backup failed');
  chmodSync(file,0o600);
  console.log('Backup saved: '+file);
  for(const args of [['prisma','db','execute','--file',`prisma/migrations/${migration}/migration.sql`,'--schema','prisma/schema.prisma'],['prisma','migrate','resolve','--applied',migration]]){
   result=spawnSync('npx',args,{env:process.env,encoding:'utf8'});if(result.status!==0)throw Error('Migration command failed: '+result.stderr);console.log(result.stdout);
  }
 }
} finally {await db.$disconnect();}
