import { describe, expect, it } from "vitest";
import {
  estimateBuilderWorkout,
  builderPairError,
  type BuilderExercise,
  type BuilderSelectedStep,
} from "./workout-builder";

function step(
  overrides: Partial<BuilderSelectedStep> = {},
  perSide = false,
  metric: "reps" | "time" = "reps",
): BuilderSelectedStep {
  const exercise: BuilderExercise = {
    variantId: "test.exercise",
    revisionId: "11111111-1111-4111-8111-111111111111",
    name: "Упражнение",
    metric,
    resistanceMode: "bodyweight",
    difficulty: "beginner",
    primaryMuscles: [],
    secondaryMuscles: [],
    equipment: [],
    instructions: [],
    status: "draft",
    timing: {
      secondsPerRep: { min: 2, max: 4 },
      setupSeconds: { min: 5, max: 15 },
      sideSwitchSeconds: { min: 5, max: 10 },
      perSide,
    },
  };
  return {
    revisionId: exercise.revisionId,
    sets: 3,
    target: 10,
    restSeconds: 60,
    exercise,
    ...overrides,
  };
}
describe("constructor duration planning", () => {
  it("counts A–B transitions each round and a single rest between rounds", () => {
    const pair = [
      step({ pairKey: "pair-1", transitionSeconds: 30 }),
      step({ pairKey: "pair-1", transitionSeconds: 30 }),
    ];
    expect(builderPairError(pair)).toBeNull();
    expect(estimateBuilderWorkout(pair)).toEqual({
      minSeconds: 340,
      maxSeconds: 480,
      version: "planning-v1",
    });
    expect(builderPairError([pair[0]])).toBeTruthy();
    expect(builderPairError([pair[0], { ...pair[1], sets: 2 }])).toBeTruthy();
    expect(builderPairError([step({ transitionSeconds: 30 })])).toBeTruthy();
  });
  it("counts rests between sets, leaving the final rest out", () => {
    expect(estimateBuilderWorkout([step()])).toEqual({
      minSeconds: 185,
      maxSeconds: 255,
      version: "planning-v1",
    });
    expect(estimateBuilderWorkout([step({ sets: 1 })])).toEqual({
      minSeconds: 25,
      maxSeconds: 55,
      version: "planning-v1",
    });
  });
  it("counts both sides only for per-side targets and adds changing sides", () => {
    expect(estimateBuilderWorkout([step({}, true)])).toEqual({
      minSeconds: 260,
      maxSeconds: 405,
      version: "planning-v1",
    });
    expect(estimateBuilderWorkout([step({}, false)])).toEqual({
      minSeconds: 185,
      maxSeconds: 255,
      version: "planning-v1",
    });
  });
  it("uses timed seconds without applying a strength repetition tempo", () => {
    expect(estimateBuilderWorkout([step({ sets: 2, target: 30 }, true, "time")])).toEqual({
      minSeconds: 195,
      maxSeconds: 215,
      version: "planning-v1",
    });
  });
  it("adds transitions once between exercises, never before or after the workout", () => {
    expect(estimateBuilderWorkout([step({ sets: 1 }), step({ sets: 1 })])).toEqual({
      minSeconds: 65,
      maxSeconds: 140,
      version: "planning-v1",
    });
    expect(estimateBuilderWorkout([])).toEqual({
      minSeconds: 0,
      maxSeconds: 0,
      version: "planning-v1",
    });
  });
});
