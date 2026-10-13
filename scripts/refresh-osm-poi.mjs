import { spawn } from "node:child_process";
const child = spawn(
  process.env.OSM_PYTHON || ".cache/osm/venv/bin/python",
  ["scripts/refresh-osm-poi.py", ...process.argv.slice(2)],
  { stdio: "inherit", env: process.env },
);
child.on("error", (error) => {
  console.error(error.message);
  process.exitCode = 1;
});
child.on("exit", (code) => {
  process.exitCode = code ?? 1;
});
