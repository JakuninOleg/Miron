import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { closeDb, getDb } from "../db";
import { plans, recordedSets, user, variantRevisions, workouts, workoutSteps } from "../db/schema";
import { getProgress } from "./profile";
import { exportAccountData } from "./account-export";
import { listJourneyReads, markJourneyRead } from "./journey-read";
import {
  listCommunicationMemory,
  readCommunicationMemory,
  saveCommunicationMemory,
} from "./communication-memory";

if (existsSync(".env.local")) process.loadEnvFile(".env.local");

describe.runIf(process.env.RUN_DB_TESTS === "true")("confirmed account story days", () => {
  const alice = randomUUID();
  const bob = randomUUID();
  let created = false;
  beforeAll(async () => {
    const url = new URL(process.env.DATABASE_URL ?? "");
    if (
      !["localhost", "127.0.0.1"].includes(url.hostname) ||
      url.port !== "55432" ||
      url.pathname !== "/miron"
    )
      throw new Error("Story fixtures require local PostgreSQL:55432/miron.");
    await getDb()
      .insert(user)
      .values(
        [alice, bob].map((id) => ({
          id,
          name: "Story fixture",
          email: `${id}@example.test`,
          emailVerified: true,
        })),
      );
    created = true;
  });
  afterAll(async () => {
    if (created)
      await getDb()
        .delete(user)
        .where(inArray(user.id, [alice, bob]));
    await closeDb();
  });

  it("keeps voluntary communication preferences scoped and deletable without storing inferred traits", async () => {
    const base = {
      operationId: randomUUID(),
      scope: "shared",
      expectedRevision: 0,
      preferences: { tone: "calm", emoji: "none" },
    };
    const [first, retry] = await Promise.all([
      saveCommunicationMemory(alice, base),
      saveCommunicationMemory(alice, base),
    ]);
    expect(retry).toEqual(first);
    await saveCommunicationMemory(alice, {
      operationId: randomUUID(),
      scope: "lika",
      expectedRevision: 0,
      preferences: { tone: "friendly" },
    });
    expect(await readCommunicationMemory(alice, "max")).toEqual({ tone: "calm", emoji: "none" });
    expect(await readCommunicationMemory(alice, "lika")).toEqual({
      tone: "friendly",
      emoji: "none",
    });
    expect(await readCommunicationMemory(bob, "lika")).toEqual({});
    await expect(
      saveCommunicationMemory(alice, { ...base, operationId: randomUUID() }),
    ).rejects.toMatchObject({ code: "REVISION_CONFLICT" });
    await saveCommunicationMemory(alice, {
      operationId: randomUUID(),
      scope: "shared",
      expectedRevision: 1,
      preferences: {},
    });
    expect(await readCommunicationMemory(alice, "max")).toEqual({});
    await expect(saveCommunicationMemory(alice, base)).rejects.toMatchObject({
      code: "REVISION_CONFLICT",
    });
    expect(
      (await listCommunicationMemory(alice)).find((item) => item.scope === "shared"),
    ).toMatchObject({ revision: 2, preferences: {} });
    await expect(
      saveCommunicationMemory(alice, { ...base, preferences: { diagnosis: "anything" } }),
    ).rejects.toBeTruthy();
  });

  it("counts all owner days, not only the visible history; excludes empty, demo and unconfirmed work", async () => {
    const db = getDb();
    expect((await getProgress(bob)).journey).toEqual({ activityDays: 0 });
    const [revision] = await db.select({ id: variantRevisions.id }).from(variantRevisions).limit(1);
    if (!revision) throw new Error("Seed the local exercise catalog first.");
    const [alicePlan, bobPlan] = await db
      .insert(plans)
      .values([
        { userId: alice, name: "Story fixture" },
        { userId: bob, name: "Story fixture" },
      ])
      .returning();

    async function add(
      owner: string,
      day: string | null,
      status = "completed",
      hasSet = true,
      isDemo = false,
      completedAt = "2026-09-15T22:30:00Z",
    ) {
      const [workout] = await db
        .insert(workouts)
        .values({
          userId: owner,
          planId: owner === alice ? alicePlan.id : bobPlan.id,
          name: "Story fixture",
          status,
          rewardDay: day,
          place: "home",
          availableSeconds: 1200,
          sourceProfileRevision: 1,
          completedAt: status === "active" ? null : new Date(completedAt),
          isDemo,
        })
        .returning();
      if (hasSet) {
        const [step] = await db
          .insert(workoutSteps)
          .values({
            userId: owner,
            workoutId: workout.id,
            variantRevisionId: revision.id,
            ordinal: 0,
            name: "Fixture",
            sets: 1,
            reps: 8,
            instructions: "Fixture",
            metric: "reps",
          })
          .returning();
        await db.insert(recordedSets).values({
          userId: owner,
          workoutId: workout.id,
          stepId: step.id,
          setIndex: 0,
          reps: 8,
        });
      }
    }

    for (let index = 0; index < 52; index++) {
      const day = new Date(Date.UTC(2026, 0, 1 + index)).toISOString().slice(0, 10);
      await add(alice, day);
    }
    await add(alice, "2026-01-01", "partial"); // Same day remains one step.
    await add(alice, "2026-09-14", "partial");
    await add(alice, "2026-09-15", "partial", false);
    await add(alice, "2026-09-17", "completed", false);
    await add(alice, "2026-09-18", "aborted");
    await add(alice, "2026-09-19", "active");
    await add(alice, "2026-09-20", "completed", true, true);
    await add(alice, null); // 22:30 UTC is already September 16 in Moscow.
    await add(alice, "2026-09-16"); // Legacy fallback must deduplicate with pinned day.
    await add(bob, "2026-09-21");

    const first = await getProgress(alice);
    expect(first.history).toHaveLength(50);
    expect(first.journey).toEqual({ activityDays: 54 });
    expect((await getProgress(alice)).journey).toEqual(first.journey);
    expect((await getProgress(bob)).journey).toEqual({ activityDays: 1 });
    const xp = first.xp;
    const [one, replay] = await Promise.all([
      markJourneyRead(alice, { chapterId: "further-together" }),
      markJourneyRead(alice, { chapterId: "further-together" }),
    ]);
    expect(one).toEqual(replay);
    expect(await listJourneyReads(alice)).toEqual(["further-together"]);
    expect(await listJourneyReads(bob)).toEqual([]);
    await expect(markJourneyRead(bob, { chapterId: "own-trail" })).rejects.toMatchObject({
      code: "CHAPTER_UNAVAILABLE",
    });
    expect((await getProgress(alice)).xp).toBe(xp);
    const exported = await exportAccountData(alice);
    expect(exported.data.workouts.length).toBeGreaterThan(50);
    expect(exported.data.workouts.every((row) => row.user_id === alice)).toBe(true);
    expect(exported.account.id).toBe(alice);
    expect(exported).not.toHaveProperty("sessions");
    expect(exported.data).not.toHaveProperty("auth_accounts");
  });
});
