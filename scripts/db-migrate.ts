import { existsSync } from "node:fs";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { closeDb, getDb } from "../src/server/db";
if (existsSync(".env.local")) process.loadEnvFile(".env.local");
if (!process.env.DATABASE_URL) throw new Error("Set DATABASE_URL for the intended database");
async function main() {
  try {
    await migrate(getDb(), { migrationsFolder: "./drizzle" });
    console.log("Database migrations applied.");
  } finally {
    await closeDb();
  }
}
void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
