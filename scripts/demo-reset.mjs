import "dotenv/config";

import { spawnSync } from "node:child_process";

const result = spawnSync(process.execPath, ["scripts/seed.mjs"], {
  stdio: "inherit",
  shell: false
});

if (result.error) {
  console.error(result.error.message);
}

process.exit(result.status ?? 1);
