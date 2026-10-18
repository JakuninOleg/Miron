import type { BuilderExercise } from "./workout-builder";

/** One optional reduction after the last working set, never an extra full set. */
export interface DropSetPlan {
  kind: "last_set_drop";
  targetReps: number;
}
export interface DropSetResult {
  reps: number;
  weightKg: number;
}

// An explicit editorial pilot, not a claim that every other exercise is unsafe.
const DROP_VARIANTS = new Set([
  "strength.knee_flexion.seated_machine",
  "strength.knee_flexion.lying_machine",
  "strength.lateral_raise.dumbbell",
  "strength.lateral_raise.single_arm_cable",
  "strength.biceps_curl.dumbbell",
  "strength.biceps_curl.hammer_dumbbell",
  "strength.triceps_extension.cable_rope",
  "strength.calf_raise.seated_machine",
]);

export function supportsDropSet(exercise: BuilderExercise): boolean {
  return (
    DROP_VARIANTS.has(exercise.variantId) &&
    exercise.metric === "reps" &&
    exercise.focusMode === "loading" &&
    ["external_load", "machine_load"].includes(exercise.resistanceMode)
  );
}

export function dropSetPlanError(step: {
  dropSet?: DropSetPlan;
  pairKey?: string;
  phase?: string;
  exercise: BuilderExercise;
}): string | null {
  if (!step.dropSet) return null;
  if (
    step.dropSet.kind !== "last_set_drop" ||
    !Number.isInteger(step.dropSet.targetReps) ||
    step.dropSet.targetReps < 1 ||
    step.dropSet.targetReps > 30
  )
    return "Проверь параметры снижения веса.";
  if (step.pairKey || (step.phase !== undefined && step.phase !== "main"))
    return "Дропсет добавляется к отдельному упражнению основной части, вне суперсета.";
  if (!supportsDropSet(step.exercise))
    return "Для этого упражнения дропсет пока не поддерживается.";
  return null;
}

/** Shared by server validation and the owner's offline reducer. No prescribed kilograms. */
export function dropSetResultError(
  exercise: { sets: number; metric: string; dropSet?: DropSetPlan; pairKey?: string },
  recordedCount: number,
  weightKg: number,
  drop: DropSetResult | undefined,
): string | null {
  if (drop === undefined) return null; // The optional reduction can always be omitted.
  if (!exercise.dropSet || exercise.metric !== "reps" || exercise.pairKey)
    return "Снижение веса не предусмотрено в этом упражнении.";
  if (recordedCount !== exercise.sets - 1)
    return "Снижение веса записывается вместе с последним подходом.";
  if (
    !Number.isInteger(drop.reps) ||
    drop.reps < 1 ||
    drop.reps > 100 ||
    !Number.isFinite(drop.weightKg) ||
    drop.weightKg <= 0 ||
    drop.weightKg >= weightKg ||
    !/^\d+(?:\.\d{1,3})?$/.test(drop.weightKg.toString())
  )
    return "Укажи 1–100 повторов и положительный вес меньше исходного.";
  return null;
}
