import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { closeDb, getDb } from "../db";
import { profiles, user, recordedSets, workoutCommands, workouts, trials } from "../db/schema";
import type { PlannerConfig } from "../../shared/workout-planner";
import type { Workout, WorkoutCommand } from "../../shared/contracts";
import { saveBuilderInventory, getCustomWorkout, saveCustomWorkout } from "./workout-builder";
import { confirmPlanner, previewPlanner } from "./workout-planner";
import { startPlannerWorkout } from "./planner-start";
import { applyWorkoutCommand, getWorkout } from "./workouts";

if (existsSync(".env.local")) process.loadEnvFile(".env.local");
describe.runIf(process.env.RUN_DB_TESTS === "true")(
  "drop-set persistence, permissions and replay",
  () => {
    const alice = randomUUID();
    const bob = randomUUID();
    const config: PlannerConfig = {
      mode: "program",
      place: "gym",
      direction: "strength",
      split: "push_pull_legs",
      daysPerWeek: 3,
      intent: "maintain",
      durationMinutes: 90,
      execution: "straight",
      variety: "familiar",
      dropSets: true,
    };
    let workout: Workout;
    let inventoryRevision = 0;
    let admission: { expectedProgramRevision: number; dayKey: string };
    async function command(value: WorkoutCommand) {
      const ack = await applyWorkoutCommand(alice, workout.id, {
        operationId: randomUUID(),
        expectedRevision: workout.revision,
        command: value,
      });
      workout = ack.workout;
      return ack;
    }
    beforeAll(async () => {
      const url = new URL(process.env.DATABASE_URL ?? "");
      if (
        !["localhost", "127.0.0.1"].includes(url.hostname) ||
        url.port !== "55432" ||
        url.pathname !== "/miron"
      )
        throw new Error("Drop fixtures require local PostgreSQL:55432/miron.");
      await getDb()
        .insert(user)
        .values(
          [alice, bob].map((id) => ({
            id,
            name: "Methods fixture",
            email: `${id}@example.test`,
            emailVerified: true,
          })),
        );
      await getDb()
        .insert(trials)
        .values([alice, bob].map((userId) => ({ userId })));
      await getDb()
        .insert(profiles)
        .values(
          [alice, bob].map((userId) => ({
            userId,
            experience: "regular",
            adultConfirmed: true,
            onboardingCompleted: true,
          })),
        );
      const inventory = await saveBuilderInventory(alice, {
        operationId: randomUUID(),
        expectedRevision: 0,
        place: "gym",
        resources: [],
      });
      inventoryRevision = inventory.revision;
    });
    afterAll(async () => {
      await getDb()
        .delete(user)
        .where(inArray(user.id, [alice, bob]));
      await closeDb();
    });
    it("pins the method through preview, confirmation, custom copy and admission", async () => {
      const preview = await previewPlanner(alice, config);
      const day = preview.days.find((entry) => entry.steps.some((step) => step.dropSet));
      expect(day).toBeDefined();
      const saved = await saveCustomWorkout(alice, {
        operationId: randomUUID(),
        id: randomUUID(),
        expectedRevision: 0,
        inventoryRevision,
        name: "Моя тренировка с дропсетом",
        place: "gym",
        direction: "strength",
        steps: day!.steps.map(
          ({ revisionId, sets, target, restSeconds, pairKey, transitionSeconds, dropSet }) => ({
            revisionId,
            sets,
            target,
            restSeconds,
            pairKey,
            transitionSeconds,
            dropSet,
          }),
        ),
      });
      expect((await getCustomWorkout(alice, saved.id)).steps.map((step) => step.dropSet)).toEqual(
        day!.steps.map((step) => step.dropSet),
      );
      const program = await confirmPlanner(alice, {
        operationId: randomUUID(),
        expectedProgramRevision: preview.expectedProgramRevision,
        fingerprint: preview.fingerprint,
        config,
      });
      admission = { expectedProgramRevision: program.revision, dayKey: day!.key };
      workout = await startPlannerWorkout(alice, {
        operationId: randomUUID(),
        expectedProgramRevision: program.revision,
        dayKey: day!.key,
      });
      expect(workout.exercises.filter((exercise) => exercise.dropSet)).toHaveLength(1);
      expect((await getWorkout(alice, workout.id)).exercises).toEqual(workout.exercises);
      const invalidInput = {
        operationId: randomUUID(),
        id: randomUUID(),
        expectedRevision: 0,
        inventoryRevision,
        name: "Неверный метод",
        place: "gym",
        direction: "strength",
        steps: [
          {
            revisionId: day!.steps[0].revisionId,
            sets: 2,
            target: 8,
            restSeconds: 60,
            dropSet: { kind: "last_set_drop", targetReps: 8 },
          },
        ],
      };
      await expect(saveCustomWorkout(alice, invalidInput)).rejects.toMatchObject({
        code: "INVALID_DROP_SET",
      });
    });
    it("rejects cross-owner writes, unplanned reductions, early drops and non-decreasing load", async () => {
      const first = workout.exercises[0];
      const input = {
        operationId: randomUUID(),
        expectedRevision: workout.revision,
        command: {
          type: "record_set" as const,
          exerciseId: first.id,
          setId: randomUUID(),
          reps: 8,
          weightKg: 10,
          drop: { reps: 8, weightKg: 7.5 },
        },
      };
      await expect(applyWorkoutCommand(bob, workout.id, input)).rejects.toMatchObject({
        status: 404,
      });
      await expect(applyWorkoutCommand(alice, workout.id, input)).rejects.toMatchObject({
        code: "INVALID_DROP_SET",
      });
      while (!workout.exercises[workout.currentIndex].dropSet) {
        const exercise = workout.exercises[workout.currentIndex];
        for (let index = 0; index < exercise.sets; index++)
          await command(
            exercise.metric === "time"
              ? {
                  type: "record_timed_set",
                  exerciseId: exercise.id,
                  setId: randomUUID(),
                  durationSeconds: 20,
                }
              : {
                  type: "record_set",
                  exerciseId: exercise.id,
                  setId: randomUUID(),
                  reps: 10,
                  weightKg: 10,
                },
          );
        await command({ type: "next_exercise" });
      }
      const exercise = workout.exercises[workout.currentIndex];
      const dropCommand = {
        type: "record_set" as const,
        exerciseId: exercise.id,
        setId: randomUUID(),
        reps: 10,
        weightKg: 10,
        drop: { reps: 8, weightKg: 7.5 },
      };
      if (exercise.sets > 1)
        await expect(command(dropCommand)).rejects.toMatchObject({ code: "INVALID_DROP_SET" });
      for (let index = 0; index < exercise.sets - 1; index++)
        await command({ ...dropCommand, setId: randomUUID(), drop: undefined });
      await expect(
        command({ ...dropCommand, drop: { reps: 8, weightKg: 10 } }),
      ).rejects.toMatchObject({ code: "INVALID_DROP_SET" });
    });
    it("stores both parts in one fact and replays a racing request exactly once", async () => {
      const exercise = workout.exercises[workout.currentIndex];
      const input = {
        operationId: randomUUID(),
        expectedRevision: workout.revision,
        command: {
          type: "record_set" as const,
          exerciseId: exercise.id,
          setId: randomUUID(),
          reps: 10,
          weightKg: 10,
          drop: { reps: 8, weightKg: 7.5 },
        },
      };
      const [first, retry] = await Promise.all([
        applyWorkoutCommand(alice, workout.id, input),
        applyWorkoutCommand(alice, workout.id, input),
      ]);
      expect(retry).toEqual(first);
      workout = first.workout;
      expect(workout.recordedSets.filter((set) => set.exerciseId === exercise.id)).toHaveLength(
        exercise.sets,
      );
      expect(workout.recordedSets.find((set) => set.id === input.command.setId)?.drop).toEqual(
        input.command.drop,
      );
      expect(
        await getDb().select().from(recordedSets).where(eq(recordedSets.id, input.command.setId)),
      ).toHaveLength(1);
      expect(
        await getDb()
          .select()
          .from(workoutCommands)
          .where(eq(workoutCommands.operationId, input.operationId)),
      ).toHaveLength(1);
      await expect(
        applyWorkoutCommand(alice, workout.id, {
          ...input,
          command: { ...input.command, drop: { reps: 6, weightKg: 7.5 } },
        }),
      ).rejects.toMatchObject({ code: "OPERATION_REUSED" });
      expect(first.progress.xp).toBe(0);
    });
    it("finishes with one ordinary reward and keeps the reduction in history", async () => {
      while (workout.currentIndex < workout.exercises.length - 1) {
        await command({ type: "next_exercise" });
        const exercise = workout.exercises[workout.currentIndex];
        for (let index = 0; index < exercise.sets; index++)
          await command(
            exercise.metric === "time"
              ? {
                  type: "record_timed_set",
                  exerciseId: exercise.id,
                  setId: randomUUID(),
                  durationSeconds: 20,
                }
              : {
                  type: "record_set",
                  exerciseId: exercise.id,
                  setId: randomUUID(),
                  reps: 10,
                  weightKg: 10,
                },
          );
      }
      const result = await command({ type: "finish" });
      expect(result.workout.reward?.awardedXp).toBe(50);
      expect(result.workout.recordedSets.filter((set) => set.drop)).toHaveLength(1);
      expect(result.workout.energyEstimate).toBeDefined();
    });
    it("rechecks a saved method after a break or a new difficult assessment before admission", async () => {
      await getDb()
        .update(workouts)
        .set({ completedAt: new Date(Date.now() - 22 * 86400_000) })
        .where(eq(workouts.id, workout.id));
      await expect(
        startPlannerWorkout(alice, { ...admission, operationId: randomUUID() }),
      ).rejects.toMatchObject({ code: "PROGRAM_UNAVAILABLE" });
      await getDb()
        .update(workouts)
        .set({ completedAt: new Date() })
        .where(eq(workouts.id, workout.id));
      await command({ type: "rate_load", feedback: "too_hard" });
      await expect(
        startPlannerWorkout(alice, { ...admission, operationId: randomUUID() }),
      ).rejects.toMatchObject({ code: "PROGRAM_UNAVAILABLE" });
      expect((await getWorkout(alice, workout.id)).recordedSets).toEqual(workout.recordedSets);
    });
  },
);
