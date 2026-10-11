import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { afterAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
import { closeDb, getDb } from "@/server/db";
import { consumeAuthRateLimit } from "./rate-limit";

const enabled = process.env.MIRON_AUTH_INTEGRATION_TESTS === "1";
function requireLocalDatabase() {
  const url = new URL(process.env.DATABASE_URL || "http://missing");
  if (!["127.0.0.1", "localhost", "[::1]"].includes(url.hostname) || url.port !== "55432") {
    throw new Error("Auth integration tests require the isolated local PostgreSQL on port 55432.");
  }
}

describe.skipIf(!enabled)("PostgreSQL auth rate limiter", () => {
  afterAll(async () => {
    await closeDb();
  });

  it("allows exactly eight concurrent attempts across database connections", async () => {
    requireLocalDatabase();
    const key = `integration:${randomUUID()}`;
    try {
      const results = await Promise.all(
        Array.from({ length: 20 }, () => consumeAuthRateLimit(key, 60, 8)),
      );
      expect(results.filter((result) => result.allowed)).toHaveLength(8);
      expect(results.filter((result) => !result.allowed)).toHaveLength(12);
      expect(results.every((result) => result.retryAfter >= 1 && result.retryAfter <= 60)).toBe(
        true,
      );
      const stored = await getDb().execute<{ count: number }>(
        sql`SELECT count FROM auth_rate_limits WHERE key = ${`guard:${key}`}`,
      );
      expect(stored.rows[0].count).toBe(9);
    } finally {
      await getDb().execute(sql`DELETE FROM auth_rate_limits WHERE key = ${`guard:${key}`}`);
    }
  });

  it("starts a fresh window after the persisted window has expired", async () => {
    requireLocalDatabase();
    const key = `integration:${randomUUID()}`;
    try {
      await consumeAuthRateLimit(key, 60, 1);
      expect((await consumeAuthRateLimit(key, 60, 1)).allowed).toBe(false);
      await getDb().execute(
        sql`UPDATE auth_rate_limits SET last_request = ${Date.now() - 61_000} WHERE key = ${`guard:${key}`}`,
      );
      expect((await consumeAuthRateLimit(key, 60, 1)).allowed).toBe(true);
    } finally {
      await getDb().execute(sql`DELETE FROM auth_rate_limits WHERE key = ${`guard:${key}`}`);
    }
  });
});
