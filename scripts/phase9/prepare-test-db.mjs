import { spawnSync } from "node:child_process";
import { writeFileSync } from "node:fs";
const url = new URL(process.env.DATABASE_URL);
const dbname = "leadmap_phase9_test";
const env = {
  ...process.env,
  PGHOST: url.hostname,
  PGPORT: url.port || "5432",
  PGUSER: decodeURIComponent(url.username),
  PGPASSWORD: decodeURIComponent(url.password),
  PGDATABASE: url.pathname.slice(1),
};
function run(bin, args, input, extra = {}) {
  const r = spawnSync("/opt/homebrew/bin/" + bin, args, {
    env: { ...env, ...extra },
    input,
    encoding: "utf8",
    maxBuffer: 50 * 1024 * 1024,
  });
  if (r.status !== 0)
    throw Error(r.stderr.replaceAll(env.PGPASSWORD, "[redacted]"));
  return r.stdout;
}
const exists = run("psql", [
  "-Atc",
  `SELECT 1 FROM pg_database WHERE datname='${dbname}'`,
]);
if (exists.trim())
  throw Error("Test database already exists; refusing to overwrite");
const schema = run("pg_dump", [
  "--schema-only",
  "--no-owner",
  "--no-privileges",
]);
run("psql", ["-v", "ON_ERROR_STOP=1", "-c", `CREATE DATABASE ${dbname}`]);
run("psql", ["-v", "ON_ERROR_STOP=1"], schema, { PGDATABASE: dbname });
run(
  "psql",
  [
    "-v",
    "ON_ERROR_STOP=1",
    "-f",
    "prisma/migrations/202610050001_route_workflow/migration.sql",
  ],
  undefined,
  { PGDATABASE: dbname },
);
url.pathname = "/" + dbname;
writeFileSync(
  "/private/tmp/phase9-test.env",
  `DATABASE_URL=${url.toString()}\nJWT_SECRET=phase9-isolated-test-secret\n`,
  { mode: 0o600 },
);
console.log(
  "Created isolated schema-only database and applied Phase 9 migration. No production rows copied or changed.",
);
