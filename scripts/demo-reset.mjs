import { spawnSync } from "node:child_process";
import "dotenv/config";

const result = process.platform === "win32"
  ? spawnSync("npm run seed", { stdio: "inherit", shell: true })
  : spawnSync("npm", ["run", "seed"], { stdio: "inherit" });
process.exit(result.status ?? 1);
