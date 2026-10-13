import {PrismaClient} from '@prisma/client';
import {spawnSync} from 'node:child_process';
import {mkdir,readFile} from 'node:fs/promises';
const db=new PrismaClient();
try{
 const url=new URL(process.env.DATABASE_URL),folder='/private/tmp/b2b-db-backups';
 await mkdir(folder,{recursive:true});const backup=folder+'/before-local-poi-'+Date.now()+'.dump';
 const env={...process.env,PGHOST:url.hostname,PGPORT:url.port||'5432',PGUSER:decodeURIComponent(url.username),PGPASSWORD:decodeURIComponent(url.password),PGDATABASE:decodeURIComponent(url.pathname.slice(1))};
 const dumped=spawnSync('/opt/homebrew/bin/pg_dump',['--format=custom','--file',backup],{env,encoding:'utf8'});
 if(dumped.status!==0)throw Error('Database backup failed; migration not applied');
 for (const sql of (await readFile('prisma/migrations/202610030001_local_poi_queue/migration.sql','utf8')).split(';').filter(s=>s.trim())) await db.$executeRawUnsafe(sql);
 console.log('Local POI tables and retry columns enabled. Backup: '+backup);
}finally{await db.$disconnect();}
