import bcrypt from "bcryptjs";
import { prisma } from "../src/lib/prisma";
import { TEAM_PERSONAS, PERSONA_STORE } from "../src/lib/personas";

async function main() {
  const stores = await prisma.store.findMany({
    where: {
      name: { equals: PERSONA_STORE, mode: "insensitive" },
      active: true,
    },
  });
  if (stores.length !== 1)
    throw Error(
      "Expected exactly one active Florzy Experience Center; no changes made.",
    );
  const store = stores[0];
  // Match by name as well as login to avoid creating duplicate real people.
  const users = await prisma.user.findMany();
  const matches = TEAM_PERSONAS.map((person) => {
    const found = users.filter(
      (u) =>
        u.email === person.email ||
        u.name
          .replace(/\s*\(.*\)$/, "")
          .trim()
          .toLowerCase() === person.name.toLowerCase(),
    );
    if (found.length > 1)
      throw Error(`Ambiguous account for ${person.name}; no changes made.`);
    if (found[0] && found[0].email !== person.email)
      throw Error(
        `Existing login differs for ${person.name}; reconcile persona configuration first.`,
      );
    return { person, existing: found[0] };
  });
  const password_hash = await bcrypt.hash("LeadMap@123", 10);
  const result = await prisma.$transaction(async (tx) => {
    const rows = [];
    for (const { person, existing } of matches) {
      const data = {
        name: person.name,
        role: person.role,
        store_id: store.id,
        region: store.region,
        active: true,
      };
      rows.push(
        existing
          ? await tx.user.update({ where: { id: existing.id }, data })
          : await tx.user.create({
              data: { ...data, email: person.email, password_hash },
            }),
      );
    }
    return rows.map(({ name, role }) => ({ name, role, store: store.name }));
  });
  console.log(JSON.stringify(result, null, 2));
}
main()
  .catch((e) => {
    console.error(e.message);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
