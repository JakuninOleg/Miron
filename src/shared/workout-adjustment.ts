import type { Workout } from "./contracts";

/** Only unstarted main groups are reduced; performed work and paired round counts stay intact. */
export function lighterWorkout(workout: Workout): Workout {
  if (workout.status !== "active") throw new Error("Изменить можно только текущее занятие.");
  const started = new Set(workout.recordedSets.map((set) => set.exerciseId));
  const startedPairs = new Set(
    workout.exercises
      .filter((exercise) => started.has(exercise.id) || exercise.skipped)
      .map((exercise) => exercise.pairKey)
      .filter(Boolean),
  );
  let changed = false;
  const exercises = workout.exercises.map((exercise, index) => {
    if (
      index < workout.currentIndex ||
      exercise.skipped ||
      started.has(exercise.id) ||
      (exercise.phase && exercise.phase !== "main") ||
      exercise.sets <= 1 ||
      exercise.dropSet ||
      (exercise.pairKey && startedPairs.has(exercise.pairKey))
    )
      return exercise;
    changed = true;
    return { ...exercise, sets: exercise.sets - 1 };
  });
  if (!changed)
    throw new Error(
      "Нет ещё не начатых упражнений, где можно убрать подход. Можно закончить занятие раньше и сохранить сделанное.",
    );
  return { ...workout, exercises, revision: workout.revision + 1 };
}
