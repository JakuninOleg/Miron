import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { and, eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { CommandEnvelope, Workout } from "../../shared/contracts";
import { getDb, closeDb } from "../db";
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
import { applyWorkoutCommand, getWorkout, workoutCommandInput } from "./workouts";
import { getProgress } from "./profile";

if (existsSync(".env.local")) process.loadEnvFile(".env.local");
describe.runIf(process.env.RUN_DB_TESTS === "true")(
  "PostgreSQL workout energy authorization and persistence",
  () => {
    const alice = randomUUID();
    const bob = randomUUID();
    const ids = Array.from({ length: 5 }, () => randomUUID());
    const db = () => getDb();
    let revisionId = "";
    const envelope = (
      workout: Workout,
      extra: Partial<Extract<CommandEnvelope["command"], { type: "estimate_energy" }>> = {},
    ): CommandEnvelope => ({
      operationId: randomUUID(),
      expectedRevision: workout.revision,
      command: { type: "estimate_energy", ...extra },
    });
    beforeAll(async () => {
      const url = new URL(process.env.DATABASE_URL ?? "");
      if (
        !["localhost", "127.0.0.1"].includes(url.hostname) ||
        url.port !== "55432" ||
        url.pathname !== "/miron"
      )
        throw new Error("Energy fixtures require local PostgreSQL:55432/miron.");
      const [revision] = await db()
        .select({ id: variantRevisions.id })
        .from(variantRevisions)
        .limit(1);
      if (!revision)
        throw new Error("Seed the local exercise catalog before running integration tests.");
      revisionId = revision.id;
      await db()
        .insert(user)
        .values(
          [alice, bob].map((id) => ({
            id,
            name: "Energy fixture",
            email: `${id}@example.test`,
            emailVerified: true,
          })),
        );
      await db()
        .insert(profiles)
        .values(
          [alice, bob].map((userId) => ({
            userId,
            adultConfirmed: true,
            onboardingCompleted: true,
          })),
        );
      const [plan] = await db()
        .insert(plans)
        .values({ userId: alice, name: "Energy fixture" })
        .returning();
      for (const [index, status] of [
        "completed",
        "partial",
        "active",
        "aborted",
        "completed",
      ].entries()) {
        await db()
          .insert(workouts)
          .values({
            id: ids[index],
            userId: alice,
            planId: plan.id,
            name: "Energy fixture",
            status,
            place: "home",
            availableSeconds: 1800,
            sourceProfileRevision: 1,
            energyActivity: index === 4 ? null : "strength",
            startedAt: new Date("2026-10-12T08:00:00Z"),
            completedAt: status === "active" ? null : new Date("2026-10-12T09:00:00Z"),
          });
        const [step] = await db()
          .insert(workoutSteps)
          .values({
            userId: alice,
            workoutId: ids[index],
            variantRevisionId: revisionId,
            ordinal: 0,
            name: "Energy squat",
            sets: 3,
            reps: 10,
            instructions: "Fixture",
            metric: "reps",
          })
          .returning();
        if (status !== "aborted")
          await db().insert(recordedSets).values({
            userId: alice,
            workoutId: ids[index],
            stepId: step.id,
            setIndex: 0,
            reps: 10,
          });
      }
    });
    afterAll(async () => {
      await db()
        .delete(user)
        .where(inArray(user.id, [alice, bob]));
      await closeDb();
    });
    it("estimates automatically as part of the normal finish transaction and same ACK", async () => {
      const active = await getWorkout(alice, ids[2]);
      const command: CommandEnvelope = {
        operationId: randomUUID(),
        expectedRevision: active.revision,
        command: { type: "end_early" },
      };
      const result = await applyWorkoutCommand(alice, active.id, command);
      expect(result.workout.status).toBe("partial");
      expect(result.workout.energyEstimate).toMatchObject({
        weightSource: "reference",
        bodyWeightKg: 70,
      });
      expect(result.progress.history.find((row) => row.id === active.id)?.energyEstimate).toEqual(
        result.workout.energyEstimate,
      );
      expect(result.workout.reward?.awardedXp).toBe(25);
      expect(await applyWorkoutCommand(alice, active.id, command)).toEqual(result);
    });
    it("denies another owner and keeps private history separate", async () => {
      const workout = await getWorkout(alice, ids[0]);
      await expect(applyWorkoutCommand(bob, workout.id, envelope(workout))).rejects.toMatchObject({
        code: "WORKOUT_NOT_FOUND",
      });
      expect((await getProgress(bob)).history).toEqual([]);
    });
    it("persists reported more/less work idempotently without changing results or XP", async () => {
      const workout = await getWorkout(alice, ids[0]);
      const before = await getProgress(alice);
      const command = envelope(workout, {
        bodyWeightKg: 80,
        workload: [{ exerciseId: workout.exercises[0].id, sets: 4, repsPerSet: 12 }],
      });
      const [first, replay] = await Promise.all([
        applyWorkoutCommand(alice, workout.id, command),
        applyWorkoutCommand(alice, workout.id, command),
      ]);
      expect(replay).toEqual(first);
      expect(first.workout.revision).toBe(workout.revision + 1);
      expect(first.workout.recordedSets).toEqual(workout.recordedSets);
      expect(first.workout.completedAt).toBe(workout.completedAt);
      expect(first.progress.xp).toBe(before.xp);
      expect(first.workout.energyEstimate).toMatchObject({
        bodyWeightKg: 80,
        weightSource: "user_reported",
        methodVersion: "met-performed-v1",
      });
      expect(first.progress.history.find((row) => row.id === workout.id)?.energyEstimate).toEqual(
        first.workout.energyEstimate,
      );
      expect(
        await db()
          .select()
          .from(workoutCommands)
          .where(
            and(
              eq(workoutCommands.userId, alice),
              eq(workoutCommands.operationId, command.operationId),
            ),
          ),
      ).toHaveLength(1);
      await expect(
        applyWorkoutCommand(alice, workout.id, {
          ...command,
          command: { ...command.command, bodyWeightKg: 90 },
        }),
      ).rejects.toMatchObject({ code: "OPERATION_REUSED" });
      const less = await applyWorkoutCommand(
        alice,
        workout.id,
        envelope(first.workout, {
          workload: [{ exerciseId: workout.exercises[0].id, sets: 1, repsPerSet: 5 }],
        }),
      );
      expect(less.workout.energyEstimate!.estimatedKcal).toBeLessThan(
        first.workout.energyEstimate!.estimatedKcal,
      );
      expect(less.workout.energyEstimate!.bodyWeightKg).toBe(80);
      expect(less.progress.xp).toBe(before.xp);
    });
    it("uses that owner's previously reported weight on the next automatic result", async () => {
      const [previous] = await db().select().from(workouts).where(eq(workouts.id, ids[0]));
      const [workout] = await db()
        .insert(workouts)
        .values({
          userId: alice,
          planId: previous.planId,
          name: "Next energy fixture",
          status: "active",
          place: "home",
          availableSeconds: 1800,
          sourceProfileRevision: 1,
          energyActivity: "strength",
        })
        .returning();
      const [step] = await db()
        .insert(workoutSteps)
        .values({
          userId: alice,
          workoutId: workout.id,
          variantRevisionId: revisionId,
          ordinal: 0,
          name: "Next fixture",
          sets: 1,
          reps: 10,
          instructions: "Fixture",
        })
        .returning();
      await db()
        .insert(recordedSets)
        .values({ userId: alice, workoutId: workout.id, stepId: step.id, setIndex: 0, reps: 10 });
      const result = await applyWorkoutCommand(alice, workout.id, {
        operationId: randomUUID(),
        expectedRevision: 1,
        command: { type: "finish" },
      });
      expect(result.workout.energyEstimate).toMatchObject({
        bodyWeightKg: 80,
        weightSource: "user_reported",
      });
    });
    it("serializes competing revisions and rejects stale updates", async () => {
      const workout = await getWorkout(alice, ids[1]);
      const results = await Promise.allSettled([
        applyWorkoutCommand(alice, workout.id, envelope(workout, { bodyWeightKg: 60 })),
        applyWorkoutCommand(alice, workout.id, envelope(workout, { bodyWeightKg: 90 })),
      ]);
      expect(results.filter((row) => row.status === "fulfilled")).toHaveLength(1);
      expect(results.find((row) => row.status === "rejected")).toMatchObject({
        reason: { code: "REVISION_CONFLICT" },
      });
    });
    it("preserves saved estimates when today's profile changes", async () => {
      const before = (await getWorkout(alice, ids[0])).energyEstimate;
      await db()
        .update(profiles)
        .set({ discipline: "yoga", showWorkoutEnergy: false })
        .where(eq(profiles.userId, alice));
      expect((await getWorkout(alice, ids[0])).energyEstimate).toEqual(before);
      expect(
        (await getProgress(alice)).history.find((row) => row.id === ids[0])?.energyEstimate,
      ).toEqual(before);
    });
    it("rejects unsupported/aborted work and foreign exercise corrections transactionally", async () => {
      for (const id of [ids[3], ids[4]]) {
        const workout = await getWorkout(alice, id);
        await expect(applyWorkoutCommand(alice, id, envelope(workout))).rejects.toMatchObject({
          code: "ENERGY_ESTIMATE_UNAVAILABLE",
        });
        expect((await getWorkout(alice, id)).revision).toBe(workout.revision);
      }
      const workout = await getWorkout(alice, ids[0]);
      await expect(
        applyWorkoutCommand(
          alice,
          workout.id,
          envelope(workout, { workload: [{ exerciseId: randomUUID(), sets: 3 }] }),
        ),
      ).rejects.toMatchObject({ code: "ENERGY_ESTIMATE_UNAVAILABLE" });
    });
    it("accepts only bounded workload inputs; clients cannot supply calories, MET or minutes", () => {
      const base = { operationId: randomUUID(), expectedRevision: 1 };
      for (const command of [
        { type: "estimate_energy", met: 99 },
        { type: "estimate_energy", estimatedKcal: 5000 },
        { type: "estimate_energy", durationMinutes: 100 },
        { type: "estimate_energy", bodyWeightKg: -1 },
        { type: "estimate_energy", workload: [{ exerciseId: randomUUID(), sets: 999 }] },
      ])
        expect(workoutCommandInput.safeParse({ ...base, command }).success).toBe(false);
    });
  },
);
