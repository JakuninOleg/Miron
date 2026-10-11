import { build } from "esbuild";
import { mkdir } from "node:fs/promises";
import { spawnSync } from "node:child_process";

await mkdir(".deploy", { recursive: true });
await build({
  entryPoints: { migrate: "scripts/db-migrate.ts", seed: "scripts/db-seed.ts" },
  outdir: ".deploy",
  outExtension: { ".js": ".cjs" },
  platform: "node",
  target: "node22",
  format: "cjs",
  bundle: true,
  packages: "bundle",
  external: ["pg", "pg-native"],
  sourcemap: false,
});
const result = spawnSync(process.execPath, ["node_modules/next/dist/bin/next", "build"], {
  stdio: "inherit",
  windowsHide: true,
});
process.exitCode = result.status ?? 1;
