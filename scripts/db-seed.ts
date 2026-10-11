import { existsSync } from "node:fs";
import { closeDb } from "../src/server/db";
import { seedCatalog } from "../src/server/db/seed";
if (existsSync(".env.local")) process.loadEnvFile(".env.local");
if (!process.env.DATABASE_URL) throw new Error("Set DATABASE_URL for the intended database");
async function main() {
  try {
    console.log(await seedCatalog());
  } finally {
    await closeDb();
  }
}
void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
