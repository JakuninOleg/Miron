import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { closeDb, getDb } from "../db";
import {
  plans,
  profiles,
  recordedSets,
  user,
  variantRevisions,
  workoutCommands,
  workouts,
  workoutSteps,
} from "../db/schema";
import { applyWorkoutCommand, getWorkout } from "./workouts";
import { getProgress } from "./profile";
import { executeAssistantTool } from "../assistant/tools";

if (existsSync(".env.local")) process.loadEnvFile(".env.local");
describe.runIf(process.env.RUN_DB_TESTS === "true")(
  "load feedback persistence and permissions",
  () => {
    const alice = randomUUID();
    const bob = randomUUID();
    const ids = Array.from({ length: 4 }, () => randomUUID());
    beforeAll(async () => {
      const url = new URL(process.env.DATABASE_URL ?? "");
      if (
        !["localhost", "127.0.0.1"].includes(url.hostname) ||
        url.port !== "55432" ||
        url.pathname !== "/miron"
      )
        throw new Error("Feedback fixtures require local PostgreSQL:55432/miron.");
      const [revision] = await getDb()
        .select({ id: variantRevisions.id })
        .from(variantRevisions)
        .limit(1);
      if (!revision) throw new Error("Seed the local catalog first.");
      await getDb()
        .insert(user)
        .values(
          [alice, bob].map((id) => ({
            id,
            name: "Feedback fixture",
            email: `${id}@example.test`,
            emailVerified: true,
          })),
        );
      await getDb()
        .insert(profiles)
        .values(
          [alice, bob].map((userId) => ({
            userId,
            adultConfirmed: true,
            onboardingCompleted: true,
          })),
        );
      const [plan] = await getDb()
        .insert(plans)
        .values({ userId: alice, name: "Feedback fixture" })
        .returning();
      for (const [index, status] of ["completed", "partial", "active", "aborted"].entries()) {
        await getDb()
          .insert(workouts)
          .values({
            id: ids[index],
            userId: alice,
            planId: plan.id,
            name: "Feedback fixture",
            status,
            place: "gym",
            availableSeconds: 1800,
            sourceProfileRevision: 1,
            energyActivity: "strength",
            completedAt: status === "active" ? null : new Date(),
          });
        const [step] = await getDb()
          .insert(workoutSteps)
          .values({
            userId: alice,
            workoutId: ids[index],
            variantRevisionId: revision.id,
            ordinal: 0,
            name: "Fixture",
            sets: 3,
            reps: 10,
            metric: "reps",
            instructions: "Fixture",
          })
          .returning();
        if (status !== "aborted")
          await getDb()
            .insert(recordedSets)
            .values({
              userId: alice,
              workoutId: ids[index],
              stepId: step.id,
              setIndex: 0,
              reps: 10,
              weightG: 5000,
            });
      }
    });
    afterAll(async () => {
      await getDb()
        .delete(user)
        .where(inArray(user.id, [alice, bob]));
      await closeDb();
    });
    it("persists and replays an assessment exactly once without changing results or XP", async () => {
      const before = await getWorkout(alice, ids[0]);
      const progress = await getProgress(alice);
      const envelope = {
        operationId: randomUUID(),
        expectedRevision: before.revision,
        command: { type: "rate_load" as const, feedback: "hard" as const },
      };
      const [first, retry] = await Promise.all([
        applyWorkoutCommand(alice, before.id, envelope),
        applyWorkoutCommand(alice, before.id, envelope),
      ]);
      expect(retry).toEqual(first);
      expect(first.workout.loadFeedback).toBe("hard");
      expect(first.workout.revision).toBe(before.revision + 1);
      expect(first.workout.recordedSets).toEqual(before.recordedSets);
      expect(first.workout.completedAt).toBe(before.completedAt);
      expect(first.progress).toEqual(progress);
      expect((await getWorkout(alice, before.id)).loadFeedback).toBe("hard");
      expect(
        await getDb()
          .select()
          .from(workoutCommands)
          .where(eq(workoutCommands.operationId, envelope.operationId)),
      ).toHaveLength(1);
      await expect(
        applyWorkoutCommand(alice, before.id, {
          ...envelope,
          command: { type: "rate_load", feedback: "easy" },
        }),
      ).rejects.toMatchObject({ code: "OPERATION_REUSED" });
    });
    it("accepts partial work, rejects active/empty outcomes and denies the other owner", async () => {
      const partial = await getWorkout(alice, ids[1]);
      expect(
        (
          await applyWorkoutCommand(alice, partial.id, {
            operationId: randomUUID(),
            expectedRevision: partial.revision,
            command: { type: "rate_load", feedback: "just_right" },
          })
        ).workout.loadFeedback,
      ).toBe("just_right");
      for (const id of ids.slice(2))
        await expect(
          applyWorkoutCommand(alice, id, {
            operationId: randomUUID(),
            expectedRevision: 1,
            command: { type: "rate_load", feedback: "easy" },
          }),
        ).rejects.toMatchObject({ code: "WORKOUT_FEEDBACK_UNAVAILABLE" });
      await expect(
        applyWorkoutCommand(bob, ids[0], {
          operationId: randomUUID(),
          expectedRevision: 2,
          command: { type: "rate_load", feedback: "easy" },
        }),
      ).rejects.toMatchObject({ code: "WORKOUT_NOT_FOUND" });
    });
    it("serializes conflicting corrections and rejects invalid values at the boundary", async () => {
      const before = await getWorkout(alice, ids[0]);
      const results = await Promise.allSettled(
        (["easy", "too_hard"] as const).map((feedback) =>
          applyWorkoutCommand(alice, before.id, {
            operationId: randomUUID(),
            expectedRevision: before.revision,
            command: { type: "rate_load", feedback },
          }),
        ),
      );
      expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
      expect(results.find((result) => result.status === "rejected")).toMatchObject({
        reason: { code: "REVISION_CONFLICT" },
      });
      await expect(
        applyWorkoutCommand(alice, before.id, {
          operationId: randomUUID(),
          expectedRevision: before.revision,
          command: { type: "rate_load", feedback: "extreme" },
        }),
      ).rejects.toThrow();
    });
    it("returns bounded direction-specific AI evidence only after account authorization", async () => {
      for (const direction of ["strength", "calisthenics", "yoga", "stretch", "mobility"]) {
        const outcome = await executeAssistantTool(alice, "Почему так?", {
          id: randomUUID(),
          type: "function",
          function: { name: "read_training_principles", arguments: JSON.stringify({ direction }) },
        });
        expect(outcome.evidence).toMatchObject({
          kind: direction === "calisthenics" ? "strength" : direction,
        });
        expect(outcome.action).toBeUndefined();
        expect(JSON.stringify(outcome.evidence).length).toBeLessThan(6000);
      }
      await expect(
        executeAssistantTool(randomUUID(), "Почему так?", {
          id: randomUUID(),
          type: "function",
          function: { name: "read_training_principles", arguments: '{"direction":"strength"}' },
        }),
      ).rejects.toMatchObject({ code: "ACCOUNT_UNAVAILABLE" });
    });
  },
);
