import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { closeDb, getDb } from "../db";
import { plans, profiles, trials, user, workouts } from "../db/schema";
import { completeOnboarding } from "./onboarding";
import { getProfile, initializeAccount, updateProfile } from "./profile";

if (existsSync(".env.local")) process.loadEnvFile(".env.local");
describe.runIf(process.env.RUN_DB_TESTS === "true")(
  "PostgreSQL account acquaintance invariants",
  () => {
    const owners: string[] = [];
    const createOwner = async () => {
      const id = randomUUID();
      owners.push(id);
      await getDb()
        .insert(user)
        .values({ id, name: "Onboarding fixture", email: `${id}@example.test` });
      await initializeAccount(id);
      return id;
    };
    const input = (companion: "max" | "lika" = "lika") => ({
      operationId: randomUUID(),
      companion,
      interests: ["yoga", "home"],
      adultConfirmed: true,
    });
    beforeAll(() => {
      const url = new URL(process.env.DATABASE_URL!);
      if (!["localhost", "127.0.0.1"].includes(url.hostname) || url.port !== "55432")
        throw new Error("Account fixtures require local PostgreSQL on port 55432");
    });
    afterAll(async () => {
      if (owners.length) await getDb().delete(user).where(inArray(user.id, owners));
      await closeDb();
    });
    it("commits once under concurrent retries and preserves trial timing/usage", async () => {
      const id = await createOwner();
      await getDb().update(trials).set({ used: 9 }).where(eq(trials.userId, id));
      const before = (await getProfile(id)).trial;
      const payload = input();
      const results = await Promise.all([
        completeOnboarding(id, payload),
        completeOnboarding(id, payload),
      ]);
      expect(results.every((r) => r.profile.onboardingCompleted && r.profile.adultConfirmed)).toBe(
        true,
      );
      expect(results[0].profile).toMatchObject({
        companion: "lika",
        theme: "rose",
        discipline: "yoga",
        interests: ["yoga", "home"],
      });
      expect(results[0].trial).toEqual(before);
      const [row] = await getDb().select().from(profiles).where(eq(profiles.userId, id));
      expect(row.revision).toBe(2);
      expect(row.onboardingOperationId).toBe(payload.operationId);
      await expect(completeOnboarding(id, { ...payload, companion: "max" })).rejects.toMatchObject({
        code: "IDEMPOTENCY_CONFLICT",
        status: 409,
      });
      const replay = await completeOnboarding(id, input("max"));
      expect(replay.profile.companion).toBe("lika");
      expect(replay.trial).toEqual(before);
    });
    it("serializes different completion operations and keeps another owner untouched", async () => {
      const id = await createOwner();
      const peer = await createOwner();
      const first = input("max");
      const second = input("lika");
      await Promise.all([completeOnboarding(id, first), completeOnboarding(id, second)]);
      const [row] = await getDb().select().from(profiles).where(eq(profiles.userId, id));
      expect(row.revision).toBe(2);
      expect([first.operationId, second.operationId]).toContain(row.onboardingOperationId);
      expect((await getProfile(peer)).profile.onboardingCompleted).toBe(false);
    });
    it("rejects invalid consent and unavailable accounts without updating their profile", async () => {
      const id = await createOwner();
      await expect(
        completeOnboarding(id, { ...input(), adultConfirmed: false }),
      ).rejects.toMatchObject({ name: "ZodError" });
      await expect(
        completeOnboarding(id, { ...input(), interests: ["home", "home"] }),
      ).rejects.toMatchObject({ name: "ZodError" });
      await getDb().update(user).set({ status: "deleting" }).where(eq(user.id, id));
      await expect(completeOnboarding(id, input())).rejects.toMatchObject({
        code: "ACCOUNT_UNAVAILABLE",
        status: 403,
      });
      const raw = (await getProfile(id)).profile;
      await expect(updateProfile(id, { ...raw, adultConfirmed: true })).rejects.toMatchObject({
        code: "ACCOUNT_UNAVAILABLE",
        status: 403,
      });
      expect(raw.onboardingCompleted).toBe(false);
    });
    it("cannot reset completed acquaintance or revoke its adulthood through a stale PUT", async () => {
      const id = await createOwner();
      const initial = await completeOnboarding(id, input());
      await expect(
        updateProfile(id, {
          ...initial.profile,
          onboardingCompleted: false,
          adultConfirmed: false,
        }),
      ).rejects.toMatchObject({ code: "ADULT_CONFIRMATION_REQUIRED" });
      const saved = await updateProfile(id, {
        ...initial.profile,
        onboardingCompleted: false,
        name: "Changed name",
      });
      expect(saved.profile).toMatchObject({
        onboardingCompleted: true,
        adultConfirmed: true,
        name: "Changed name",
      });
      expect(saved.trial).toEqual(initial.trial);
    });
    it("locks companion switches for ready/active workouts, then permits them after terminal outcome", async () => {
      const id = await createOwner();
      const initial = await completeOnboarding(id, input("max"));
      const [plan] = await getDb()
        .insert(plans)
        .values({ userId: id, name: "Fixture plan" })
        .returning();
      const [workout] = await getDb()
        .insert(workouts)
        .values({
          userId: id,
          planId: plan.id,
          name: "Fixture workout",
          place: "home",
          availableSeconds: 600,
          sourceProfileRevision: 2,
        })
        .returning();
      for (const status of ["ready", "active"]) {
        await getDb().update(workouts).set({ status }).where(eq(workouts.id, workout.id));
        await expect(
          updateProfile(id, { ...initial.profile, companion: "lika" }),
        ).rejects.toMatchObject({ code: "COMPANION_LOCKED", status: 409 });
      }
      await getDb()
        .update(workouts)
        .set({ status: "partial", completedAt: new Date() })
        .where(eq(workouts.id, workout.id));
      expect(
        (await updateProfile(id, { ...initial.profile, companion: "lika" })).profile.companion,
      ).toBe("lika");
    });
  },
);
