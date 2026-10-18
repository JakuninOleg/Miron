import { describe, expect, it } from "vitest";
import { buildDemoWorkout, DEFAULT_PROFILE } from "@/shared/demo";
import { demoProgress, reduceWorkout } from "./workout-reducer";
describe("provisional workout reducer", () => {
  it("records an optional last-set reduction atomically without another set or extra XP", () => {
    const workout = buildDemoWorkout(DEFAULT_PROFILE);
    const exercise = {
      ...workout.exercises[0],
      sets: 1,
      metric: "reps" as const,
      dropSet: { kind: "last_set_drop" as const, targetReps: 8 },
    };
    workout.exercises = [exercise];
    const command = {
      type: "record_set" as const,
      exerciseId: exercise.id,
      setId: crypto.randomUUID(),
      reps: 10,
      weightKg: 10,
      drop: { reps: 8, weightKg: 7.5 },
    };
    const recorded = reduceWorkout(workout, command);
    expect(recorded.recordedSets).toHaveLength(1);
    expect(recorded.recordedSets[0].drop).toEqual(command.drop);
    expect(workout.recordedSets).toHaveLength(0);
    expect(() => reduceWorkout(recorded, command)).toThrow();
    const plain = reduceWorkout(workout, { ...command, drop: undefined });
    const base = { xp: 0, completedWorkouts: 0, history: [] };
    expect(demoProgress(base, reduceWorkout(recorded, { type: "finish" })).xp).toBe(
      demoProgress(base, reduceWorkout(plain, { type: "finish" })).xp,
    );
    expect(() => reduceWorkout(workout, { ...command, drop: { reps: 8, weightKg: 10 } })).toThrow();
  });
  it("records optional load feedback without touching sets, energy, completion or XP", () => {
    const original = buildDemoWorkout(DEFAULT_PROFILE);
    expect(() => reduceWorkout(original, { type: "rate_load", feedback: "easy" })).toThrow();
    const recorded = reduceWorkout(original, {
      type: "record_set",
      exerciseId: original.exercises[0].id,
      setId: crypto.randomUUID(),
      reps: 8,
      weightKg: 0,
    });
    const terminal = reduceWorkout(recorded, { type: "end_early" });
    const progress = demoProgress({ xp: 0, completedWorkouts: 0, history: [] }, terminal);
    for (const feedback of ["easy", "just_right", "hard", "too_hard"] as const) {
      const rated = reduceWorkout(terminal, { type: "rate_load", feedback });
      expect(rated.loadFeedback).toBe(feedback);
      expect(rated.revision).toBe(terminal.revision + 1);
      expect(rated.recordedSets).toEqual(terminal.recordedSets);
      expect(rated.energyEstimate).toEqual(terminal.energyEstimate);
      expect(rated.completedAt).toBe(terminal.completedAt);
      expect(demoProgress(progress, rated).xp).toBe(progress.xp);
    }
    const aborted = reduceWorkout(original, { type: "end_early" });
    expect(() => reduceWorkout(aborted, { type: "rate_load", feedback: "hard" })).toThrow();
    expect(() =>
      reduceWorkout(
        {
          ...terminal,
          exercises: terminal.exercises.map((exercise) => ({ ...exercise, phase: "warmup" })),
        },
        { type: "rate_load", feedback: "easy" },
      ),
    ).toThrow();
  });
  it("automatically estimates on terminal save, then revises energy without duplicate XP", () => {
    const original = buildDemoWorkout(DEFAULT_PROFILE);
    const recorded = reduceWorkout(original, {
      type: "record_set",
      exerciseId: original.exercises[0].id,
      setId: crypto.randomUUID(),
      reps: 10,
      weightKg: 0,
    });
    const terminal = reduceWorkout(recorded, { type: "end_early" });
    expect(terminal.energyEstimate).toBeDefined();
    const progress = demoProgress({ xp: 0, completedWorkouts: 0, history: [] }, terminal);
    const revised = reduceWorkout(terminal, {
      type: "estimate_energy",
      bodyWeightKg: 90,
      workload: [{ exerciseId: original.exercises[0].id, sets: 4, repsPerSet: 12 }],
    });
    const next = demoProgress(progress, revised);
    expect(next.xp).toBe(progress.xp);
    expect(next.history).toHaveLength(1);
    expect(next.history[0].energyEstimate).toEqual(revised.energyEstimate);
    expect(revised.recordedSets).toEqual(terminal.recordedSets);
    expect(progress.history[0].energyEstimate).toEqual(terminal.energyEstimate);
    expect(() => reduceWorkout(revised, { type: "finish" })).toThrow("уже завершена");
    const knownWeightResult = reduceWorkout(
      recorded,
      { type: "end_early" },
      "2026-10-12T10:00:00Z",
      90,
    );
    expect(knownWeightResult.energyEstimate).toMatchObject({
      bodyWeightKg: 90,
      weightSource: "user_reported",
    });
  });
  it("keeps performed sets when skipping and derives partial versus aborted without zero sets", () => {
    const original = buildDemoWorkout(DEFAULT_PROFILE);
    const exerciseId = original.exercises[0].id;
    const performed = reduceWorkout(original, {
      type: "record_set",
      exerciseId,
      setId: crypto.randomUUID(),
      reps: 8,
      weightKg: 0,
    });
    const skipped = reduceWorkout(performed, { type: "skip_exercise", exerciseId });
    expect(skipped.recordedSets).toEqual(performed.recordedSets);
    expect(skipped.exercises[0].skipped).toBe(true);
    expect(skipped.currentIndex).toBe(1);
    const partial = reduceWorkout(skipped, { type: "end_early" });
    expect(partial.status).toBe("partial");
    expect(() => reduceWorkout(partial, { type: "end_early" })).toThrow("уже завершена");
    const progress = demoProgress({ xp: 0, completedWorkouts: 0, history: [] }, partial);
    expect(progress.xp).toBe(25);
    expect(progress.completedWorkouts).toBe(0);
    expect(demoProgress(progress, partial)).toBe(progress);
    const aborted = reduceWorkout(original, { type: "end_early" });
    expect(aborted.status).toBe("aborted");
    expect(demoProgress({ xp: 0, completedWorkouts: 0, history: [] }, aborted).xp).toBe(0);
  });
  it("skipping the last exercise permits terminal save without fabricating completion", () => {
    let workout = buildDemoWorkout(DEFAULT_PROFILE);
    for (const exercise of workout.exercises)
      workout = reduceWorkout(workout, { type: "skip_exercise", exerciseId: exercise.id });
    expect(workout.currentIndex).toBe(workout.exercises.length - 1);
    expect(reduceWorkout(workout, { type: "finish" }).status).toBe("aborted");
    expect(() =>
      reduceWorkout(workout, {
        type: "record_set",
        exerciseId: workout.exercises.at(-1)!.id,
        setId: crypto.randomUUID(),
        reps: 1,
        weightKg: 0,
      }),
    ).toThrow("пропущено");
  });
  it("demo partial awards follow pinned days and top up once instead of summing", () => {
    const prior = {
      xp: 20,
      completedWorkouts: 1,
      history: [
        {
          id: crypto.randomUUID(),
          title: "Короткий комплекс",
          completedAt: "2026-10-07T10:00:00Z",
          sets: 1,
          xp: 20,
          rewardDay: "2026-10-07",
        },
      ],
    };
    let workout = buildDemoWorkout(DEFAULT_PROFILE);
    workout.rewardDay = "2026-10-07";
    workout = reduceWorkout(workout, {
      type: "record_set",
      exerciseId: workout.exercises[0].id,
      setId: crypto.randomUUID(),
      reps: 8,
      weightKg: 0,
    });
    workout = reduceWorkout(workout, { type: "end_early" }, "2026-10-08T10:00:00Z");
    const updated = demoProgress(prior, workout);
    expect(updated.xp).toBe(25);
    expect(updated.history[0]).toMatchObject({ status: "partial", xp: 5, rewardDay: "2026-10-07" });
  });
  it("records actual seconds without inventing repetitions or weight", () => {
    const workout = buildDemoWorkout(DEFAULT_PROFILE);
    workout.exercises[0] = { ...workout.exercises[0], metric: "time", targetDurationSeconds: 20 };
    const command = {
      type: "record_timed_set" as const,
      exerciseId: workout.exercises[0].id,
      setId: crypto.randomUUID(),
      durationSeconds: 35,
    };
    const updated = reduceWorkout(workout, command);
    expect(updated.recordedSets[0]).toMatchObject({ reps: null, durationSeconds: 35, weightKg: 0 });
    expect(() => reduceWorkout(updated, command)).toThrow("уже записан");
    for (const durationSeconds of [0, -1, 0.5, 86401, NaN, Infinity])
      expect(() => reduceWorkout(workout, { ...command, durationSeconds })).toThrow("длительность");
    expect(
      reduceWorkout(workout, { ...command, durationSeconds: 86400 }).recordedSets[0]
        .durationSeconds,
    ).toBe(86400);
  });
  it("rejects a timed command for repetition work and retains legacy time commands", () => {
    const workout = buildDemoWorkout(DEFAULT_PROFILE);
    workout.exercises[0] = { ...workout.exercises[0], metric: "reps" };
    expect(() =>
      reduceWorkout(workout, {
        type: "record_timed_set",
        exerciseId: workout.exercises[0].id,
        setId: crypto.randomUUID(),
        durationSeconds: 20,
      }),
    ).toThrow("не измеряется временем");
    workout.exercises[0].metric = "time";
    const legacy = reduceWorkout(workout, {
      type: "record_set",
      exerciseId: workout.exercises[0].id,
      setId: crypto.randomUUID(),
      reps: 20,
      weightKg: 0,
    });
    expect(legacy.recordedSets[0].reps).toBe(20);
    expect(legacy.recordedSets[0].durationSeconds).toBeUndefined();
  });
  it("rejects foreign exercises, additional sets and skipping incomplete exercises", () => {
    let workout = buildDemoWorkout(DEFAULT_PROFILE);
    const exercise = workout.exercises[0];
    expect(() =>
      reduceWorkout(workout, {
        type: "record_set",
        exerciseId: workout.exercises[1].id,
        setId: crypto.randomUUID(),
        reps: 8,
        weightKg: 0,
      }),
    ).toThrow("текущего");
    expect(() => reduceWorkout(workout, { type: "next_exercise" })).toThrow("подходы");
    for (let i = 0; i < exercise.sets; i++)
      workout = reduceWorkout(workout, {
        type: "record_set",
        exerciseId: exercise.id,
        setId: crypto.randomUUID(),
        reps: 8,
        weightKg: 0,
      });
    expect(() =>
      reduceWorkout(workout, {
        type: "record_set",
        exerciseId: exercise.id,
        setId: crypto.randomUUID(),
        reps: 8,
        weightKg: 0,
      }),
    ).toThrow("Все подходы");
    expect(reduceWorkout(workout, { type: "next_exercise" }).currentIndex).toBe(1);
  });
  it("rejects a fraction of a gram and cannot finish incomplete work", () => {
    const workout = buildDemoWorkout(DEFAULT_PROFILE);
    expect(() =>
      reduceWorkout(workout, {
        type: "record_set",
        exerciseId: workout.exercises[0].id,
        setId: crypto.randomUUID(),
        reps: 8,
        weightKg: 0.0001,
      }),
    ).toThrow("Проверь");
    expect(() => reduceWorkout(workout, { type: "finish" })).toThrow("перед завершением");
  });
  it("demo completion awards one 50 XP event and cannot execute after finish", () => {
    let workout = buildDemoWorkout(DEFAULT_PROFILE);
    for (let index = 0; index < workout.exercises.length; index++) {
      const exercise = workout.exercises[index];
      for (let set = 0; set < exercise.sets; set++)
        workout = reduceWorkout(workout, {
          type: "record_set",
          exerciseId: exercise.id,
          setId: crypto.randomUUID(),
          reps: 8,
          weightKg: 0,
        });
      if (index < workout.exercises.length - 1)
        workout = reduceWorkout(workout, { type: "next_exercise" });
    }
    expect(() => reduceWorkout(workout, { type: "next_exercise" })).toThrow("последнее");
    workout = reduceWorkout(workout, { type: "finish" });
    const progress = demoProgress({ xp: 0, completedWorkouts: 0, history: [] }, workout);
    expect(progress.xp).toBe(50);
    expect(demoProgress(progress, workout)).toBe(progress);
    expect(() => reduceWorkout(workout, { type: "finish" })).toThrow("уже завершена");
  });
});
