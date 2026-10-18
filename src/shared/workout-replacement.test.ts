import { describe, expect, it } from "vitest";
import type { BuilderExercise } from "./workout-builder";
import { isEquivalentExercise } from "./workout-replacement";
const source: BuilderExercise = {
  variantId: "one",
  revisionId: "one",
  name: "Приседание",
  metric: "reps",
  resistanceMode: "bodyweight",
  difficulty: "beginner",
  primaryMuscles: [{ code: "quads", name: "Бёдра" }],
  secondaryMuscles: [],
  equipment: [],
  instructions: [],
  status: "draft",
  movementPattern: "squat",
  focusMode: "loading",
  timing: {
    perSide: false,
    secondsPerRep: { min: 2, max: 4 },
    setupSeconds: { min: 1, max: 2 },
    sideSwitchSeconds: { min: 0, max: 0 },
  },
};
describe("equivalent exercise", () => {
  it("keeps movement, primary muscles, focus, side convention and ability instead of matching just tags", () => {
    const other = { ...source, variantId: "two", revisionId: "two" };
    expect(isEquivalentExercise(source, other)).toBe(true);
    for (const change of [
      { movementPattern: "pull" },
      { primaryMuscles: [] },
      { metric: "time" as const },
      { focusMode: "stretch" as const },
      { difficulty: "advanced" as const },
      { timing: { ...source.timing, perSide: true } },
    ])
      expect(isEquivalentExercise(source, { ...other, ...change })).toBe(false);
    expect(isEquivalentExercise({ ...source, movementPattern: undefined }, other)).toBe(false);
    expect(isEquivalentExercise(source, source)).toBe(false);
  });
});
