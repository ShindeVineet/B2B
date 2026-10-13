import fs from 'fs';
import Papa from 'papaparse';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const content = fs.readFileSync('Leads-Consultations.csv', 'utf8');
  const parsed = Papa.parse(content, { header: true, skipEmptyLines: true });
  const consultations = parsed.data as any[];

  const executives = new Set<string>();
  for (const row of consultations) {
    if (row['Name of Ground Executive']) {
      executives.add(row['Name of Ground Executive'].trim());
    }
  }

  const userMap = new Map<string, string>(); // name -> user.id

  console.log('Ensuring Ground Executives exist...');
  for (const name of executives) {
    if (!name) continue;
    // Generate a simple email
    const email = `${name.toLowerCase().replace(/[^a-z0-9]/g, '.')}@example.com`;
    let user = await prisma.user.findFirst({ where: { name } });
    if (!user) {
      user = await prisma.user.create({
        data: {
          name,
          email,
          password_hash: 'dummy',
          role: 'ground_rep'
        }
      });
      console.log(`Created new user: ${name}`);
    }
    userMap.set(name, user.id);
  }

  console.log('Updating consultations...');
  let updatedCount = 0;

  for (const row of consultations) {
    const execName = row['Name of Ground Executive']?.trim();
    if (!execName || !row.Lead_ID) continue;

    const repId = userMap.get(execName);
    if (!repId) continue;

    // We can also update the lead's assigned_ground_rep_id so it shows up in their ground rep dashboard
    // Dashboards usually query Leads by assigned_ground_rep_id
    try {
      await prisma.consultation.updateMany({
        where: { lead_id: row.Lead_ID },
        data: { rep_id: repId }
      });
      
      await prisma.lead.updateMany({
        where: { id: row.Lead_ID },
        data: { assigned_ground_rep_id: repId }
      });
      updatedCount++;
    } catch (e: any) {
      console.error(`Failed to update for Lead ID ${row.Lead_ID}:`, e.message);
    }
  }

  console.log(`Updated ${updatedCount} consultations/leads with the correct ground executive.`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
