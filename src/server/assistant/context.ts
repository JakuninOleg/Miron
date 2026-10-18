import { and, desc, eq, sql } from "drizzle-orm";
import type { CompanionId, WorkoutEnergyEstimate } from "../../shared/contracts";
import { getDb } from "../db";
import {
  profiles,
  profileResources,
  resourceTypes,
  user,
  workouts,
  recordedSets,
  builderInventories,
  builderInventoryResources,
} from "../db/schema";
import { DomainError } from "../domain/errors";
import { getWorkout } from "../domain/workouts";
import { readCommunicationMemory } from "../domain/communication-memory";

export async function authorizeAssistant(ownerId: string) {
  const [owner] = await getDb()
    .select({ status: user.status })
    .from(user)
    .where(eq(user.id, ownerId))
    .limit(1);
  if (owner?.status !== "active")
    throw new DomainError("ACCOUNT_UNAVAILABLE", 403, "Аккаунт недоступен.");
  const [profile] = await getDb()
    .select({
      companion: profiles.companion,
      adultConfirmed: profiles.adultConfirmed,
      onboardingCompleted: profiles.onboardingCompleted,
      experience: profiles.experience,
      goal: profiles.goal,
      discipline: profiles.discipline,
      location: profiles.location,
      durationMinutes: profiles.defaultMinutes,
      daysPerWeek: profiles.weeklyDays,
    })
    .from(profiles)
    .where(eq(profiles.userId, ownerId))
    .limit(1);
  if (!profile) throw new DomainError("PROFILE_NOT_FOUND", 404, "Профиль ещё не создан.");
  if (!profile.adultConfirmed || !profile.onboardingCompleted)
    throw new DomainError(
      "ADULT_CONFIRMATION_REQUIRED",
      403,
      "Сначала заверши знакомство и подтверди, что тебе исполнилось 18 лет.",
    );
  if (profile.companion !== "max" && profile.companion !== "lika")
    throw new DomainError("PROFILE_INVALID", 409, "Обнови профиль напарника.");
  return { ...profile, companion: profile.companion as CompanionId };
}

export async function readAssistantProfile(ownerId: string) {
  const profile = await authorizeAssistant(ownerId);
  const equipment = await getDb()
    .select({
      code: resourceTypes.code,
      quantity: profileResources.quantity,
    })
    .from(profileResources)
    .innerJoin(resourceTypes, eq(resourceTypes.id, profileResources.resourceTypeId))
    .where(eq(profileResources.userId, ownerId))
    .limit(50);
  // The planner uses its own confirmed inventory, which can differ from onboarding equipment.
  // Keep metadata small; previewPlanner reads and validates the full owner inventory itself.
  const confirmedBuilderInventories = await getDb()
    .select({
      place: builderInventories.place,
      revision: builderInventories.revision,
      confirmedAt: builderInventories.confirmedAt,
      resourceCount: sql<number>`(select count(*)::int from ${builderInventoryResources} where ${builderInventoryResources.userId} = ${ownerId} and ${builderInventoryResources.place} = ${builderInventories.place})`,
    })
    .from(builderInventories)
    .where(eq(builderInventories.userId, ownerId))
    .limit(4);
  return {
    ...profile,
    equipment,
    confirmedBuilderInventories,
    communicationPreferences: await readCommunicationMemory(ownerId, profile.companion),
    basis: "user_reported",
  };
}

export async function readRecentWorkouts(ownerId: string) {
  await authorizeAssistant(ownerId);
  const recent = await getDb()
    .select({
      id: workouts.id,
      title: workouts.name,
      status: workouts.status,
      revision: workouts.revision,
      completedAt: workouts.completedAt,
      energyEstimate: workouts.energyEstimate,
      loadFeedback: workouts.loadFeedback,
      direction: workouts.energyActivity,
      sets: sql<number>`(select count(*)::int from ${recordedSets} where ${recordedSets.userId} = ${ownerId} and ${recordedSets.workoutId} = ${workouts.id})`,
    })
    .from(workouts)
    .where(
      and(
        eq(workouts.userId, ownerId),
        sql`${workouts.status} in ('completed','partial','aborted')`,
      ),
    )
    .orderBy(desc(workouts.completedAt))
    .limit(6);
  return recent.map((row) => ({
    ...row,
    title: row.title.slice(0, 100),
    completedAt: row.completedAt?.toISOString() ?? null,
    energyEstimate: compactEnergy(row.energyEstimate),
  }));
}

