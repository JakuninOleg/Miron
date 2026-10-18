import type { SetCorrectionCommand, Workout } from "./contracts";
import { dropSetResultError } from "./training-methods";
import { estimateWorkoutEnergy } from "./workout-energy";

export function lastRecordedSet(workout: Workout) {
  let index = workout.exercises.findLastIndex((exercise) =>
    workout.recordedSets.some((set) => set.exerciseId === exercise.id),
  );
  const pairKey = workout.exercises[index]?.pairKey;
  if (pairKey) {
    const pair = workout.exercises.flatMap((exercise, ordinal) =>
      exercise.pairKey === pairKey ? [ordinal] : [],
    );
    if (pair.length === 2) {
      const counts = pair.map(
        (ordinal) =>
          workout.recordedSets.filter((set) => set.exerciseId === workout.exercises[ordinal].id)
            .length,
      );
      index = counts[0] > counts[1] ? pair[0] : pair[1];
    }
  }
  const candidates = workout.recordedSets.filter(
    (set) => set.exerciseId === workout.exercises[index]?.id,
  );
  if (candidates.every((set) => Number.isInteger(set.setIndex)))
    return candidates.reduce<(typeof candidates)[number] | undefined>(
      (last, set) => (!last || set.setIndex! > last.setIndex! ? set : last),
      undefined,
    );
  const latestTime = Math.max(...candidates.map((set) => Date.parse(set.completedAt)));
  const latest = candidates.filter((set) => Date.parse(set.completedAt) === latestTime);
  return latest.length === 1 ? latest[0] : undefined;
}

/** Correct recorded facts, never the accepted plan, terminal outcome or reward. */
export function correctWorkoutSet(
  workout: Workout,
  command: SetCorrectionCommand,
  now = new Date().toISOString(),
): Workout {
  const saved = workout.recordedSets.find((set) => set.id === command.setId);
  const exerciseIndex = workout.exercises.findIndex(
    (exercise) => exercise.id === saved?.exerciseId,
  );
  const exercise = workout.exercises[exerciseIndex];
  if (!saved || !exercise || !["active", "completed", "partial"].includes(workout.status))
    throw new Error("Запись подхода недоступна для исправления.");
  let next: Workout;
  if (command.type === "undo_set") {
    if (
      workout.status !== "active" ||
      lastRecordedSet(workout)?.id !== saved.id ||
      exercise.skipped
    )
      throw new Error("Отменить можно только последнюю запись незавершённой тренировки.");
    next = {
      ...workout,
      currentIndex: exerciseIndex,
      recordedSets: workout.recordedSets.filter((set) => set.id !== saved.id),
    };
  } else {
    let corrected = saved;
    if (command.type === "correct_timed_set") {
      if (
        exercise.metric !== "time" ||
        !Number.isInteger(command.durationSeconds) ||
        command.durationSeconds < 1 ||
        command.durationSeconds > 86400
      )
        throw new Error("Проверь фактически выполненное время.");
      corrected = {
        ...saved,
        reps: null,
        weightKg: 0,
        durationSeconds: command.durationSeconds,
        drop: undefined,
      };
    } else {
      if (
        exercise.metric !== "reps" ||
        !Number.isInteger(command.reps) ||
        command.reps < 1 ||
        command.reps > 1000 ||
        !Number.isFinite(command.weightKg) ||
        command.weightKg < 0 ||
        command.weightKg > 1000 ||
        !/^\d+(?:\.\d{1,3})?$/.test(command.weightKg.toString())
      )
        throw new Error("Проверь фактические повторы и вес.");
      const index = workout.recordedSets
        .filter((set) => set.exerciseId === exercise.id)
        .findIndex((set) => set.id === saved.id);
      const dropError = dropSetResultError(exercise, index, command.weightKg, command.drop);
      if (dropError) throw new Error(dropError);
      corrected = {
        ...saved,
        reps: command.reps,
        weightKg: command.weightKg,
        durationSeconds: null,
        drop: command.drop,
      };
    }
    next = {
      ...workout,
      recordedSets: workout.recordedSets.map((set) => (set.id === saved.id ? corrected : set)),
    };
  }
  next = { ...next, revision: workout.revision + 1 };
  if (workout.energyEstimate) {
    const estimate = workout.energyEstimate;
    next.energyEstimate = estimateWorkoutEnergy(
      { ...next, energyEstimate: undefined },
      {
        ...(estimate.weightSource === "user_reported"
          ? { bodyWeightKg: estimate.bodyWeightKg }
          : {}),
        ...(estimate.workloadCorrections.some((item) => item.exerciseId !== exercise.id)
          ? {
              workload: estimate.workloadCorrections.filter(
                (item) => item.exerciseId !== exercise.id,
              ),
            }
          : {}),
      },
      now,
    );
  }
  return next;
}
