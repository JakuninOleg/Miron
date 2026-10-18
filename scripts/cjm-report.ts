import { existsSync } from "node:fs";
import { closeDb } from "../src/server/db";
import { readJourneyMetrics } from "../src/server/domain/journey-metrics";
async function main() {
  if (existsSync(".env.local")) process.loadEnvFile(".env.local");
  try {
    console.log(JSON.stringify(await readJourneyMetrics(Number(process.argv[2] ?? 30)), null, 2));
  } catch {
    console.error("Не удалось построить отчёт CJM. Проверь БД и период от 1 до 180 дней.");
    process.exitCode = 1;
  } finally {
    await closeDb();
  }
}
void main();
