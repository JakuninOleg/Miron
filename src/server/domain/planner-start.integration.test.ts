import { randomUUID } from "node:crypto";
import { applyCalendarCommand, listCalendar } from "./calendar";
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
  muscleGroups,
  plannerCommands,
  plans,
  profiles,
  resourceTypes,
  trials,
  user,
  variantRequirements,
  variantRevisions,
  variantRevisionMuscles,
  variants,
  workoutPlannerPrograms,
  workoutResources,
  workouts,
  workoutSteps,
  xpEvents,
} from "../db/schema";
import { startPlannerWorkout, startSavedWorkout } from "./planner-start";
import {
  getAvailableBuilderCatalog,
  saveBuilderInventory,
  saveCustomWorkout,
} from "./workout-builder";
import { getSavedWorkoutPreview } from "./workout-sources";
import { getProgress } from "./profile";
import { applyWorkoutCommand, getWorkout } from "./workouts";
import { getWorkoutAlternatives } from "./workout-alternatives";

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
      .insert(trials)
      .values([alice, bob].map((userId) => ({ userId })));
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

  it("starts an owned template exactly once, rejects stale/foreign sources and repeats a fresh session", async () => {
    const template = await saveCustomWorkout(alice, {
      operationId: randomUUID(),
      id: randomUUID(),
      expectedRevision: 0,
      name: "Мой короткий комплекс",
      place: "home",
      direction: "strength",
      inventoryRevision,
      steps: [
        {
          revisionId: program.days[0].steps[0].revisionId,
          sets: 1,
          target: 8,
          restSeconds: 30,
          phase: "warmup",
        },
      ],
    });
    const input = {
      source: "template" as const,
      id: template.id,
      expectedSourceRevision: template.revision,
      operationId: randomUUID(),
    };
    await expect(
      getSavedWorkoutPreview(bob, { source: "template", id: template.id }),
    ).rejects.toMatchObject({ code: "TEMPLATE_NOT_FOUND" });
    await expect(
      startSavedWorkout(alice, { ...input, expectedSourceRevision: 999 }),
    ).rejects.toMatchObject({ code: "REVISION_CONFLICT" });
    const [one, two] = await Promise.all([
      startSavedWorkout(alice, input),
      startSavedWorkout(alice, input),
    ]);
    expect(one.id).toBe(two.id);
    expect(template.steps[0].phase).toBe("warmup");
    expect(one.exercises[0].phase).toBe("warmup");
    expect(one).toMatchObject({
      rewardKind: "support",
      recordedSets: [],
      source: { kind: "template", id: template.id, revision: template.revision },
    });
    await expect(
      startSavedWorkout(alice, { ...input, operationId: randomUUID() }),
    ).rejects.toMatchObject({ code: "WORKOUT_ACTIVE" });
    await expect(
      startSavedWorkout(alice, { ...input, expectedSourceRevision: 2 }),
    ).rejects.toMatchObject({ code: "OPERATION_REUSED" });
    const closed = await command(await record(one), { type: "finish" });
    const preview = await getSavedWorkoutPreview(alice, { source: "history", id: closed.id });
    expect(preview.day.steps[0].target).toBe(8);
    expect(preview.rewardKind).toBe("support");
    await expect(
      getSavedWorkoutPreview(bob, { source: "history", id: closed.id }),
    ).rejects.toMatchObject({ code: "WORKOUT_NOT_FOUND" });
    const repeat = await startSavedWorkout(alice, {
      source: "history",
      id: closed.id,
      expectedSourceRevision: preview.revision,
      operationId: randomUUID(),
    });
    expect(repeat.id).not.toBe(closed.id);
    expect(repeat.exercises[0].phase).toBe("warmup");
    expect(repeat.recordedSets).toEqual([]);
    expect(repeat.source).toMatchObject({ kind: "history", id: closed.id });
    expect((await getWorkout(alice, closed.id)).recordedSets[0].weightKg).toBe(2.5);
    await command(repeat, { type: "end_early" });
  });

  it("corrects facts idempotently, undoes the last active set and preserves terminal XP", async () => {
    const template = await saveCustomWorkout(alice, {
      operationId: randomUUID(),
      id: randomUUID(),
      expectedRevision: 0,
      name: "Исправления",
      place: "home",
      direction: "strength",
      inventoryRevision,
      steps: [
        { revisionId: program.days[0].steps[0].revisionId, sets: 2, target: 8, restSeconds: 30 },
      ],
    });
    const started = await startSavedWorkout(alice, {
      source: "template",
      id: template.id,
      expectedSourceRevision: template.revision,
      operationId: randomUUID(),
    });
    const recorded = await record(started);
    const change = {
      operationId: randomUUID(),
      expectedRevision: recorded.revision,
      command: {
        type: "correct_set" as const,
        setId: recorded.recordedSets[0].id,
        reps: 9,
        weightKg: 3,
      },
    };
    const [first, second] = await Promise.all([
      applyWorkoutCommand(alice, started.id, change),
      applyWorkoutCommand(alice, started.id, change),
    ]);
    expect(first).toEqual(second);
    expect(first.workout.recordedSets[0]).toMatchObject({ reps: 9, weightKg: 3 });
    await expect(applyWorkoutCommand(bob, started.id, change)).rejects.toMatchObject({
      code: "WORKOUT_NOT_FOUND",
    });
    const undone = await command(first.workout, {
      type: "undo_set",
      setId: recorded.recordedSets[0].id,
    });
    expect(undone.recordedSets).toEqual([]);
    const closed = await command(await record(await record(undone)), { type: "finish" });
    const before = await getProgress(alice);
    const edited = await command(closed, {
      type: "correct_set",
      setId: closed.recordedSets[0].id,
      reps: 6,
      weightKg: 2,
    });
    expect(edited.status).toBe("completed");
    expect(edited.reward).toEqual(closed.reward);
    expect(edited.completedAt).toBe(closed.completedAt);
    expect((await getProgress(alice)).xp).toBe(before.xp);
    expect((await getProgress(alice)).journey).toEqual(before.journey);
    await expect(
      command(edited, { type: "undo_set", setId: edited.recordedSets[1].id }),
    ).rejects.toMatchObject({ code: "WORKOUT_EDIT_UNAVAILABLE" });
  });

  it("rechecks equivalent replacements, preserves facts and replays the confirmed change", async () => {
    await db()
      .insert(muscleGroups)
      .values({ code: "quads", nameRu: "Передняя поверхность бедра" })
      .onConflictDoNothing();
    const revisions = await db()
      .select({ id: variantRevisions.id })
      .from(variantRevisions)
      .where(inArray(variantRevisions.variantId, variantIds.slice(0, 2)));
    await db()
      .insert(variantRevisionMuscles)
      .values(
        revisions.map((revision) => ({
          variantRevisionId: revision.id,
          muscleGroupCode: "quads",
          role: "primary",
        })),
      )
      .onConflictDoNothing();
    const template = await saveCustomWorkout(alice, {
      operationId: randomUUID(),
      id: randomUUID(),
      expectedRevision: 0,
      name: "Замена",
      place: "home",
      direction: "strength",
      inventoryRevision,
      steps: [
        { revisionId: program.days[0].steps[0].revisionId, sets: 2, target: 8, restSeconds: 30 },
      ],
    });
    const started = await startSavedWorkout(alice, {
      source: "template",
      id: template.id,
      expectedSourceRevision: 1,
      operationId: randomUUID(),
    });
    const alternatives = await getWorkoutAlternatives(alice, started.id, started.exercises[0].id);
    const chosen = alternatives.candidates.find((exercise) => exercise.variantId === variantIds[1]);
    expect(chosen).toBeDefined();
    if (!chosen) throw new Error("Expected fixture alternative");
    const input = {
      operationId: randomUUID(),
      expectedRevision: started.revision,
      command: {
        type: "replace_exercise",
        exerciseId: started.exercises[0].id,
        revisionId: chosen.revisionId,
      },
    };
    await db()
      .update(variantRevisions)
      .set({ status: "revoked" })
      .where(eq(variantRevisions.id, chosen.revisionId));
    await expect(applyWorkoutCommand(alice, started.id, input)).rejects.toMatchObject({
      code: "EXERCISE_UNAVAILABLE",
    });
    await db()
      .update(variantRevisions)
      .set({ status: "draft" })
      .where(eq(variantRevisions.id, chosen.revisionId));
    const [one, replay] = await Promise.all([
      applyWorkoutCommand(alice, started.id, input),
      applyWorkoutCommand(alice, started.id, input),
    ]);
    expect(replay).toEqual(one);
    expect(one.workout.exercises[0]).toMatchObject({
      id: started.exercises[0].id,
      revisionId: chosen.revisionId,
      name: chosen.name,
      sets: 2,
    });
    expect(one.workout.recordedSets).toEqual([]);
    await expect(
      getWorkoutAlternatives(bob, started.id, started.exercises[0].id),
    ).rejects.toMatchObject({ code: "WORKOUT_NOT_FOUND" });
    const logged = await record(one.workout);
    await expect(
      getWorkoutAlternatives(alice, logged.id, logged.exercises[0].id),
    ).rejects.toMatchObject({ code: "REPLACEMENT_UNAVAILABLE" });
    await command(logged, { type: "end_early" });
  });

  it("confirms lighter remaining groups idempotently without rewriting recorded work", async () => {
    const revisionId = program.days[0].steps[0].revisionId;
    const template = await saveCustomWorkout(alice, {
      operationId: randomUUID(),
      id: randomUUID(),
      expectedRevision: 0,
      name: "Облегчение",
      place: "home",
      direction: "strength",
      inventoryRevision,
      steps: [
        { revisionId, sets: 2, target: 8, restSeconds: 30 },
        { revisionId, sets: 3, target: 8, restSeconds: 30 },
        { revisionId, phase: "cooldown", sets: 2, target: 8, restSeconds: 30 },
      ],
    });
    const started = await startSavedWorkout(alice, {
      source: "template",
      id: template.id,
      expectedSourceRevision: 1,
      operationId: randomUUID(),
    });
    const logged = await record(started);
    const xp = (await getProgress(alice)).xp;
    const input = {
      operationId: randomUUID(),
      expectedRevision: logged.revision,
      command: { type: "lighten_remaining" },
    };
    const [one, replay] = await Promise.all([
      applyWorkoutCommand(alice, logged.id, input),
      applyWorkoutCommand(alice, logged.id, input),
    ]);
    expect(replay).toEqual(one);
    expect(one.workout.exercises.map((item) => item.sets)).toEqual([2, 2, 2]);
    expect(one.workout.recordedSets).toEqual(logged.recordedSets);
    expect(one.progress.xp).toBe(xp);
    const previewSteps = await db()
      .select()
      .from(workoutSteps)
      .where(eq(workoutSteps.workoutId, logged.id))
      .orderBy(workoutSteps.ordinal);
    expect(previewSteps[1].snapshot?.sets).toBe(2);
    await expect(applyWorkoutCommand(bob, logged.id, input)).rejects.toMatchObject({
      code: "WORKOUT_NOT_FOUND",
    });
    const closed = await command(one.workout, { type: "end_early" });
    await expect(command(closed, { type: "lighten_remaining" })).rejects.toMatchObject({
      code: "WORKOUT_EDIT_UNAVAILABLE",
    });
  });

  it("schedules immutable compositions, moves/skips without XP and atomically starts once", async () => {
    const template = await saveCustomWorkout(alice, {
      operationId: randomUUID(),
      id: randomUUID(),
      expectedRevision: 0,
      name: "По расписанию",
      place: "home",
      direction: "strength",
      inventoryRevision,
      steps: [
        { revisionId: program.days[0].steps[0].revisionId, sets: 1, target: 8, restSeconds: 30 },
      ],
    });
    const payload = {
      type: "create",
      operationId: randomUUID(),
      id: randomUUID(),
      date: "2026-10-20",
      selection: { source: "template", id: template.id, revision: template.revision },
    };
    const xp = (await getProgress(alice)).xp;
    const [entry, replay] = await Promise.all([
      applyCalendarCommand(alice, payload),
      applyCalendarCommand(alice, payload),
    ]);
    expect(replay).toEqual(entry);
    expect(
      (await listCalendar(alice, "2026-10-01", "2026-10-31")).filter(
        (item) => item.id === entry.id,
      ),
    ).toHaveLength(1);
    await expect(
      applyCalendarCommand(bob, {
        type: "skip",
        id: entry.id,
        expectedRevision: 1,
        operationId: randomUUID(),
      }),
    ).rejects.toMatchObject({ code: "SCHEDULE_NOT_FOUND" });
    const moved = await applyCalendarCommand(alice, {
      type: "move",
      id: entry.id,
      expectedRevision: 1,
      date: "2026-10-21",
      operationId: randomUUID(),
    });
    expect(moved.date).toBe("2026-10-21");
    await expect(
      applyCalendarCommand(alice, {
        type: "skip",
        id: entry.id,
        expectedRevision: 1,
        operationId: randomUUID(),
      }),
    ).rejects.toMatchObject({ code: "REVISION_CONFLICT" });
    await saveCustomWorkout(alice, {
      operationId: randomUUID(),
      id: template.id,
      expectedRevision: template.revision,
      name: "Обновлённая библиотека",
      place: "home",
      direction: "strength",
      inventoryRevision,
      steps: [
        { revisionId: program.days[0].steps[0].revisionId, sets: 2, target: 10, restSeconds: 30 },
      ],
    });
    const preview = await getSavedWorkoutPreview(alice, { source: "schedule", id: entry.id });
    expect(preview.day.title).toBe("По расписанию");
    expect(preview.day.steps[0].sets).toBe(1);
    const start = {
      source: "schedule",
      id: entry.id,
      expectedSourceRevision: moved.revision,
      operationId: randomUUID(),
    };
    const [one, two] = await Promise.all([
      startSavedWorkout(alice, start),
      startSavedWorkout(alice, start),
    ]);
    expect(two.id).toBe(one.id);
    expect(
      (await listCalendar(alice, "2026-10-01", "2026-10-31")).find((item) => item.id === entry.id),
    ).toMatchObject({ status: "started", workoutId: one.id });
    await expect(
      startSavedWorkout(alice, { ...start, operationId: randomUUID() }),
    ).rejects.toMatchObject({ code: "SCHEDULE_CLOSED" });
    await command(one, { type: "end_early" });
    const second = await applyCalendarCommand(alice, {
      ...payload,
      id: randomUUID(),
      operationId: randomUUID(),
      selection: { ...payload.selection, revision: 2 },
    });
    await applyCalendarCommand(alice, {
      type: "skip",
      id: second.id,
      expectedRevision: 1,
      operationId: randomUUID(),
    });
    expect((await getProgress(alice)).xp).toBe(xp);
    await expect(
      applyCalendarCommand(alice, {
        ...payload,
        id: randomUUID(),
        operationId: randomUUID(),
        date: "2026-02-31",
      }),
    ).rejects.toBeTruthy();
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
  it("keeps an admitted workout and old ACK usable after expiry while denying new sessions", async () => {
    const save = {
      operationId: randomUUID(),
      id: randomUUID(),
      expectedRevision: 0,
      name: "До окончания доступа",
      place: "home",
      direction: "strength",
      inventoryRevision,
      steps: [
        { revisionId: program.days[0].steps[0].revisionId, sets: 1, target: 8, restSeconds: 30 },
      ],
    };
    const template = await saveCustomWorkout(alice, save);
    const start = {
      source: "template",
      id: template.id,
      expectedSourceRevision: 1,
      operationId: randomUUID(),
    };
    const admitted = await startSavedWorkout(alice, start);
    await db()
      .update(trials)
      .set({ endsAt: new Date(Date.now() - 1) })
      .where(eq(trials.userId, alice));
    expect((await startSavedWorkout(alice, start)).id).toBe(admitted.id);
    expect((await saveCustomWorkout(alice, save)).id).toBe(template.id);
    const closed = await command(await record(admitted), { type: "finish" });
    expect(closed.status).toBe("completed");
    await expect(
      startSavedWorkout(alice, { ...start, operationId: randomUUID() }),
    ).rejects.toMatchObject({ code: "PRODUCT_ACCESS_EXPIRED" });
    expect((await getSavedWorkoutPreview(alice, { source: "history", id: closed.id })).id).toBe(
      closed.id,
    );
    await expect(
      saveCustomWorkout(alice, { ...save, operationId: randomUUID(), id: randomUUID() }),
    ).rejects.toMatchObject({ code: "PRODUCT_ACCESS_EXPIRED" });
  });
});
