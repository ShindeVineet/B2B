import { prisma as db } from "../src/lib/prisma";
import { checkMissedPatterns } from "../src/lib/phase5/missed-pattern";
let stopping = false;
async function run() {
  while (!stopping) {
    try {
      console.log("Missed-visit pattern check", await checkMissedPatterns(db));
    } catch (error) {
      console.error("Missed-visit pattern check failed", error);
    }
    if (!stopping) await new Promise((resolve) => setTimeout(resolve, 60000));
  }
  await db.$disconnect();
}
process.on("SIGTERM", () => {
  stopping = true;
});
process.on("SIGINT", () => {
  stopping = true;
});
void run();
