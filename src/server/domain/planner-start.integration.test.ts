import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { and, eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Workout, WorkoutCommand } from "../../shared/contracts";
import type { PlannerDraft } from "../../shared/workout-planner";
import { closeDb, getDb } from "../db";
import { loadCatalogSeed } from "../db/catalog-input";
import {
  dailyXp,
  exercises,
  plannerCommands,
  plans,
  profiles,
  resourceTypes,
  user,
  variantRequirements,
  variantRevisions,
  variants,
  workoutPlannerPrograms,
  workoutResources,
  workouts,
  workoutSteps,
  xpEvents,
} from "../db/schema";
import { startPlannerWorkout } from "./planner-start";
import { getAvailableBuilderCatalog, saveBuilderInventory } from "./workout-builder";
import { applyWorkoutCommand, getWorkout } from "./workouts";

if (existsSync(".env.local")) process.loadEnvFile(".env.local");
const enabled = process.env.RUN_DB_TESTS === "true";

describe.runIf(enabled)("PostgreSQL confirmed planner starts and paired execution", () => {
  const alice = randomUUID();
  const bob = randomUUID();
  const familyId = `planner-fixture.${randomUUID()}`;
  const resourceCode = `planner_fixture_${randomUUID().replaceAll("-", "")}`;
  const startId = randomUUID();
  const variantIds: string[] = [];
  let resourceId = "";
  let program: PlannerDraft;
  let active: Workout;
  let inventoryRevision = 0;
  const db = () => getDb();
  const startInput = (revision = 1) => ({
    operationId: randomUUID(),
    expectedProgramRevision: revision,
    dayKey: "day-1",
  });
  const command = async (workout: Workout, value: WorkoutCommand): Promise<Workout> =>
    (
      await applyWorkoutCommand(alice, workout.id, {
        operationId: randomUUID(),
        expectedRevision: workout.revision,
        command: value,
      })
    ).workout;
  const record = (workout: Workout): Promise<Workout> => {
    const exercise = workout.exercises[workout.currentIndex];
    return command(
      workout,
      exercise.metric === "time"
        ? {
            type: "record_timed_set",
            exerciseId: exercise.id,
            setId: randomUUID(),
            durationSeconds: 17,
          }
        : {
            type: "record_set",
            exerciseId: exercise.id,
            setId: randomUUID(),
            reps: 7,
            weightKg: 2.5,
          },
    );
  };
  const next = (workout: Workout) => command(workout, { type: "next_exercise" });
  const confirm = async (
    revision: number,
    mode: "program" | "single" = "program",
    direction: "strength" | "yoga" = "strength",
    owner = alice,
  ) => {
    await db()
      .insert(workoutPlannerPrograms)
      .values({
        userId: owner,
        revision,
        draft: { ...program, config: { ...program.config, mode, direction } },
      });
  };

  beforeAll(async () => {
    const url = new URL(process.env.DATABASE_URL!);
    if (!["127.0.0.1", "localhost"].includes(url.hostname))
      throw new Error("Planner fixtures require local PostgreSQL");
    const seed = await loadCatalogSeed();
    const editorial = seed.find((row) => row.id === "strength.squat.bodyweight")!.editorial;
    await db()
      .insert(user)
      .values([
        { id: alice, name: "Planner Alice", email: `${alice}@example.test`, emailVerified: true },
        { id: bob, name: "Planner Bob", email: `${bob}@example.test`, emailVerified: true },
      ]);
    await db()
      .insert(profiles)
      .values(
        [alice, bob].map((userId) => ({ userId, onboardingCompleted: true, adultConfirmed: true })),
      );
    await db()
      .insert(resourceTypes)
      .values([
        { code: "floor", nameRu: "Пол", kind: "support" },
        { code: "clear_space", nameRu: "Место", kind: "space" },
      ])
      .onConflictDoNothing();
    [resourceId] = (
      await db()
        .insert(resourceTypes)
        .values({ code: resourceCode, nameRu: "Fixture resource", kind: "equipment" })
        .returning({ id: resourceTypes.id })
    ).map((row) => row.id);
    await db()
      .insert(exercises)
      .values({ id: familyId, nameRu: "Planner fixture", discipline: "strength" });
    for (const [index, metric] of ["reps", "reps", "time"].entries()) {
      const variantId = `${familyId}.${index}`;
      variantIds.push(variantId);
      await db()
        .insert(variants)
        .values({
          id: variantId,
          exerciseId: familyId,
          nameRu: `Fixture ${index}`,
          aliasEn: `Fixture ${index}`,
          pattern: "squat",
          resistanceMode: "bodyweight",
          metric,
          sourceBasis: "integration_fixture",
        });
      await db()
        .insert(variantRevisions)
        .values({
          variantId,
          revision: 1,
          instructions: "Pinned fixture instruction",
          editorial: {
            ...editorial,
            displayNameRu: `Planner ${index}`,
            contexts: ["home"],
            directions: ["strength", "yoga"],
            cues: [`Pinned instruction ${index}`],
            skillDemand: {
              kind: "none",
              requiresPriorSkill: false,
              rationale: "Integration fixture",
            },
            execution: { ...editorial.execution, assignmentGate: "standard_review" },
          },
        });
      await db()
        .insert(variantRequirements)
        .values({ variantId, resourceTypeId: resourceId, quantity: 1 });
    }
    const inventoryInput = {
      operationId: randomUUID(),
      expectedRevision: 0,
      place: "home",
      resources: [{ code: resourceCode, quantity: 1, isStable: null }],
    };
    inventoryRevision = (await saveBuilderInventory(alice, inventoryInput)).revision;
    await saveBuilderInventory(bob, { ...inventoryInput, operationId: randomUUID() });
    const catalog = (await getAvailableBuilderCatalog(alice, "home", "strength", db())).filter(
      (exercise) => variantIds.includes(exercise.variantId),
    );
    expect(catalog).toHaveLength(3);
    program = {
      policyVersion: "planner-v1",
      config: {
        mode: "program",
        place: "home",
        direction: "strength",
        split: "fullbody",
        daysPerWeek: 3,
        intent: "start",
        durationMinutes: 25,
        execution: "pairs",
        variety: "familiar",
      },
      days: [
        {
          key: "day-1",
          title: "Pinned day",
          sourceTemplateId: "fixture",
          warnings: [],
          estimate: { minSeconds: 300, maxSeconds: 600, version: "planning-v1" },
          steps: catalog.map((exercise, index) => ({
            exercise:
              index === 2
                ? { ...exercise, timing: { ...exercise.timing, perSide: true } }
                : exercise,
            revisionId: exercise.revisionId,
            sourceVariantId: exercise.variantId,
            slotKey: `slot-${index}`,
            phase: index === 2 ? "cooldown" : "main",
            sets: index === 2 ? 1 : 2,
            target: index === 2 ? 20 : 8,
            restSeconds: 45,
            ...(index < 2 ? { pairKey: "pair-1", transitionSeconds: 12 } : {}),
          })),
        },
      ],
      notes: [],
      changes: [],
      weeklyPrimarySets: [],
      disclosure: "Draft fixture",
      historySummary: {
        confirmedSets: 0,
        lastWorkoutAt: null,
        recentPrimaryMuscles: [],
        returningAfterPause: false,
      },
    };
    await confirm(1);
  }, 30_000);

  afterAll(async () => {
    await db()
      .delete(user)
      .where(inArray(user.id, [alice, bob]));
    if (variantIds.length) {
      await db()
        .delete(variantRequirements)
        .where(inArray(variantRequirements.variantId, variantIds));
      await db().delete(variantRevisions).where(inArray(variantRevisions.variantId, variantIds));
      await db().delete(variants).where(inArray(variants.id, variantIds));
    }
    await db().delete(exercises).where(eq(exercises.id, familyId));
    if (resourceId) await db().delete(resourceTypes).where(eq(resourceTypes.id, resourceId));
    await closeDb();
  });

  it("authorizes exact private revision/day and admits same-operation retries once without XP", async () => {
    await expect(startPlannerWorkout(bob, startInput())).rejects.toMatchObject({
      code: "PROGRAM_NOT_FOUND",
    });
    await expect(
      startPlannerWorkout(alice, { ...startInput(), dayKey: "missing" }),
    ).rejects.toMatchObject({ code: "DAY_NOT_FOUND" });
    const input = { ...startInput(), operationId: startId };
    const [first, retry] = await Promise.all([
      startPlannerWorkout(alice, input),
      startPlannerWorkout(alice, input),
    ]);
    active = first;
    expect(retry).toEqual(first);
    expect(first).toMatchObject({
      sourcePlannerRevision: 1,
      sourcePlannerDayKey: "day-1",
      rewardKind: "main",
      status: "active",
      revision: 1,
    });
    expect(first.exercises[0]).toMatchObject({
      pairKey: "pair-1",
      transitionSeconds: 12,
      restSeconds: 45,
      phase: "main",
      status: "draft",
    });
    expect(first.exercises[2]).toMatchObject({
      metric: "time",
      targetDurationSeconds: 20,
      perSide: true,
      phase: "cooldown",
    });
    expect(await db().select().from(workouts).where(eq(workouts.userId, alice))).toHaveLength(1);
    expect(
      (await db().select().from(plans).where(eq(plans.userId, alice)))[0].templateId,
    ).toBeNull();
    expect(
      await db().select().from(workoutSteps).where(eq(workoutSteps.workoutId, first.id)),
    ).toHaveLength(3);
    expect(
      (
        await db().select().from(workoutResources).where(eq(workoutResources.workoutId, first.id))
      ).some((resource) => resource.resourceTypeId === resourceId),
    ).toBe(true);
    expect(await db().select().from(xpEvents).where(eq(xpEvents.userId, alice))).toEqual([]);
    expect(await db().select().from(dailyXp).where(eq(dailyXp.userId, alice))).toEqual([]);
    await expect(startPlannerWorkout(alice, startInput())).rejects.toMatchObject({
      code: "WORKOUT_ACTIVE",
    });
    await expect(startPlannerWorkout(alice, { ...input, dayKey: "other" })).rejects.toMatchObject({
      code: "OPERATION_REUSED",
    });
    await db()
      .insert(plannerCommands)
      .values({ userId: bob, operationId: startId, payloadHash: "another-action", result: {} });
    await expect(startPlannerWorkout(bob, input)).rejects.toMatchObject({
      code: "OPERATION_REUSED",
    });
  });

  it("uses actual seconds, serializes pair commands, preserves replay and blocks duplicate/early advances", async () => {
    await expect(getWorkout(bob, active.id)).rejects.toMatchObject({ code: "WORKOUT_NOT_FOUND" });
    const firstRecord = {
      operationId: randomUUID(),
      expectedRevision: active.revision,
      command: {
        type: "record_set",
        exerciseId: active.exercises[0].id,
        setId: randomUUID(),
        reps: 7,
        weightKg: 2.5,
      },
    };
    await expect(applyWorkoutCommand(bob, active.id, firstRecord)).rejects.toMatchObject({
      code: "WORKOUT_NOT_FOUND",
    });
    await expect(next(active)).rejects.toMatchObject({ code: "INCOMPLETE_EXERCISE" });
    await expect(
      command(active, {
        type: "record_set",
        exerciseId: active.exercises[1].id,
        setId: randomUUID(),
        reps: 7,
        weightKg: 0,
      }),
    ).rejects.toMatchObject({ code: "INVALID_SET" });
    const [recorded, retry] = await Promise.all([
      applyWorkoutCommand(alice, active.id, firstRecord),
      applyWorkoutCommand(alice, active.id, firstRecord),
    ]);
    active = recorded.workout;
    expect(retry).toEqual(recorded);
    expect(active.recordedSets).toHaveLength(1);
    await expect(record(active)).rejects.toMatchObject({ code: "PAIR_ORDER" });
    active = await next(active);
    expect(active.currentIndex).toBe(1);
    await expect(next(active)).rejects.toMatchObject({ code: "INCOMPLETE_EXERCISE" });
    active = await next(await record(active));
    expect(active.currentIndex).toBe(0);
    active = await next(await record(active));
    expect(active.currentIndex).toBe(1);
    active = await next(await record(active));
    expect(active.currentIndex).toBe(2);
    await expect(
      command(active, {
        type: "record_set",
        exerciseId: active.exercises[2].id,
        setId: randomUUID(),
        reps: 20,
        weightKg: 0,
      }),
    ).rejects.toMatchObject({ code: "INVALID_METRIC" });
    active = await record(active);
    active = await command(active, { type: "finish" });
    expect(active.status).toBe("completed");
    expect(active.recordedSets.map((set) => set.exerciseId)).toEqual([
      active.exercises[0].id,
      active.exercises[1].id,
      active.exercises[0].id,
      active.exercises[1].id,
      active.exercises[2].id,
    ]);
    expect(
      active.recordedSets.find((set) => set.exerciseId === active.exercises[2].id),
    ).toMatchObject({ reps: null, durationSeconds: 17, weightKg: 0 });
    expect(active.reward).toMatchObject({ awardedXp: 50, kind: "main" });
    expect(await startPlannerWorkout(alice, { ...startInput(), operationId: startId })).toEqual(
      active,
    );
  });

  it("keeps weekly revision after a single confirmation and admits only one concurrent different start", async () => {
    await confirm(2, "single");
    const starts = await Promise.allSettled([
      startPlannerWorkout(alice, startInput(1)),
      startPlannerWorkout(alice, startInput(1)),
    ]);
    expect(starts.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(
      starts.filter((result) => result.status === "rejected").map((result) => result.reason.code),
    ).toEqual(["WORKOUT_ACTIVE"]);
    const admitted = starts.find((result) => result.status === "fulfilled");
    if (!admitted || admitted.status !== "fulfilled")
      throw new Error("Expected one admitted workout");
    active = await command(admitted.value, { type: "end_early" });
    expect(active.status).toBe("aborted");
    await confirm(3);
    await expect(startPlannerWorkout(alice, startInput(1))).rejects.toMatchObject({
      code: "REVISION_CONFLICT",
    });
  });

  it("checks current inventory and exact revisions before starting, then retains skipped pair results", async () => {
    inventoryRevision = (
      await saveBuilderInventory(alice, {
        operationId: randomUUID(),
        expectedRevision: inventoryRevision,
        place: "home",
        resources: [],
      })
    ).revision;
    await expect(startPlannerWorkout(alice, startInput(3))).rejects.toMatchObject({
      code: "PROGRAM_UNAVAILABLE",
    });
    inventoryRevision = (
      await saveBuilderInventory(alice, {
        operationId: randomUUID(),
        expectedRevision: inventoryRevision,
        place: "home",
        resources: [{ code: resourceCode, quantity: 1, isStable: null }],
      })
    ).revision;
    const revisionId = program.days[0].steps[0].revisionId;
    await db()
      .update(variantRevisions)
      .set({ status: "retired" })
      .where(eq(variantRevisions.id, revisionId));
    await expect(startPlannerWorkout(alice, startInput(3))).rejects.toMatchObject({
      code: "PROGRAM_UNAVAILABLE",
    });
    await db()
      .update(variantRevisions)
      .set({ status: "draft" })
      .where(eq(variantRevisions.id, revisionId));
    active = await startPlannerWorkout(alice, startInput(3));
    expect(
      (
        await db()
          .select()
          .from(workouts)
          .where(and(eq(workouts.userId, alice), eq(workouts.id, active.id)))
      )[0].sourceProfileRevision,
    ).toBe(inventoryRevision);
    active = await next(await record(active));
    active = await command(active, { type: "skip_exercise", exerciseId: active.exercises[1].id });
    expect(active.currentIndex).toBe(0);
    active = await next(await record(active));
    expect(active.currentIndex).toBe(2);
    active = await command(await record(active), { type: "finish" });
    expect(active).toMatchObject({ status: "partial", reward: { eligibleXp: 25, awardedXp: 0 } });
    expect(active.recordedSets).toHaveLength(3);
  });

  it("derives support reward from the saved direction and never awards XP at admission", async () => {
    await confirm(1, "single", "yoga", bob);
    const workout = await startPlannerWorkout(bob, startInput());
    expect(workout.rewardKind).toBe("support");
    expect(await db().select().from(xpEvents).where(eq(xpEvents.userId, bob))).toEqual([]);
    const ack = await applyWorkoutCommand(bob, workout.id, {
      operationId: randomUUID(),
      expectedRevision: workout.revision,
      command: {
        type: "record_set",
        exerciseId: workout.exercises[0].id,
        setId: randomUUID(),
        reps: 7,
        weightKg: 0,
      },
    });
    const ended = await applyWorkoutCommand(bob, workout.id, {
      operationId: randomUUID(),
      expectedRevision: ack.workout.revision,
      command: { type: "end_early" },
    });
    expect(ended.workout).toMatchObject({
      status: "partial",
      reward: { kind: "support", eligibleXp: 10, awardedXp: 10 },
    });
  });
});
