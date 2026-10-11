import { describe, expect, it } from "vitest";
import { exerciseWorkSeconds, workoutExecution } from "./workout-execution";
import { reduceWorkout } from "../client/workout-reducer";
import type { Exercise, Workout } from "./contracts";

const exercise = (id: string, pairKey?: string): Exercise => ({
  id,
  name: id,
  description: "",
  equipment: [],
  sets: 2,
  targetReps: 8,
  restSeconds: 60,
  instructions: [],
  metric: "reps",
  status: "draft",
  pairKey,
});
const initial = (): Workout => ({
  id: "workout",
  title: "Workout",
  subtitle: "",
  estimatedMinutes: 15,
  exercises: [exercise("A", "pair"), exercise("B", "pair"), exercise("C")],
  currentIndex: 0,
  status: "active",
  revision: 1,
  recordedSets: [],
  startedAt: null,
  completedAt: null,
  sourcePlannerRevision: 1,
});
const record = (workout: Workout): Workout =>
  reduceWorkout(workout, {
    type: "record_set",
    exerciseId: workout.exercises[workout.currentIndex].id,
    setId: `set-${workout.recordedSets.length}`,
    reps: 7,
    weightKg: 0,
  });
const next = (workout: Workout): Workout => reduceWorkout(workout, { type: "next_exercise" });

describe("paired workout command ordering", () => {
  it("covers both timed sides without doubling the recorded factual duration", () => {
    const timed: Exercise = {
      ...exercise("timed"),
      metric: "time",
      perSide: true,
      targetDurationSeconds: 30,
    };
    expect(exerciseWorkSeconds(timed)).toBe(60);
    expect(exerciseWorkSeconds({ ...timed, perSide: false })).toBe(30);
    const workout = { ...initial(), currentIndex: 0, exercises: [timed] };
    const recorded = reduceWorkout(workout, {
      type: "record_timed_set",
      exerciseId: timed.id,
      setId: "fact",
      durationSeconds: 43,
    });
    expect(recorded.recordedSets[0].durationSeconds).toBe(43);
    expect(recorded.recordedSets[0].reps).toBeNull();
  });
  it("performs A1–B1–A2–B2 before the next straight exercise", () => {
    let workout = initial();
    const order: string[] = [];
    for (let index = 0; index < 4; index++) {
      expect(() => next(workout)).toThrow("Запиши подходы");
      order.push(workout.exercises[workout.currentIndex].id);
      workout = record(workout);
      expect(() => record(workout)).toThrow();
      workout = next(workout);
    }
    expect(order).toEqual(["A", "B", "A", "B"]);
    expect(workout.currentIndex).toBe(2);
    workout = record(workout);
    expect(() => next(workout)).toThrow("Запиши подходы");
    workout = record(workout);
    expect(() => record(workout)).toThrow("Все подходы");
    expect(() => next(workout)).toThrow("Это последнее");
    expect(reduceWorkout(workout, { type: "finish" }).status).toBe("completed");
  });

  it("preserves a saved pair member when its partner is skipped and completes the remaining sets", () => {
    let workout = next(record(initial()));
    workout = reduceWorkout(workout, { type: "skip_exercise", exerciseId: "B" });
    expect(workout.currentIndex).toBe(0);
    expect(workout.exercises[1].skipped).toBe(true);
    expect(workout.recordedSets).toHaveLength(1);
    workout = record(workout);
    workout = next(workout);
    expect(workout.currentIndex).toBe(2);
    workout = record(record(workout));
    expect(reduceWorkout(workout, { type: "finish" }).status).toBe("partial");
  });

  it("skips A without inventing results and leaves B as straight sets", () => {
    let workout = reduceWorkout(initial(), { type: "skip_exercise", exerciseId: "A" });
    expect(workout.currentIndex).toBe(1);
    expect(workout.recordedSets).toEqual([]);
    workout = record(record(workout));
    expect(next(workout).currentIndex).toBe(2);
  });

  it("keeps the final pair on its last member until all rounds have completed", () => {
    let workout = { ...initial(), exercises: initial().exercises.slice(0, 2) };
    workout = next(record(workout));
    workout = record(workout);
    expect(
      workoutExecution(
        workout.exercises,
        1,
        workout.recordedSets.map((set) => set.exerciseId),
      ).nextIndex,
    ).toBe(0);
    expect(() => reduceWorkout(workout, { type: "finish" })).toThrow();
    workout = next(record(next(workout)));
    workout = record(workout);
    expect(
      workoutExecution(
        workout.exercises,
        1,
        workout.recordedSets.map((set) => set.exerciseId),
      ).nextIndex,
    ).toBeNull();
    expect(reduceWorkout(workout, { type: "finish" }).status).toBe("completed");
  });

  it("stores actual seconds for a planned timed member and rejects reps posing as seconds", () => {
    const workout = initial();
    workout.exercises[0] = { ...workout.exercises[0], metric: "time", targetDurationSeconds: 20 };
    expect(() => record(workout)).toThrow("секунды");
    const recorded = reduceWorkout(workout, {
      type: "record_timed_set",
      exerciseId: "A",
      setId: "timed",
      durationSeconds: 17,
    });
    expect(recorded.recordedSets[0]).toMatchObject({
      reps: null,
      durationSeconds: 17,
      weightKg: 0,
    });
    expect(next(recorded).currentIndex).toBe(1);
  });
});
