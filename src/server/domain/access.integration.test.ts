import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { closeDb, getDb } from "../db";
import { user, trials } from "../db/schema";
import { initializeAccount } from "./profile";
import { readProductAccess, assertProductAccess } from "./access";
import { exportAccountData } from "./account-export";
import { readJourneyMetrics } from "./journey-metrics";
if (existsSync(".env.local")) process.loadEnvFile(".env.local");
describe.runIf(process.env.RUN_DB_TESTS === "true")("registration trial and archive", () => {
  const owner = randomUUID();
  const registeredAt = new Date(Date.now() - 14 * 86400000);
  let created = false;
  beforeAll(async () => {
    const url = new URL(process.env.DATABASE_URL ?? "");
    if (
      !["localhost", "127.0.0.1"].includes(url.hostname) ||
      url.port !== "55432" ||
      url.pathname !== "/miron"
    )
      throw new Error("Access fixtures require local PostgreSQL:55432/miron.");
    await getDb()
      .insert(user)
      .values({
        id: owner,
        name: "Access fixture",
        email: `${owner}@example.test`,
        emailVerified: true,
        createdAt: registeredAt,
      });
    created = true;
  });
  afterAll(async () => {
    if (created) await getDb().delete(user).where(eq(user.id, owner));
    await closeDb();
  });
  it("pins first initialization to registration and never restarts it on another entry", async () => {
    await initializeAccount(owner);
    const first = await readProductAccess(owner);
    expect(first.mode).toBe("archive");
    expect(Date.parse(first.startsAt)).toBe(registeredAt.getTime());
    expect(Date.parse(first.endsAt) - Date.parse(first.startsAt)).toBe(168 * 3600000);
    await initializeAccount(owner);
    expect((await readProductAccess(owner)).endsAt).toBe(first.endsAt);
    await expect(assertProductAccess(owner)).rejects.toMatchObject({
      code: "PRODUCT_ACCESS_EXPIRED",
    });
    expect((await exportAccountData(owner)).account.id).toBe(owner);
    await getDb()
      .update(trials)
      .set({ startsAt: new Date(), endsAt: new Date(Date.now() + 3600000), used: 100 })
      .where(eq(trials.userId, owner));
    const full = await readProductAccess(owner);
    expect(full.mode).toBe("trial");
    expect(full.remainingReplies).toBe(0);
    await expect(assertProductAccess(owner)).resolves.toBeUndefined();
  });
  it("reports aggregate first value without personal data or fabricated results", async () => {
    await expect(readJourneyMetrics(181)).rejects.toThrow();
    const before = await readJourneyMetrics(1);
    const fresh = randomUUID();
    try {
      await getDb()
        .insert(user)
        .values({
          id: fresh,
          name: "Funnel fixture",
          email: `${fresh}@example.test`,
          emailVerified: true,
        });
      await initializeAccount(fresh);
      const after = await readJourneyMetrics(1);
      expect(after.registered).toBe(before.registered + 1);
      expect(after.started).toBe(before.started);
      expect(after.with_result).toBe(before.with_result);
      expect(JSON.stringify(after)).not.toContain(fresh);
    } finally {
      await getDb().delete(user).where(eq(user.id, fresh));
    }
  });
});
