import { describe, expect, it } from "vitest";
import { dropSetPlanError, dropSetResultError, supportsDropSet } from "./training-methods";
import type { BuilderExercise } from "./workout-builder";

const exercise: BuilderExercise = {
  variantId: "strength.biceps_curl.dumbbell",
  revisionId: crypto.randomUUID(),
  name: "Сгибание",
  metric: "reps",
  resistanceMode: "external_load",
  focusMode: "loading",
  difficulty: "beginner",
  primaryMuscles: [],
  secondaryMuscles: [],
  equipment: [],
  instructions: [],
  status: "draft",
  timing: {
    secondsPerRep: { min: 2, max: 4 },
    setupSeconds: { min: 5, max: 10 },
    sideSwitchSeconds: { min: 5, max: 10 },
    perSide: false,
  },
};
describe("bounded optional drop sets", () => {
  const dropSet = { kind: "last_set_drop" as const, targetReps: 8 };
  it("admits only explicit loaded repetition variants outside pairs and warmup", () => {
    expect(supportsDropSet(exercise)).toBe(true);
    expect(dropSetPlanError({ exercise, dropSet })).toBeNull();
    for (const step of [
      { exercise, dropSet, pairKey: "pair" },
      { exercise, dropSet, phase: "warmup" },
      { exercise: { ...exercise, variantId: "strength.squat.barbell" }, dropSet },
      { exercise: { ...exercise, metric: "time" as const }, dropSet },
      { exercise: { ...exercise, resistanceMode: "bodyweight" as const }, dropSet },
      { exercise, dropSet: { ...dropSet, targetReps: 31 } },
    ])
      expect(dropSetPlanError(step)).toBeTruthy();
  });
  it("allows omission, checks the last set and requires a lower positive load", () => {
    const step = { sets: 3, metric: "reps", dropSet };
    expect(dropSetResultError(step, 2, 10, { reps: 8, weightKg: 7.5 })).toBeNull();
    expect(dropSetResultError(step, 2, 0, undefined)).toBeNull();
    expect(dropSetResultError(step, 1, 10, { reps: 8, weightKg: 7.5 })).toBeTruthy();
    expect(
      dropSetResultError({ ...step, dropSet: undefined }, 2, 10, { reps: 8, weightKg: 7.5 }),
    ).toBeTruthy();
    for (const weightKg of [0, -1, 10, 11, NaN, Infinity, 0.1234])
      expect(dropSetResultError(step, 2, 10, { reps: 8, weightKg })).toBeTruthy();
    for (const reps of [0, 1.5, 101, NaN])
      expect(dropSetResultError(step, 2, 10, { reps, weightKg: 7.5 })).toBeTruthy();
  });
});
