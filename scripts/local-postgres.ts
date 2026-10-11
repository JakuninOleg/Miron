import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import EmbeddedPostgres from "embedded-postgres";
import { Client } from "pg";

async function main() {
  const root = process.cwd();
  const directory = resolve(root, ".local/postgres");
  if (process.env.NODE_ENV === "production") throw new Error("Local database is development only");
  if (process.argv[2] === "stop") {
    const require = createRequire(resolve(root, "package.json"));
    const entry = require.resolve("@embedded-postgres/windows-x64");
    const bin = resolve(entry, "../../native/bin/pg_ctl.exe");
    const result = spawnSync(bin, ["-D", directory, "-m", "fast", "stop"], {
      stdio: "inherit",
      windowsHide: true,
    });
    process.exitCode = result.status ?? 1;
    return;
  }
  mkdirSync(resolve(root, ".local"), { recursive: true });
  const envPath = resolve(root, ".env.local");
  let content = existsSync(envPath) ? readFileSync(envPath, "utf8") : "";
  const credentialsPath = resolve(root, ".local/postgres-credentials.json");
  const credentials: { password: string } = existsSync(credentialsPath)
    ? JSON.parse(readFileSync(credentialsPath, "utf8"))
    : { password: randomBytes(24).toString("hex") };
  if (!existsSync(credentialsPath))
    writeFileSync(credentialsPath, JSON.stringify(credentials), { mode: 0o600 });
  const defaults: Record<string, string> = {
    DATABASE_URL: `postgresql://miron:${credentials.password}@127.0.0.1:55432/miron`,
    BETTER_AUTH_SECRET: randomBytes(32).toString("hex"),
    BETTER_AUTH_URL: "http://localhost:3000",
    SMTP_HOST: "127.0.0.1",
    SMTP_PORT: "1025",
    SMTP_FROM: "MIRON <hello@miron.local>",
    ENABLE_DEMO_WORKOUTS: "true",
    ENABLE_QWEN: "false",
  };
  for (const [key, value] of Object.entries(defaults))
    if (!new RegExp(`^${key}=`, "m").test(content)) content += `\n${key}=${value}\n`;
  writeFileSync(envPath, content, { mode: 0o600 });
  const postgres = new EmbeddedPostgres({
    databaseDir: directory,
    user: "miron",
    password: credentials.password,
    port: 55432,
    persistent: true,
    authMethod: "scram-sha-256",
    createPostgresUser: false,
    initdbFlags: ["--encoding=UTF8", "--locale=C"],
    postgresFlags: ["-c", "listen_addresses=127.0.0.1", "-c", "max_connections=60"],
    onLog: (message) => console.log(message.replaceAll(credentials.password, "[redacted]")),
    onError: (error) => console.error(String(error).replaceAll(credentials.password, "[redacted]")),
  });
  if (!existsSync(resolve(directory, "PG_VERSION"))) await postgres.initialise();
  if (process.platform === "win32") {
    const require = createRequire(resolve(root, "package.json"));
    const entry = require.resolve("@embedded-postgres/windows-x64");
    const bin = resolve(entry, "../../native/bin/pg_ctl.exe");
    const status = spawnSync(bin, ["-D", directory, "status"], { windowsHide: true });
    if (status.status !== 0) {
      const launch = spawnSync(
        bin,
        [
          "-D",
          directory,
          "-l",
          resolve(root, ".local/postgres.log"),
          "-o",
          "-h 127.0.0.1 -p 55432 -c max_connections=60",
          "-w",
          "start",
        ],
        { stdio: "inherit", windowsHide: true },
      );
      if (launch.status !== 0) throw new Error("PostgreSQL pg_ctl failed; see .local/postgres.log");
    }
  } else await postgres.start();
  const client = new Client({
    host: "127.0.0.1",
    port: 55432,
    user: "miron",
    password: credentials.password,
    database: "postgres",
  });
  await client.connect();
  const result = await client.query("SELECT 1 FROM pg_database WHERE datname = $1", ["miron"]);
  if (!result.rowCount) await client.query('CREATE DATABASE "miron"');
  await client.end();
  console.log(
    "MIRON development PostgreSQL ready on 127.0.0.1:55432. Credentials saved to ignored .env.local.",
  );
  if (process.platform !== "win32") setInterval(() => undefined, 60_000);
}
main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
