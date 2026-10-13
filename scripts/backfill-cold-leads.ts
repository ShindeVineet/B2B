// Idempotent compatibility backfill: historical consultations are not rewritten.
import { prisma } from "../src/lib/prisma";
import { evaluateCold } from "../src/lib/cold/service";
async function main() {
  const leads = await prisma.lead.findMany({
    include: { consultations: { orderBy: { created_at: "desc" }, take: 1 } },
  });
  for (const lead of leads)
    if (lead.consultations[0])
      await prisma.$transaction((tx) =>
        evaluateCold(tx, lead, lead.consultations[0]),
      );
  console.log(
    `Evaluated ${leads.filter((l) => l.consultations.length).length} leads with consultation history`,
  );
}
main().finally(() => prisma.$disconnect());
