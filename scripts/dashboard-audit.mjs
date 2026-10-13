import { PrismaClient } from '@prisma/client';
import { writeFileSync } from 'node:fs';
const db=new PrismaClient();
try {
 const report={
  totals:await db.$queryRaw`SELECT (SELECT count(*)::int FROM leads) leads, (SELECT count(*)::int FROM consultations) consultations, (SELECT count(DISTINCT lead_id)::int FROM consultations) consulted_leads, (SELECT count(*)::int FROM leads WHERE assigned_ground_rep_id IS NOT NULL) assigned_ground, (SELECT count(*)::int FROM partners) partners`,
  byRep:await db.$queryRaw`SELECT u.id,u.name,u.role, (SELECT count(*)::int FROM leads l WHERE l.assigned_ground_rep_id=u.id) assigned, (SELECT count(*)::int FROM consultations c WHERE c.rep_id=u.id) consultations, (SELECT count(DISTINCT c.lead_id)::int FROM consultations c WHERE c.rep_id=u.id) consulted_leads FROM users u WHERE EXISTS(SELECT 1 FROM consultations c WHERE c.rep_id=u.id) OR EXISTS(SELECT 1 FROM leads l WHERE l.assigned_ground_rep_id=u.id)`,
  repeated:await db.$queryRaw`SELECT lead_id,count(*)::int records,count(DISTINCT rep_id)::int reps FROM consultations GROUP BY lead_id HAVING count(*)>1 ORDER BY count(*) DESC`,
  assignmentMismatch:await db.$queryRaw`SELECT count(*)::int FROM consultations c JOIN leads l ON l.id=c.lead_id WHERE l.assigned_ground_rep_id IS DISTINCT FROM c.rep_id`,
  chronology:await db.$queryRaw`SELECT min(visit_date),max(visit_date),count(DISTINCT visit_date)::int dates,count(*) FILTER (WHERE responses IS NOT NULL)::int with_responses FROM consultations`,
  sources:await db.$queryRaw`SELECT lead_source,intake_team,count(*)::int FROM leads GROUP BY 1,2 ORDER BY count(*) DESC`,
  missingOnboardingHistory:await db.$queryRaw`SELECT count(*)::int FROM partners p WHERE p.partner_status='active' AND NOT EXISTS(SELECT 1 FROM consultations c WHERE c.lead_id=p.source_lead_id)`,
  queueAssignments:await db.$queryRaw`SELECT intake_team,count(*)::int leads,count(calling_associate_id)::int caller_assigned FROM leads GROUP BY 1`,
  partners:await db.$queryRaw`SELECT partner_status,count(*)::int FROM partners GROUP BY 1`,
  migrations:await db.$queryRaw`SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NOT NULL ORDER BY migration_name`,
 };
 writeFileSync(process.argv.includes('--after') ? '.data/audits/dashboard-after.json' : '.data/audits/dashboard-before.json',JSON.stringify(report,null,2),{mode:0o600});
 console.log(JSON.stringify(report,null,2));
} catch(e){console.error(e.code||e.name,e.message?.split('\n').at(-1));process.exitCode=1;} finally {await db.$disconnect();}
