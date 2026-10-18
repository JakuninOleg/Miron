import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "../db";
import { plannerPreferences, recordedSets, workouts, workoutSteps } from "../db/schema";
import { getAvailableBuilderCatalog } from "./workout-builder";
import { DomainError } from "./errors";
import { isEquivalentExercise, type WorkoutAlternatives } from "../../shared/workout-replacement";
type Reader = Pick<ReturnType<typeof getDb>, "select">;
export async function getWorkoutAlternatives(
  owner: string,
  id: string,
  exerciseId: string,
  reader: Reader = getDb(),
): Promise<WorkoutAlternatives> {
  z.uuid().parse(id);
  z.uuid().parse(exerciseId);
  const [workout] = await reader
    .select()
    .from(workouts)
    .where(and(eq(workouts.userId, owner), eq(workouts.id, id)));
  if (!workout) throw new DomainError("WORKOUT_NOT_FOUND", 404, "Тренировка не найдена.");
  const [step] = await reader
    .select()
    .from(workoutSteps)
    .where(
      and(
        eq(workoutSteps.userId, owner),
        eq(workoutSteps.workoutId, id),
        eq(workoutSteps.id, exerciseId),
      ),
    );
  const facts = await reader
    .select({ id: recordedSets.id })
    .from(recordedSets)
    .where(
      and(
        eq(recordedSets.userId, owner),
        eq(recordedSets.workoutId, id),
        eq(recordedSets.stepId, exerciseId),
      ),
    )
    .limit(1);
  if (
    workout.status !== "active" ||
    !step?.snapshot ||
    step.ordinal < workout.currentIndex ||
    step.skipped ||
    facts.length ||
    step.snapshot.pairKey ||
    step.snapshot.dropSet
  )
    throw new DomainError(
      "REPLACEMENT_UNAVAILABLE",
      409,
      "Заменить можно ещё не начатое отдельное упражнение. Записанные подходы и состав пары не меняем.",
    );
  const place = z.enum(["home", "gym", "outdoor", "workout_park"]).parse(workout.place);
  const direction = z
    .enum(["strength", "calisthenics", "yoga", "stretch", "mobility"])
    .parse(workout.energyActivity);
  const [preferences] = await reader
    .select()
    .from(plannerPreferences)
    .where(eq(plannerPreferences.userId, owner));
  const catalog = await getAvailableBuilderCatalog(owner, place, direction, reader);
  const before = step.snapshot.exercise;
  return {
    revision: workout.revision,
    exerciseId,
    before,
    candidates: catalog
      .filter(
        (candidate) =>
          !preferences?.excludedVariantIds.includes(candidate.variantId) &&
          isEquivalentExercise(before, candidate),
      )
      .sort((a, b) => a.name.localeCompare(b.name, "ru"))
      .slice(0, 12),
  };
}
