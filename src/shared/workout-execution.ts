import type { Exercise } from "./contracts";

export function exerciseWorkSeconds(
  exercise: Pick<Exercise, "targetDurationSeconds" | "targetReps" | "perSide">,
): number {
  return (exercise.targetDurationSeconds ?? exercise.targetReps) * (exercise.perSide ? 2 : 1);
}

export interface ExecutionExercise {
  id: string;
  sets: number;
  skipped?: boolean;
  pairKey?: string;
}

export interface WorkoutExecution {
  canRecord: boolean;
  canAdvance: boolean;
  nextIndex: number | null;
  afterSkipIndex: number;
  pair?: {
    aIndex: number;
    bIndex: number;
    position: "A" | "Б";
    round: number;
    rounds: number;
  };
}

/** The same A–B ordering is used by server commands and the owner's offline journal. */
export function workoutExecution(
  exercises: readonly ExecutionExercise[],
  currentIndex: number,
  recordedExerciseIds: readonly string[],
): WorkoutExecution {
  const current = exercises[currentIndex];
  const counts = new Map<string, number>();
  for (const id of recordedExerciseIds) counts.set(id, (counts.get(id) ?? 0) + 1);
  const count = (index: number) => counts.get(exercises[index]?.id ?? "") ?? 0;
  const forward = (from: number): number | null => {
    for (let index = from; index < exercises.length; index++) {
      if (!exercises[index].skipped) return index;
    }
    return null;
  };
  const next = forward(currentIndex + 1);
  if (!current) {
    return { canRecord: false, canAdvance: false, nextIndex: null, afterSkipIndex: currentIndex };
  }
  const matching = current.pairKey
    ? exercises.flatMap((exercise, index) => (exercise.pairKey === current.pairKey ? [index] : []))
    : [];
  const [aIndex, bIndex] = matching;
  const a = exercises[aIndex];
  const b = exercises[bIndex];
  if (
    matching.length === 2 &&
    bIndex === aIndex + 1 &&
    a.sets === b.sets &&
    !a.skipped &&
    !b.skipped
  ) {
    const aCount = count(aIndex);
    const bCount = count(bIndex);
    const first = currentIndex === aIndex;
    const canRecord = first
      ? aCount === bCount && aCount < a.sets
      : aCount === bCount + 1 && bCount < b.sets;
    const canAdvance = first
      ? aCount === bCount + 1 && aCount <= a.sets
      : aCount === bCount && bCount > 0 && bCount <= b.sets;
    const partnerIndex = first ? bIndex : aIndex;
    return {
      canRecord,
      canAdvance,
      nextIndex: first ? bIndex : bCount < b.sets ? aIndex : forward(bIndex + 1),
      afterSkipIndex:
        count(partnerIndex) < exercises[partnerIndex].sets
          ? partnerIndex
          : (forward(bIndex + 1) ?? currentIndex),
      pair: {
        aIndex,
        bIndex,
        position: first ? "A" : "Б",
        round: Math.min(current.sets, count(currentIndex) + (canRecord ? 1 : 0)),
        rounds: current.sets,
      },
    };
  }
  return {
    canRecord: !current.skipped && count(currentIndex) < current.sets,
    canAdvance: Boolean(current.skipped || count(currentIndex) === current.sets),
    nextIndex: next,
    afterSkipIndex: next ?? currentIndex,
  };
}
