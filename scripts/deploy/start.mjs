import { spawn } from "node:child_process";
import { existsSync } from "node:fs";

function run(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, { stdio: "inherit", windowsHide: true });
    child.once("error", reject);
    child.once("exit", (code) =>
      code === 0 ? resolve() : reject(new Error("Deployment preparation failed.")),
    );
  });
}

// A failed migration must never start an application against a partial schema.
await run([".deploy/migrate.cjs"]);
if (process.env.SEED_BETA_CATALOG === "true") await run([".deploy/seed.cjs"]);
if (process.env.UPLOAD_PUBLIC_MEDIA === "true") await run([".deploy/media.cjs"]);
const standalone = process.env.MIRON_STANDALONE === "true";
const args = standalone
  ? ["server.js"]
  : existsSync(".next/standalone/server.js")
    ? [".next/standalone/server.js"]
    : ["node_modules/next/dist/bin/next", "start", "--hostname", "0.0.0.0"];
const app = spawn(process.execPath, args, {
  stdio: "inherit",
  windowsHide: true,
  env: { ...process.env, HOSTNAME: "0.0.0.0", PORT: process.env.PORT || "3000" },
});
for (const signal of ["SIGTERM", "SIGINT"]) process.on(signal, () => app.kill(signal));
app.once("error", () => {
  process.exitCode = 1;
});
app.once("exit", (code) => {
  process.exitCode = code ?? 1;
});
