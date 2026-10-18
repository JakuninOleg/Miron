import { describe, expect, it } from "vitest";
import { buildDemoWorkout, DEFAULT_PROFILE } from "./demo";
import type { Workout } from "./contracts";
import { correctWorkoutSet, lastRecordedSet } from "./workout-edits";
import { workoutExecution } from "./workout-execution";
import { estimateWorkoutEnergy } from "./workout-energy";

function fixture(): Workout {
  const workout = buildDemoWorkout(DEFAULT_PROFILE);
  workout.status = "active";
  workout.exercises = [{ ...workout.exercises[0], sets: 2, metric: "reps" }];
  workout.recordedSets = [
    {
      id: "one",
      exerciseId: workout.exercises[0].id,
      reps: 12,
      weightKg: 100,
      completedAt: "2026-10-18T08:00:00Z",
    },
  ];
  return workout;
}
describe("recorded workout corrections", () => {
  it("discards the corrected exercise's old manual energy override", () => {
    const before = fixture();
    before.status = "partial";
    before.energyActivity = "strength";
    before.exercises[0].phase = "main";
    before.energyEstimate = estimateWorkoutEnergy(
      before,
      {
        workload: [{ exerciseId: before.exercises[0].id, sets: 4, repsPerSet: 50 }],
      },
      "2026-10-18T08:05:00Z",
    );
    const next = correctWorkoutSet(before, {
      type: "correct_set",
      setId: "one",
      reps: 6,
      weightKg: 30,
    });
    expect(next.energyEstimate?.workloadCorrections).toEqual([]);
    expect(next.energyEstimate!.estimatedKcal).toBeLessThan(before.energyEstimate.estimatedKcal);
  });
  it("uses pinned set indices rather than DTO order for a straight exercise", () => {
    const workout = fixture();
    workout.recordedSets = [
      { ...workout.recordedSets[0], id: "two", setIndex: 1 },
      { ...workout.recordedSets[0], setIndex: 0 },
    ];
    expect(lastRecordedSet(workout)?.id).toBe("two");
    expect(
      correctWorkoutSet(workout, { type: "undo_set", setId: "two" }).recordedSets,
    ).toHaveLength(1);
    workout.recordedSets = workout.recordedSets.map((set) => ({ ...set, setIndex: undefined }));
    expect(lastRecordedSet(workout)).toBeUndefined();
  });
  it("changes only the selected fact and revision, preserving closed outcome and reward", () => {
    const before = fixture();
    before.status = "partial";
    before.completedAt = "2026-10-18T08:05:00Z";
    const next = correctWorkoutSet(before, {
      type: "correct_set",
      setId: "one",
      reps: 10,
      weightKg: 30,
    });
    expect(next.recordedSets[0]).toMatchObject({
      id: "one",
      reps: 10,
      weightKg: 30,
      completedAt: before.recordedSets[0].completedAt,
    });
    expect(next.revision).toBe(before.revision + 1);
    expect(next.status).toBe("partial");
    expect(next.completedAt).toBe(before.completedAt);
    expect(next.reward).toEqual(before.reward);
    expect(next.exercises).toEqual(before.exercises);
    expect(before.recordedSets[0].weightKg).toBe(100);
  });
  it("undoes only the logical last set while active and restores its exercise", () => {
    const workout = fixture();
    const next = correctWorkoutSet(workout, { type: "undo_set", setId: "one" });
    expect(next.recordedSets).toEqual([]);
    expect(next.currentIndex).toBe(0);
    expect(next.status).toBe("active");
    expect(() =>
      correctWorkoutSet({ ...workout, status: "completed" }, { type: "undo_set", setId: "one" }),
    ).toThrow();
  });
  it("handles A–B undo independently of tied timestamps or DTO ordering", () => {
    const workout = fixture();
    const a = { ...workout.exercises[0], pairKey: "pair" };
    const b = { ...a, id: "b" };
    workout.exercises = [a, b];
    workout.recordedSets = [
      { ...workout.recordedSets[0], id: "b-set", exerciseId: b.id },
      workout.recordedSets[0],
    ];
    expect(lastRecordedSet(workout)?.id).toBe("b-set");
    expect(() => correctWorkoutSet(workout, { type: "undo_set", setId: "one" })).toThrow();
    const next = correctWorkoutSet(workout, { type: "undo_set", setId: "b-set" });
    expect(next.currentIndex).toBe(1);
    expect(
      workoutExecution(
        next.exercises,
        next.currentIndex,
        next.recordedSets.map((set) => set.exerciseId),
      ).canRecord,
    ).toBe(true);
  });
  it.each([
    { reps: 0, weightKg: 30 },
    { reps: 1.5, weightKg: 30 },
    { reps: 10, weightKg: -1 },
    { reps: 10, weightKg: Infinity },
    { reps: 10, weightKg: 2.1234 },
  ])("rejects invalid facts %j", (values) => {
    expect(() =>
      correctWorkoutSet(fixture(), { type: "correct_set", setId: "one", ...values }),
    ).toThrow();
  });
  it("keeps timed facts separate and rejects cross-metric or missing records", () => {
    const workout = fixture();
    expect(() =>
      correctWorkoutSet(workout, { type: "correct_timed_set", setId: "one", durationSeconds: 30 }),
    ).toThrow();
    workout.exercises[0].metric = "time";
    const next = correctWorkoutSet(workout, {
      type: "correct_timed_set",
      setId: "one",
      durationSeconds: 45,
    });
    expect(next.recordedSets[0]).toMatchObject({ durationSeconds: 45, reps: null, weightKg: 0 });
    expect(() =>
      correctWorkoutSet(workout, { type: "correct_set", setId: "missing", reps: 10, weightKg: 10 }),
    ).toThrow();
  });
});
