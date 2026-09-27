// A minimal Node ESM loader hook so a plain `node scripts/*.mjs` script can import files that
// use the project's `@/*` -> `src/*` path alias (tsconfig.json), the same alias Next.js's own
// bundler already understands. Nothing else in the project needs this: existing scripts and
// tests only ever import self-contained lib files with no `@/` imports of their own. Register
// with `node --import ./scripts/alias-loader.mjs <script>` or `module.register()` from a script.
import { pathToFileURL } from "node:url";
import { existsSync } from "node:fs";
import path from "node:path";

const projectRoot = path.resolve(import.meta.dirname, "..");

export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith("@/")) {
    const base = path.join(projectRoot, "src", specifier.slice(2));
    const direct = `${base}.ts`;
    const resolved = existsSync(direct) ? direct : path.join(base, "index.ts");
    return nextResolve(pathToFileURL(resolved).href, context);
  }
  return nextResolve(specifier, context);
}
