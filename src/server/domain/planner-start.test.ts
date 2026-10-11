import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { assertPlannerDayExecution, plannerStartInput } from "./planner-start";
import type { PlannerDay } from "../../shared/workout-planner";
import type { BuilderExercise } from "../../shared/workout-builder";

const card: BuilderExercise = {
  variantId: "fixture",
  revisionId: randomUUID(),
  name: "Fixture",
  metric: "reps",
  resistanceMode: "bodyweight",
  difficulty: "beginner",
  primaryMuscles: [],
  secondaryMuscles: [],
  equipment: [],
  instructions: ["Move"],
  status: "draft",
  timing: {
    secondsPerRep: { min: 2, max: 4 },
    setupSeconds: { min: 5, max: 10 },
    sideSwitchSeconds: { min: 5, max: 10 },
    perSide: false,
  },
};
const day = (): PlannerDay => ({
  key: "day-1",
  title: "Day",
  sourceTemplateId: "draft",
  warnings: [],
  estimate: { minSeconds: 300, maxSeconds: 600, version: "planning-v1" },
  steps: ["a", "b"].map((slotKey) => ({
    slotKey,
    phase: "main",
    sourceVariantId: "fixture",
    revisionId: card.revisionId,
    sets: 2,
    target: 8,
    restSeconds: 60,
    transitionSeconds: 15,
    pairKey: "pair",
    exercise: card,
  })),
});

describe("confirmed planner start boundary", () => {
  it("accepts only operation, saved revision and bounded day key", () => {
    const input = { operationId: randomUUID(), expectedProgramRevision: 1, dayKey: "day-1" };
    expect(plannerStartInput.safeParse(input).success).toBe(true);
    for (const extra of [
      { ownerId: randomUUID() },
      { steps: [] },
      { rewardKind: "main" },
      { weightKg: 50 },
      { expectedProgramRevision: 0 },
      { expectedProgramRevision: 1_000_001 },
      { dayKey: "" },
      { dayKey: "x".repeat(81) },
    ])
      expect(plannerStartInput.safeParse({ ...input, ...extra }).success).toBe(false);
  });

  it("rejects incomplete, unequal or nonadjacent pairs before any workout is inserted", () => {
    expect(() => assertPlannerDayExecution(day())).not.toThrow();
    const incomplete = day();
    incomplete.steps.pop();
    const unequal = day();
    unequal.steps[1].sets = 3;
    const nonadjacent = day();
    nonadjacent.steps.splice(1, 0, { ...nonadjacent.steps[0], pairKey: undefined });
    const triple = day();
    triple.steps.push({ ...triple.steps[0] });
    const warmup = day();
    warmup.steps[0].phase = "warmup";
    const unequalRest = day();
    unequalRest.steps[1].restSeconds = 30;
    const unequalTransition = day();
    unequalTransition.steps[1].transitionSeconds = 30;
    const excessiveReps = day();
    excessiveReps.steps[0].target = 101;
    const excessiveTransition = day();
    excessiveTransition.steps[0].transitionSeconds = 121;
    for (const candidate of [
      incomplete,
      unequal,
      nonadjacent,
      triple,
      warmup,
      unequalRest,
      unequalTransition,
      excessiveReps,
      excessiveTransition,
    ])
      expect(() => assertPlannerDayExecution(candidate)).toThrow();
  });
});
