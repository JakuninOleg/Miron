import type { Workout } from "./contracts";

export const WORKOUT_LOAD_FEEDBACK = {
  easy: "Было легко",
  just_right: "В самый раз",
  hard: "Тяжеловато",
  too_hard: "Слишком тяжело",
} as const;
export type WorkoutLoadFeedback = keyof typeof WORKOUT_LOAD_FEEDBACK;

export function canRateWorkout(workout: Workout): boolean {
  return (
    (workout.status === "completed" || workout.status === "partial") &&
    workout.recordedSets.some((set) =>
      workout.exercises.some(
        (exercise) =>
          exercise.id === set.exerciseId &&
          (exercise.phase === undefined || exercise.phase === "main") &&
          ((set.reps ?? 0) > 0 || (set.durationSeconds ?? 0) > 0),
      ),
    )
  );
}
