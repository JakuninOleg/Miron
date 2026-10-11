import { describe, expect, it } from "vitest";
import { buildDemoWorkout, DEFAULT_PROFILE } from "./demo";
import type { EnergyActivity, Workout } from "./contracts";
import { energyInputError, estimateWorkoutEnergy, formatWorkoutEnergy } from "./workout-energy";

const now = "2026-10-12T10:00:00Z";
function completed(activity: EnergyActivity = "strength"): Workout {
  const workout = buildDemoWorkout(DEFAULT_PROFILE);
  const exercise = {
    ...workout.exercises[0],
    sets: 3,
    metric: "reps" as const,
    targetReps: 10,
    restSeconds: 60,
    timing: {
      secondsPerRep: { min: 3, max: 3 },
      setupSeconds: { min: 30, max: 30 },
      sideSwitchSeconds: { min: 10, max: 10 },
      perSide: false,
    },
  };
  return {
    ...workout,
    energyActivity: activity,
    status: "completed",
    exercises: [exercise],
    completedAt: now,
    recordedSets: Array.from({ length: 3 }, () => ({
      id: crypto.randomUUID(),
      exerciseId: exercise.id,
      reps: 10,
      weightKg: 0,
      completedAt: now,
    })),
  };
}
describe("rough workout energy from performed work", () => {
  it("automatically models normal pace/rest and discloses reference weight", () => {
    const result = estimateWorkoutEnergy(completed(), {}, now);
    expect(result).toMatchObject({
      durationSeconds: 240,
      bodyWeightKg: 70,
      weightSource: "reference",
      estimatedKcal: 12,
      basis: "additional_to_rest",
      durationSource: "modeled_from_performed_sets",
      methodVersion: "met-performed-v1",
      sourcePopulation: "19-59",
    });
    expect(formatWorkoutEnergy(result)).toBe("≈ 10 ккал");
  });
  it.each([
    ["strength", 3.5, "02054"],
    ["calisthenics", 3.8, "02022"],
    ["yoga", 2.3, "02175"],
    ["stretch", 2.3, "02101"],
    ["mobility", 3.5, "02030"],
  ] as const)("pins the activity coefficient for %s", (activity, met, code) => {
    const result = estimateWorkoutEnergy(completed(activity), { bodyWeightKg: 80 }, now);
    expect(result).toMatchObject({ met, sourceCode: code, weightSource: "user_reported" });
    expect(result.estimatedKcal).toBe(Math.round(((met - 1) * 80 * 240) / 3600));
  });
  it("ignores wall-clock delays, unperformed prescriptions and skipped work", () => {
    const full = completed();
    const partial = {
      ...full,
      status: "partial" as const,
      startedAt: "2026-01-01T00:00:00Z",
      recordedSets: full.recordedSets.slice(0, 1),
      exercises: [
        { ...full.exercises[0], sets: 30, skipped: true },
        { ...full.exercises[0], id: "unused", sets: 30 },
      ],
    };
    expect(estimateWorkoutEnergy(partial, {}, now).durationSeconds).toBe(60);
    expect(estimateWorkoutEnergy(partial, {}, now).estimatedKcal).toBeLessThan(
      estimateWorkoutEnergy(full, {}, now).estimatedKcal,
    );
  });
  it("counts pair rest once and handles unequal partial rounds", () => {
    const workout = completed();
    const first = { ...workout.exercises[0], pairKey: "pair", transitionSeconds: 15 };
    const second = { ...first, id: "other" };
    workout.exercises = [first, second];
    workout.recordedSets.push(
      ...workout.recordedSets.map((set) => ({
        ...set,
        id: crypto.randomUUID(),
        exerciseId: second.id,
      })),
    );
    expect(estimateWorkoutEnergy(workout, {}, now).durationSeconds).toBe(405);
    workout.recordedSets = workout.recordedSets.filter((set, index) => index < 4);
    expect(estimateWorkoutEnergy(workout, {}, now).durationSeconds).toBe(315);
  });
  it("does not double timed facts for per-side exercises", () => {
    const workout = completed("yoga");
    workout.exercises[0] = {
      ...workout.exercises[0],
      metric: "time",
      perSide: true,
      timing: { ...workout.exercises[0].timing!, perSide: true },
      restSeconds: 0,
    };
    workout.recordedSets = workout.recordedSets
      .slice(0, 1)
      .map((set) => ({ ...set, reps: null, durationSeconds: 80 }));
    expect(estimateWorkoutEnergy(workout, {}, now).durationSeconds).toBe(120);
  });
  it("marks legacy timed facts as prescribed duration and covers both sides", () => {
    const workout = completed("yoga");
    workout.exercises[0] = {
      ...workout.exercises[0],
      metric: "time",
      targetDurationSeconds: 20,
      timing: { ...workout.exercises[0].timing!, perSide: true },
      restSeconds: 0,
    };
    workout.recordedSets = workout.recordedSets.slice(0, 1);
    expect(estimateWorkoutEnergy(workout, {}, now).durationSeconds).toBe(80);
  });
  it("accepts more/less reported work without rewriting workout facts and retains corrections", () => {
    const workout = completed();
    const copy = structuredClone(workout);
    const more = estimateWorkoutEnergy(
      workout,
      { workload: [{ exerciseId: workout.exercises[0].id, sets: 4, repsPerSet: 12 }] },
      now,
    );
    expect(more.estimatedKcal).toBeGreaterThan(
      estimateWorkoutEnergy(workout, {}, now).estimatedKcal,
    );
    const weighted = estimateWorkoutEnergy(
      { ...workout, energyEstimate: more },
      { bodyWeightKg: 90 },
      now,
    );
    expect(weighted.workloadCorrections).toEqual(more.workloadCorrections);
    const less = estimateWorkoutEnergy(
      { ...workout, energyEstimate: weighted },
      {
        workload: [{ exerciseId: workout.exercises[0].id, sets: 1, repsPerSet: 5 }],
      },
      now,
    );
    expect(less.bodyWeightKg).toBe(90);
    expect(less.estimatedKcal).toBeLessThan(more.estimatedKcal);
    expect(workout).toEqual(copy);
  });
  it("rejects unknown work/metrics, non-terminal sessions and unsupported activity", () => {
    const workout = completed();
    expect(() =>
      estimateWorkoutEnergy(workout, { workload: [{ exerciseId: "foreign", sets: 3 }] }, now),
    ).toThrow("этого занятия");
    expect(() =>
      estimateWorkoutEnergy(
        workout,
        { workload: [{ exerciseId: workout.exercises[0].id, sets: 3, durationSecondsPerSet: 50 }] },
        now,
      ),
    ).toThrow("виду упражнения");
    for (const status of ["active", "ready", "aborted"] as const)
      expect(() => estimateWorkoutEnergy({ ...workout, status }, {}, now)).toThrow("после занятия");
    expect(() => estimateWorkoutEnergy({ ...workout, energyActivity: undefined }, {}, now)).toThrow(
      "коэффициента",
    );
    expect(() => estimateWorkoutEnergy({ ...workout, recordedSets: [] }, {}, now)).toThrow(
      "подходами",
    );
  });
  it("bounds reported inputs and never accepts duplicate overrides", () => {
    for (const weight of [NaN, Infinity, -1, 0, 401, 70.123])
      expect(energyInputError({ bodyWeightKg: weight })).not.toBeNull();
    expect(energyInputError({ bodyWeightKg: 70.1 })).toBeNull();
    const row = { exerciseId: "same", sets: 3 };
    for (const workload of [
      [],
      [row, row],
      [{ ...row, sets: 31 }],
      [{ ...row, repsPerSet: 0 }],
      [{ ...row, durationSecondsPerSet: NaN }],
    ])
      expect(energyInputError({ workload })).not.toBeNull();
  });
});
