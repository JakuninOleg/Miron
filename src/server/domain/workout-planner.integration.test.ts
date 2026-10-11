import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { closeDb, getDb } from "../db";
import { plannerCommands, profiles, user, workoutPlannerPrograms } from "../db/schema";
import type { PlannerConfig } from "../../shared/workout-planner";
import type { Workout, WorkoutCommand } from "../../shared/contracts";
import { saveBuilderInventory } from "./workout-builder";
import { startPlannerWorkout } from "./planner-start";
import { applyWorkoutCommand } from "./workouts";
import {
  confirmPlanner,
  getPlannerState,
  previewPlanner,
  savePlannerPreferences,
} from "./workout-planner";

if (existsSync(".env.local")) process.loadEnvFile(".env.local");
describe.runIf(process.env.RUN_DB_TESTS === "true")(
  "private planner confirmation and preference versions",
  () => {
    const alice = randomUUID();
    const bob = randomUUID();
    const config: PlannerConfig = {
      mode: "program",
      place: "home",
      direction: "yoga",
      split: "fullbody",
      daysPerWeek: 2,
      intent: "start",
      durationMinutes: 30,
      execution: "straight",
      variety: "familiar",
    };
    beforeAll(async () => {
      const url = new URL(process.env.DATABASE_URL!);
      if (
        !["localhost", "127.0.0.1"].includes(url.hostname) ||
        url.port !== "55432" ||
        url.pathname !== "/miron"
      )
        throw new Error("Planner tests require local seeded MIRON PostgreSQL");
      await getDb()
        .insert(user)
        .values(
          [alice, bob].map((id) => ({
            id,
            name: "Planner fixture",
            email: `${id}@example.test`,
            emailVerified: true,
          })),
        );
      await getDb()
        .insert(profiles)
        .values(
          [alice, bob].map((userId) => ({
            userId,
            displayName: "Planner fixture",
            adultConfirmed: true,
            onboardingCompleted: true,
          })),
        );
      for (const owner of [alice, bob])
        await saveBuilderInventory(owner, {
          operationId: randomUUID(),
          place: "home",
          expectedRevision: 0,
          resources: [],
        });
    });
    afterAll(async () => {
      await getDb().delete(user).where(eq(user.id, alice));
      await getDb().delete(user).where(eq(user.id, bob));
      await closeDb();
    });
    it("pins one immutable revision on concurrent replay, without sharing it with another owner", async () => {
      const draft = await previewPlanner(alice, config);
      const input = {
        operationId: randomUUID(),
        expectedProgramRevision: draft.expectedProgramRevision,
        fingerprint: draft.fingerprint,
        config,
      };
      const [a, b] = await Promise.all([
        confirmPlanner(alice, input),
        confirmPlanner(alice, input),
      ]);
      expect(a).toEqual(b);
      expect(a.revision).toBe(1);
      expect((await getPlannerState(bob)).program).toBeNull();
      await expect(
        confirmPlanner(bob, { ...input, operationId: randomUUID() }),
      ).rejects.toMatchObject({ code: "PREVIEW_CHANGED" });
      await expect(
        confirmPlanner(alice, { ...input, config: { ...config, daysPerWeek: 3 } }),
      ).rejects.toMatchObject({ code: "OPERATION_REUSED" });
    });
    it("only one competing confirmation wins and previous revision stays intact", async () => {
      const before = (await getPlannerState(alice)).program!;
      const changed = { ...config, daysPerWeek: 3 };
      const draft = await previewPlanner(alice, changed);
      expect(draft.changes.some((change) => change.label.includes("Частота"))).toBe(true);
      const results = await Promise.allSettled(
        [1, 2].map(() =>
          confirmPlanner(alice, {
            operationId: randomUUID(),
            expectedProgramRevision: draft.expectedProgramRevision,
            fingerprint: draft.fingerprint,
            config: changed,
          }),
        ),
      );
      expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
      const [stored] = await getDb()
        .select()
        .from(workoutPlannerPrograms)
        .where(
          and(
            eq(workoutPlannerPrograms.userId, alice),
            eq(workoutPlannerPrograms.revision, before.revision),
          ),
        );
      expect(stored.draft).toEqual(before.draft);
    });
    it("confirms one-off separately and replays a lost response without another revision", async () => {
      const weekly = (await getPlannerState(alice)).program!;
      const single = { ...config, mode: "single" as const };
      const draft = await previewPlanner(alice, single);
      const input = {
        operationId: randomUUID(),
        expectedProgramRevision: draft.expectedProgramRevision,
        fingerprint: draft.fingerprint,
        config: single,
      };
      const confirmed = await confirmPlanner(alice, input);
      expect(await confirmPlanner(alice, input)).toEqual(confirmed);
      const state = await getPlannerState(alice);
      expect(state.program).toEqual(weekly);
      expect(state.single).toEqual(confirmed);
    });
    it("explicit exclusions invalidate stale previews, can be undone, and are versioned per owner", async () => {
      const draft = await previewPlanner(alice, config);
      const excluded = draft.days[0].steps[0].exercise.variantId;
      const input = {
        operationId: randomUUID(),
        expectedRevision: 0,
        excludedVariantIds: [excluded],
        favoriteVariantIds: [],
      };
      const [a, b] = await Promise.all([
        savePlannerPreferences(alice, input),
        savePlannerPreferences(alice, input),
      ]);
      expect(a).toEqual(b);
      expect((await getPlannerState(bob)).preferences.excludedVariantIds).toEqual([]);
      await expect(
        confirmPlanner(alice, {
          operationId: randomUUID(),
          expectedProgramRevision: draft.expectedProgramRevision,
          fingerprint: draft.fingerprint,
          config,
        }),
      ).rejects.toMatchObject({ code: expect.stringMatching(/PREVIEW_CHANGED|PLANNER_/) });
      await expect(
        savePlannerPreferences(alice, { ...input, operationId: randomUUID() }),
      ).rejects.toMatchObject({ code: "PREFERENCES_CONFLICT" });
      const undone = await savePlannerPreferences(alice, {
        operationId: randomUUID(),
        expectedRevision: a.revision,
        excludedVariantIds: [],
        favoriteVariantIds: [],
      });
      expect(undone.excludedVariantIds).toEqual([]);
      const commands = await getDb()
        .select()
        .from(plannerCommands)
        .where(
          and(
            eq(plannerCommands.userId, alice),
            eq(plannerCommands.operationId, input.operationId),
          ),
        );
      expect(commands).toHaveLength(1);
    });
    it("uses performed main sets from a partial session, excludes warmup and rejects stale history", async () => {
      const strength: PlannerConfig = {
        ...config,
        direction: "strength",
        mode: "single",
        durationMinutes: 60,
      };
      const draft = await previewPlanner(alice, strength);
      const saved = await confirmPlanner(alice, {
        operationId: randomUUID(),
        expectedProgramRevision: draft.expectedProgramRevision,
        fingerprint: draft.fingerprint,
        config: strength,
      });
      const beforeWork = await previewPlanner(alice, config);
      let workout = await startPlannerWorkout(alice, {
        operationId: randomUUID(),
        expectedProgramRevision: saved.revision,
        dayKey: saved.draft.days[0].key,
      });
      const command = async (value: WorkoutCommand): Promise<Workout> =>
        (
          await applyWorkoutCommand(alice, workout.id, {
            operationId: randomUUID(),
            expectedRevision: workout.revision,
            command: value,
          })
        ).workout;
      expect(workout.exercises[0].phase).toBe("warmup");
      workout = await command({
        type: "record_set",
        exerciseId: workout.exercises[0].id,
        setId: randomUUID(),
        reps: 3,
        weightKg: 0,
      });
      while (workout.exercises[workout.currentIndex].phase === "warmup") {
        const current = workout.exercises[workout.currentIndex];
        workout = await command(
          workout.recordedSets.some((set) => set.exerciseId === current.id)
            ? { type: "next_exercise" }
            : { type: "skip_exercise", exerciseId: current.id },
        );
      }
      workout = await command({
        type: "record_set",
        exerciseId: workout.exercises[workout.currentIndex].id,
        setId: randomUUID(),
        reps: 5,
        weightKg: 0,
      });
      workout = await command({ type: "end_early" });
      expect(workout.status).toBe("partial");
      const state = await getPlannerState(alice);
      expect(state.historySummary.confirmedSets).toBe(1);
      expect(state.historySummary.recentPrimaryMuscles).toContain("quads");
      expect((await getPlannerState(bob)).historySummary.confirmedSets).toBe(0);
      await expect(
        confirmPlanner(alice, {
          operationId: randomUUID(),
          expectedProgramRevision: beforeWork.expectedProgramRevision,
          fingerprint: beforeWork.fingerprint,
          config,
        }),
      ).rejects.toMatchObject({ code: "PREVIEW_CHANGED" });
    });
  },
);
