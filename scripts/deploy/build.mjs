import { build } from "esbuild";
import { cp, mkdir } from "node:fs/promises";
import { spawnSync } from "node:child_process";

await mkdir(".deploy", { recursive: true });
await build({
  entryPoints: {
    migrate: "scripts/db-migrate.ts",
    seed: "scripts/db-seed.ts",
    media: "scripts/deploy/upload-media.ts",
  },
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
if (process.exitCode === 0) {
  await cp("public", ".next/standalone/public", { recursive: true });
  await cp(".next/static", ".next/standalone/.next/static", { recursive: true });
}
