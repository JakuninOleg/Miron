import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

let database: NodePgDatabase<typeof schema> | undefined;
let pool: Pool | undefined;
export function getDb() {
  if (!database) {
    if (!process.env.DATABASE_URL)
      throw new Error("DATABASE_URL is required for account and training storage");
    const max = Number(process.env.DB_POOL_MAX ?? 10);
    if (!Number.isInteger(max) || max < 1 || max > 100)
      throw new Error("DB_POOL_MAX must be an integer between 1 and 100");
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max,
      connectionTimeoutMillis: 5000,
      idleTimeoutMillis: 30000,
      statement_timeout: 15000,
      query_timeout: 20000,
    });
    database = drizzle(pool, { schema });
  }
  return database;
}
// Resolve lazily: builds and the local demonstration need no database connection.
export const db = new Proxy({} as NodePgDatabase<typeof schema>, {
  get(_target, key) {
    const value = Reflect.get(getDb(), key);
    return typeof value === "function" ? value.bind(getDb()) : value;
  },
});
export async function closeDb() {
  await pool?.end();
  database = undefined;
  pool = undefined;
}