export async function readCurrentWorkout(ownerId: string) {
  await authorizeAssistant(ownerId);
  const [current] = await getDb()
    .select({ id: workouts.id })
    .from(workouts)
    .where(and(eq(workouts.userId, ownerId), sql`${workouts.status} in ('ready','active')`))
    .orderBy(desc(workouts.createdAt))
    .limit(1);
  if (!current) return null;
  return compactWorkout(await getWorkout(ownerId, current.id));
}

export function compactWorkout(workout: Awaited<ReturnType<typeof getWorkout>>) {
  return {
    id: workout.id,
    title: workout.title.slice(0, 100),
    status: workout.status,
    revision: workout.revision,
    currentIndex: workout.currentIndex,
    direction: workout.energyActivity,
    loadFeedback: workout.loadFeedback,
    energyEstimate: compactEnergy(workout.energyEstimate),
    exercises: workout.exercises.slice(0, 12).map((exercise) => ({
      id: exercise.id,
      name: exercise.name.slice(0, 100),
      metric: exercise.metric,
      status: exercise.status,
      sets: exercise.sets,
      targetReps: exercise.targetReps,
      targetDurationSeconds: exercise.targetDurationSeconds,
      restSeconds: exercise.restSeconds,
      skipped: exercise.skipped,
      dropSet: exercise.dropSet,
      pairKey: exercise.pairKey,
      coaching: exercise.coaching
        ? {
            progression: exercise.coaching.progression,
            repetitionsInReserve: exercise.coaching.repetitionsInReserve,
          }
        : undefined,
    })),
    recordedSets: workout.recordedSets.slice(-24),
    recordedSetCount: workout.recordedSets.length,
    truncated: workout.exercises.length > 12 || workout.recordedSets.length > 24,
  };
}

function compactEnergy(estimate: WorkoutEnergyEstimate | null | undefined) {
  return estimate
    ? {
        estimatedKcal: estimate.estimatedKcal,
        bodyWeightKg: estimate.bodyWeightKg,
        weightSource: estimate.weightSource,
        methodVersion: estimate.methodVersion,
        durationSeconds: estimate.durationSeconds,
        basis: estimate.basis,
        approximate: true,
      }
    : null;
}

export async function readAssistantContext(ownerId: string) {
  const profile = await readAssistantProfile(ownerId);
  const [currentWorkout, recentWorkouts] = await Promise.all([
    readCurrentWorkout(ownerId),
    readRecentWorkouts(ownerId),
  ]);
  const latest = recentWorkouts.find(
    (row) => row.status === "completed" || row.status === "partial",
  );
  const latestCompletedWorkout = latest
    ? compactWorkout(await getWorkout(ownerId, latest.id))
    : null;
  return {
    profile,
    currentWorkout,
    recentWorkouts,
    latestCompletedWorkout,
    offlineJournal:
      "not_visible_to_server; absence of a fact does not prove an unsynced command was lost",
  };
}

export async function readExerciseCards(ownerId: string, exerciseIds: string[]) {
  const current = await readCurrentWorkout(ownerId);
  if (!current) throw new DomainError("WORKOUT_NOT_FOUND", 404, "Текущего занятия нет.");
  const workout = await getWorkout(ownerId, current.id);
  return exerciseIds.map((id) => {
    const exercise = workout.exercises.find((row) => row.id === id);
    if (!exercise)
      throw new DomainError("EXERCISE_NOT_FOUND", 404, "Упражнения нет в текущем занятии.");
    return {
      id,
      name: exercise.name,
      status: exercise.status,
      metric: exercise.metric,
      instructions: exercise.instructions.slice(0, 6).map((line) => line.slice(0, 350)),
      disclosure:
        exercise.status === "published"
          ? "Карточка каталога"
          : "Черновик; техника не проверена экспертом",
    };
  });
}
