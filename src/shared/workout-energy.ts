import type {
  EnergyActivity,
  Workout,
  WorkoutEnergyEstimate,
  WorkoutEnergyInput,
} from "./contracts";
import type { BuilderTiming } from "./workout-builder";

// 2024 Adult Compendium, Conditioning Exercise. These are typical activity categories,
// not measurements of an individual's intensity. Source scope: ages 19–59.
export const ENERGY_ACTIVITIES: Readonly<
  Record<
    EnergyActivity,
    {
      label: string;
      met: number;
      code: string;
    }
  >
> = {
  strength: { label: "Обычная силовая тренировка", met: 3.5, code: "02054" },
  calisthenics: { label: "Калистеника умеренной интенсивности", met: 3.8, code: "02022" },
  yoga: { label: "Обычная йога", met: 2.3, code: "02175" },
  stretch: { label: "Спокойная растяжка", met: 2.3, code: "02101" },
  mobility: { label: "Лёгкий комплекс движений на полу", met: 3.5, code: "02030" },
};
export const ENERGY_SOURCE_URL = "https://pacompendium.com/conditioning-exercise/";
export const REFERENCE_BODY_WEIGHT_KG = 70;
const FALLBACK_TIMING: BuilderTiming = {
  secondsPerRep: { min: 2, max: 4 },
  setupSeconds: { min: 15, max: 45 },
  sideSwitchSeconds: { min: 5, max: 15 },
  perSide: false,
};
const midpoint = (range: { min: number; max: number }) => (range.min + range.max) / 2;

export function isEnergyActivity(value: unknown): value is EnergyActivity {
  return typeof value === "string" && Object.hasOwn(ENERGY_ACTIVITIES, value);
}

export function energyInputError(input: WorkoutEnergyInput): string | null {
  const weight = input.bodyWeightKg;
  if (
    weight !== undefined &&
    (!Number.isFinite(weight) ||
      weight < 25 ||
      weight > 400 ||
      Math.abs(weight * 10 - Math.round(weight * 10)) > 1e-7)
  )
    return "Укажи примерный вес от 25 до 400 кг.";
  if (input.workload !== undefined) {
    if (
      !input.workload.length ||
      input.workload.length > 50 ||
      new Set(input.workload.map((row) => row.exerciseId)).size !== input.workload.length
    )
      return "Проверь список уточнений упражнений.";
    for (const row of input.workload) {
      if (
        !Number.isInteger(row.sets) ||
        row.sets < 0 ||
        row.sets > 30 ||
        (row.repsPerSet !== undefined &&
          (!Number.isInteger(row.repsPerSet) || row.repsPerSet < 1 || row.repsPerSet > 1000)) ||
        (row.durationSecondsPerSet !== undefined &&
          (!Number.isInteger(row.durationSecondsPerSet) ||
            row.durationSecondsPerSet < 1 ||
            row.durationSecondsPerSet > 86400))
      )
        return "Проверь количество подходов и выполненную нагрузку.";
    }
  }
  return null;
}

