import {distributeWaitingCallers} from "../src/lib/calling/distribute";
import { spawn } from "node:child_process";
import { prisma } from "../src/lib/prisma";
import { processNextGeocode } from "../src/lib/mapping/jobs";
import { runColdReminders } from "../src/lib/cold/jobs";
let stopped = false,
  lastReminders = 0,
  lastRefreshCheck = 0,
  refreshRunning = false;
process.on("SIGINT", () => {
  stopped = true;
});
process.on("SIGTERM", () => {
  stopped = true;
});
async function main() {
  while (!stopped) {
    try {
      if (Date.now() - lastReminders > 60000) {
        await runColdReminders();
        await prisma.$transaction(tx=>distributeWaitingCallers(tx),{timeout:60000});
        lastReminders = Date.now();
      }
      // Due-date is persisted by the loader; this hourly check schedules monthly refreshes.
      if (
        process.env.OSM_AUTO_REFRESH !== "0" &&
        !refreshRunning &&
        Date.now() - lastRefreshCheck > 3600000
      ) {
        lastRefreshCheck = Date.now();
        refreshRunning = true;
        const child = spawn(
          process.execPath,
          ["--env-file=.env", "scripts/refresh-osm-poi.mjs"],
          { stdio: "inherit", env: process.env },
        );
        child.on("error", (error) => {
          refreshRunning = false;
          console.error("POI refresh:", error.message);
        });
        child.on("exit", () => {
          refreshRunning = false;
        });
      }
      const worked =
        process.env.GEOCODING_PAUSED === "1"
          ? false
          : await processNextGeocode();
      // Provider requests are already paced centrally; cached/local results need no delay.
      if (!worked) await new Promise((r) => setTimeout(r, 3000));
    } catch (e) {
      console.error("Data worker:", e instanceof Error ? e.message : e);
      await new Promise((r) => setTimeout(r, 5000));
    }
  }
  await prisma.$disconnect();
}
void main();
