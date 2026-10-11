import "server-only";
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { getDb } from "@/server/db";

/** Single SQL statement: concurrent instances cannot lose increments. */
export async function consumeAuthRateLimit(key: string, windowSeconds: number, max: number) {
  const windowMs = windowSeconds * 1_000;
  const result = await getDb().execute<{
    count: number;
    last_request: string;
    measured_at: string;
  }>(sql`
    INSERT INTO auth_rate_limits (id, key, count, last_request)
    VALUES (${randomUUID()}::uuid, ${`guard:${key}`}, 1,
      floor(extract(epoch from statement_timestamp()) * 1000)::bigint)
    ON CONFLICT (key) DO UPDATE SET
      count = CASE WHEN auth_rate_limits.last_request <= EXCLUDED.last_request - ${windowMs}
        THEN 1 ELSE LEAST(auth_rate_limits.count + 1, ${max + 1}) END,
      last_request = CASE WHEN auth_rate_limits.last_request <= EXCLUDED.last_request - ${windowMs}
        THEN EXCLUDED.last_request ELSE auth_rate_limits.last_request END
    RETURNING count, last_request,
      floor(extract(epoch from clock_timestamp()) * 1000)::bigint AS measured_at
  `);
  const row = result.rows[0];
  if (!row) throw new Error("Unable to establish auth rate limit.");
  return {
    allowed: row.count <= max,
    retryAfter: Math.max(
      1,
      Math.min(
        windowSeconds,
        Math.ceil((Number(row.last_request) + windowMs - Number(row.measured_at)) / 1_000),
      ),
    ),
  };
}
