import type { BuilderExercise } from "./workout-builder";
export interface WorkoutAlternatives {
  revision: number;
  exerciseId: string;
  before: BuilderExercise;
  candidates: BuilderExercise[];
}
export function isEquivalentExercise(before: BuilderExercise, candidate: BuilderExercise): boolean {
  const difficulty = { beginner: 0, intermediate: 1, advanced: 2 };
  return (
    before.variantId !== candidate.variantId &&
    Boolean(before.movementPattern && before.focusMode) &&
    before.movementPattern === candidate.movementPattern &&
    before.focusMode === candidate.focusMode &&
    before.metric === candidate.metric &&
    before.timing.perSide === candidate.timing.perSide &&
    difficulty[candidate.difficulty] <= difficulty[before.difficulty] &&
    before.primaryMuscles.length > 0 &&
    before.primaryMuscles.every((muscle) =>
      candidate.primaryMuscles.some((other) => other.code === muscle.code),
    )
  );
}
