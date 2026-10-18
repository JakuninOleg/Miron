import type { Progress, Workout, WorkoutCommand } from "@/shared/contracts";
import { workoutExecution } from "@/shared/workout-execution";
import { dropSetResultError } from "@/shared/training-methods";
import { estimateWorkoutEnergy, isEnergyActivity } from "@/shared/workout-energy";
import { canRateWorkout, WORKOUT_LOAD_FEEDBACK } from "@/shared/workout-feedback";
import { correctWorkoutSet } from "@/shared/workout-edits";
import { lighterWorkout } from "@/shared/workout-adjustment";
import {
  dailyXpDelta,
  eligibleXp,
  isTerminalWorkout,
  rewardDay,
  XP_POLICY_VERSION,
  XP_TIMEZONE,
} from "@/shared/xp-policy";

// Local effects are provisional for accounts; the server owns acceptance and XP.
export function reduceWorkout(
  workout: Workout,
  command: WorkoutCommand,
  now = new Date().toISOString(),
  knownBodyWeightKg?: number,
): Workout {
  if (command.type === "replace_exercise")
    throw new Error("Для замены упражнения подключись к интернету и подтверди сравнение.");
  if (command.type === "lighten_remaining") return lighterWorkout(workout);
  if (
    command.type === "correct_set" ||
    command.type === "correct_timed_set" ||
    command.type === "undo_set"
  )
    return correctWorkoutSet(workout, command, now);
  if (command.type === "rate_load") {
    if (!Object.hasOwn(WORKOUT_LOAD_FEEDBACK, command.feedback) || !canRateWorkout(workout))
      throw new Error("Оценить нагрузку можно после занятия с выполненной основной работой.");
    return { ...workout, revision: workout.revision + 1, loadFeedback: command.feedback };
  }
  if (command.type === "estimate_energy") {
    return {
      ...workout,
      revision: workout.revision + 1,
      energyEstimate: estimateWorkoutEnergy(workout, command, now),
    };
  }
  if (isTerminalWorkout(workout.status)) throw new Error("Тренировка уже завершена.");
  const current = workout.exercises[workout.currentIndex];
  if (!current) throw new Error("Упражнение не найдено.");
  const execution = workoutExecution(
    workout.exercises,
    workout.currentIndex,
    workout.recordedSets.map((set) => set.exerciseId),
  );
  let next: Workout = {
    ...workout,
    status: "active",
    startedAt: workout.startedAt ?? now,
    revision: workout.revision + 1,
  };
  if (command.type === "record_set" || command.type === "record_timed_set") {
    if (current.skipped) throw new Error("Упражнение пропущено.");
    if (command.type === "record_timed_set") {
      if (current.metric !== "time") throw new Error("Упражнение не измеряется временем.");
      if (
        !Number.isInteger(command.durationSeconds) ||
        command.durationSeconds < 1 ||
        command.durationSeconds > 86400
      )
        throw new Error("Проверь длительность.");
    } else if (
      !Number.isInteger(command.reps) ||
      command.reps < 1 ||
      command.reps > 1000 ||
      !Number.isFinite(command.weightKg) ||
      command.weightKg < 0 ||
      command.weightKg > 1000 ||
      !/^\d+(?:\.\d{1,3})?$/.test(command.weightKg.toString())
    )
      throw new Error("Проверь повторы и вес.");
    if (command.exerciseId !== current.id) throw new Error("Записывай подход текущего упражнения.");
    if (command.type === "record_set" && current.metric === "time" && workout.sourcePlannerRevision)
      throw new Error("Запиши фактически выполненные секунды.");
    if (workout.recordedSets.some((s) => s.id === command.setId))
      throw new Error("Этот подход уже записан.");
    if (workout.recordedSets.filter((s) => s.exerciseId === current.id).length >= current.sets)
      throw new Error("Все подходы этого упражнения записаны.");
    if (!execution.canRecord) throw new Error("Продолжи пару со следующего упражнения.");
    if (command.type === "record_set") {
      const invalidDrop = dropSetResultError(
        current,
        workout.recordedSets.filter((set) => set.exerciseId === current.id).length,
        command.weightKg,
        command.drop,
      );
      if (invalidDrop) throw new Error(invalidDrop);
    }
    next = {
      ...next,
      recordedSets: [
        ...workout.recordedSets,
        {
          id: command.setId,
          setIndex: workout.recordedSets.filter((set) => set.exerciseId === current.id).length,
          exerciseId: command.exerciseId,
          reps: command.type === "record_set" ? command.reps : null,
          ...(command.type === "record_timed_set"
            ? { durationSeconds: command.durationSeconds }
            : {}),
          weightKg: command.type === "record_set" ? command.weightKg : 0,
          ...(command.type === "record_set" && command.drop ? { drop: { ...command.drop } } : {}),
          completedAt: now,
        },
      ],
    };
  } else if (command.type === "skip_exercise") {
    if (command.exerciseId !== current.id) throw new Error("Пропускай текущее упражнение.");
    if (current.skipped) throw new Error("Упражнение уже пропущено.");
    if (workout.recordedSets.filter((s) => s.exerciseId === current.id).length === current.sets)
      throw new Error("Все подходы уже выполнены.");
    next.exercises = workout.exercises.map((exercise) =>
      exercise.id === current.id ? { ...exercise, skipped: true } : exercise,
    );
    next.currentIndex = execution.afterSkipIndex;
  } else if (command.type === "next_exercise") {
    if (!execution.canAdvance) throw new Error("Запиши подходы текущего упражнения.");
    if (execution.nextIndex === null)
      throw new Error("Это последнее упражнение. Заверши тренировку.");
    next.currentIndex = execution.nextIndex;
  } else {
    if (
      command.type === "finish" &&
      workout.exercises.some(
        (exercise) =>
          !exercise.skipped &&
          workout.recordedSets.filter((s) => s.exerciseId === exercise.id).length !== exercise.sets,
      )
    )
      throw new Error("Запиши подходы перед завершением.");
    const full =
      workout.exercises.length > 0 &&
      workout.exercises.every(
        (exercise) =>
          !exercise.skipped &&
          workout.recordedSets.filter((s) => s.exerciseId === exercise.id).length === exercise.sets,
      );
    next = {
      ...next,
      status: full ? "completed" : workout.recordedSets.length ? "partial" : "aborted",
      completedAt: now,
    };
  }
  if (
    (next.status === "completed" || next.status === "partial") &&
    isEnergyActivity(next.energyActivity)
  )
    next = {
      ...next,
      energyEstimate: estimateWorkoutEnergy(
        next,
        knownBodyWeightKg === undefined ? {} : { bodyWeightKg: knownBodyWeightKg },
        now,
      ),
    };
  return next;
}
export function demoProgress(previous: Progress, workout: Workout): Progress {
  if (
    previous.history.find((item) => item.id === workout.id)?.energyEstimate ===
      workout.energyEstimate &&
    previous.history.some((item) => item.id === workout.id)
  )
    return previous;
  if (workout.energyEstimate && previous.history.some((item) => item.id === workout.id))
    return {
      ...previous,
      history: previous.history.map((item) =>
        item.id === workout.id ? { ...item, energyEstimate: workout.energyEstimate } : item,
      ),
    };
  if (!isTerminalWorkout(workout.status) || previous.history.some((item) => item.id === workout.id))
    return previous;
  const day = workout.rewardDay ?? rewardDay(new Date(workout.startedAt ?? workout.completedAt!));
  const prior = previous.history
    .filter((item) => (item.rewardDay ?? rewardDay(new Date(item.completedAt))) === day)
    .reduce((sum, item) => sum + item.xp, 0);
  const kind = workout.rewardKind ?? "main";
  const eligible = eligibleXp(kind, workout.status);
  const amount = dailyXpDelta(eligible, prior);
  return {
    xp: previous.xp + amount,
    completedWorkouts: previous.completedWorkouts + (workout.status === "completed" ? 1 : 0),
    history: [
      {
        id: workout.id,
        title: workout.title,
        completedAt: workout.completedAt!,
        sets: workout.recordedSets.length,
        xp: amount,
        status: workout.status,
        rewardDay: day,
        rewardKind: kind,
        ...(workout.energyEstimate ? { energyEstimate: workout.energyEstimate } : {}),
      },
      ...previous.history,
    ],
  };
}

/** Demo only; account XP remains absent until the server ACK confirms it. */
export function demoReward(progress: Progress, workout: Workout): Workout {
  const item = progress.history.find((entry) => entry.id === workout.id);
  if (!item || !item.rewardDay) return workout;
  const kind = workout.rewardKind ?? "main";
  return {
    ...workout,
    reward: {
      policyVersion: XP_POLICY_VERSION,
      day: item.rewardDay,
      timezone: XP_TIMEZONE,
      kind,
      eligibleXp: eligibleXp(kind, workout.status),
      awardedXp: item.xp,
      dayTotalXp: Math.min(
        50,
        progress.history
          .filter((entry) => entry.rewardDay === item.rewardDay)
          .reduce((sum, entry) => sum + entry.xp, 0),
      ),
    },
  };
}
