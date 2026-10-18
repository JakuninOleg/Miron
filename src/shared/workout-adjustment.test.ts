import { describe, expect, it } from "vitest";
import { buildDemoWorkout, DEFAULT_PROFILE } from "./demo";
import { lighterWorkout } from "./workout-adjustment";
describe("lighter remaining workout", () => {
  it("preserves facts, warmup, started pairs and reward while reducing future main groups", () => {
    const workout = buildDemoWorkout(DEFAULT_PROFILE);
    workout.status = "active";
    const exercise = { ...workout.exercises[0], sets: 3, phase: "main" as const };
    workout.exercises = [
      { ...exercise, id: "warm", phase: "warmup" },
      { ...exercise, id: "a", pairKey: "started" },
      { ...exercise, id: "b", pairKey: "started" },
      { ...exercise, id: "c" },
      { ...exercise, id: "d", pairKey: "future" },
      { ...exercise, id: "e", pairKey: "future" },
      { ...exercise, id: "cool", phase: "cooldown" },
    ];
    workout.currentIndex = 2;
    workout.recordedSets = [
      { id: "fact", exerciseId: "a", reps: 8, weightKg: 10, completedAt: "2026-10-18T10:00Z" },
    ];
    const next = lighterWorkout(workout);
    expect(next.exercises.map((item) => item.sets)).toEqual([3, 3, 3, 2, 2, 2, 3]);
    expect(next.recordedSets).toEqual(workout.recordedSets);
    expect(workout.exercises[3].sets).toBe(3);
    expect(next.rewardKind).toBe(workout.rewardKind);
    expect(next.revision).toBe(workout.revision + 1);
    expect(() => lighterWorkout({ ...workout, status: "completed" })).toThrow();
    expect(() =>
      lighterWorkout({
        ...workout,
        exercises: workout.exercises.map((item) => ({ ...item, sets: 1 })),
      }),
    ).toThrow();
  });
});