export function estimateWorkoutEnergy(
  workout: Pick<
    Workout,
    "status" | "exercises" | "recordedSets" | "energyActivity" | "energyEstimate"
  >,
  input: WorkoutEnergyInput,
  now: string,
): WorkoutEnergyEstimate {
  const invalid = energyInputError(input);
  if (invalid) throw new Error(invalid);
  if (!["completed", "partial"].includes(workout.status) || !workout.recordedSets.length)
    throw new Error("Оценка доступна после занятия с выполненными подходами.");
  if (!isEnergyActivity(workout.energyActivity))
    throw new Error("Для этого занятия пока нет подходящего коэффициента расхода.");

  const corrections = new Map(
    workout.energyEstimate?.workloadCorrections.map((row) => [row.exerciseId, row]) ?? [],
  );
  for (const row of input.workload ?? []) {
    const exercise = workout.exercises.find((item) => item.id === row.exerciseId);
    if (!exercise) throw new Error("Уточнять можно только упражнения этого занятия.");
    if (
      (exercise.metric === "time" && row.repsPerSet !== undefined) ||
      (exercise.metric === "reps" && row.durationSecondsPerSet !== undefined)
    )
      throw new Error("Уточнение не соответствует виду упражнения.");
    corrections.set(row.exerciseId, { ...row });
  }
  const performed = workout.exercises.flatMap((exercise) => {
    const recorded = workout.recordedSets.filter((set) => set.exerciseId === exercise.id);
    const correction = corrections.get(exercise.id);
    const count = correction?.sets ?? recorded.length;
    if (!count) return [];
    const timing = exercise.timing ?? { ...FALLBACK_TIMING, perSide: exercise.perSide ?? false };
    const perSide = timing.perSide;
    const prescribedSeconds =
      (exercise.targetDurationSeconds ?? exercise.targetReps) * (perSide ? 2 : 1);
    const seconds =
      exercise.metric === "time"
        ? count *
          (correction?.durationSecondsPerSet ??
            (recorded.length
              ? recorded.reduce((sum, set) => sum + (set.durationSeconds ?? prescribedSeconds), 0) /
                recorded.length
              : prescribedSeconds))
        : count *
          (correction?.repsPerSet ??
            (recorded.length
              ? recorded.reduce((sum, set) => sum + (set.reps ?? exercise.targetReps), 0) /
                recorded.length
              : exercise.targetReps)) *
          midpoint(timing.secondsPerRep) *
          (perSide ? 2 : 1);
    // A correction replaces the whole exercise estimate; do not add old drop facts again.
    const dropSeconds =
      !correction && exercise.metric === "reps"
        ? recorded.reduce(
            (sum, set) =>
              sum +
              (set.drop
                ? set.drop.reps * midpoint(timing.secondsPerRep) * (perSide ? 2 : 1) + 12.5
                : 0),
            0,
          )
        : 0;
    // Timed records already cover both sides; modeled repetitions need the side multiplier.
    return [
      {
        exercise,
        count,
        seconds:
          seconds +
          dropSeconds +
          midpoint(timing.setupSeconds) +
          (perSide ? count * midpoint(timing.sideSwitchSeconds) : 0),
      },
    ];
  });
  let seconds = 0;
  let groups = 0;
  for (let index = 0; index < performed.length; index++) {
    const row = performed[index];
    const previous = performed[index - 1];
    const next = performed[index + 1];
    const pairedPrevious =
      row.exercise.pairKey && previous?.exercise.pairKey === row.exercise.pairKey;
    const pairedNext = row.exercise.pairKey && next?.exercise.pairKey === row.exercise.pairKey;
    seconds += row.seconds;
    if (!pairedPrevious) {
      groups++;
      seconds +=
        Math.max(0, Math.max(row.count, pairedNext ? next.count : 0) - 1) *
        row.exercise.restSeconds;
    }
    if (pairedNext)
      seconds += Math.min(row.count, next.count) * (row.exercise.transitionSeconds ?? 30);
  }
  const durationSeconds = Math.round(seconds + Math.max(0, groups - 1) * 22.5);
  const activity = ENERGY_ACTIVITIES[workout.energyActivity];
  const bodyWeightKg =
    input.bodyWeightKg ?? workout.energyEstimate?.bodyWeightKg ?? REFERENCE_BODY_WEIGHT_KG;
  return {
    methodVersion: "met-performed-v1",
    basis: "additional_to_rest",
    sourceVersion: "2024-adult",
    sourceCode: activity.code,
    sourceUrl: ENERGY_SOURCE_URL,
    sourcePopulation: "19-59",
    activity: workout.energyActivity,
    met: activity.met,
    bodyWeightKg,
    weightSource:
      input.bodyWeightKg !== undefined
        ? "user_reported"
        : (workout.energyEstimate?.weightSource ?? "reference"),
    durationSeconds,
    durationSource: "modeled_from_performed_sets",
    workloadCorrections: [...corrections.values()],
    estimatedKcal: Math.round(
      (Math.max(0, activity.met - 1) * bodyWeightKg * durationSeconds) / 3600,
    ),
    estimatedAt: now,
  };
}

export function formatWorkoutEnergy(estimate: WorkoutEnergyEstimate): string {
  const rounded = Math.round(estimate.estimatedKcal / 10) * 10;
  return estimate.estimatedKcal === 0
    ? "≈ 0 ккал"
    : rounded === 0
      ? "меньше 10 ккал"
      : `≈ ${rounded.toLocaleString("ru-RU")} ккал`;
}
