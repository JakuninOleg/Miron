import { createHash } from "node:crypto";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import type { Workout } from "../../shared/contracts";
import type { PlannerDay } from "../../shared/workout-planner";
import { rewardDay } from "../../shared/xp-policy";
import { getDb } from "../db";
import {
  builderInventories,
  builderInventoryResources,
  plannerCommands,
  plannerPreferences,
  plans,
  profiles,
  resourceTypes,
  user,
  variantRequirements,
  variantRevisions,
  variants,
  workoutPlannerPrograms,
  workoutResources,
  workouts,
  workoutSteps,
} from "../db/schema";
import { DomainError } from "./errors";
import { getAvailableBuilderCatalog } from "./workout-builder";
import { getWorkout } from "./workouts";

export const plannerStartInput = z.strictObject({
  operationId: z.uuid(),
  expectedProgramRevision: z.number().int().min(1).max(1_000_000),
  dayKey: z.string().min(1).max(80),
});

export function assertPlannerDayExecution(day: PlannerDay): void {
  if (!day.steps.length || day.steps.length > 40)
    throw new DomainError("INVALID_PROGRAM", 409, "В плане нет допустимого занятия.");
  const paired = new Map<string, number[]>();
  for (const [index, step] of day.steps.entries()) {
    if (
      !Number.isInteger(step.sets) ||
      step.sets < 1 ||
      step.sets > 10 ||
      !Number.isInteger(step.target) ||
      step.target < 1 ||
      step.target > (step.exercise.metric === "time" ? 600 : 100) ||
      !Number.isInteger(step.restSeconds) ||
      step.restSeconds < 0 ||
      step.restSeconds > 600 ||
      (step.transitionSeconds !== undefined &&
        (!Number.isInteger(step.transitionSeconds) ||
          step.transitionSeconds < 0 ||
          step.transitionSeconds > 120))
    )
      throw new DomainError("INVALID_PROGRAM", 409, "Параметры занятия недоступны.");
    if (step.pairKey) {
      const indices = paired.get(step.pairKey) ?? [];
      indices.push(index);
      paired.set(step.pairKey, indices);
    }
  }
  for (const indices of paired.values()) {
    const [a, b] = indices;
    if (
      indices.length !== 2 ||
      b !== a + 1 ||
      day.steps[a].sets !== day.steps[b].sets ||
      day.steps[a].restSeconds !== day.steps[b].restSeconds ||
      day.steps[a].transitionSeconds !== day.steps[b].transitionSeconds ||
      day.steps[a].phase !== "main" ||
      day.steps[b].phase !== "main"
    )
      throw new DomainError(
        "INVALID_PROGRAM",
        409,
        "Пара должна содержать два соседних упражнения с одинаковыми подходами, отдыхом и переходом.",
      );
  }
}

/** Starts only the saved server revision; the request cannot supply exercises or XP. */
export async function startPlannerWorkout(owner: string, raw: unknown): Promise<Workout> {
  const input = plannerStartInput.parse(raw);
  const hash = createHash("sha256")
    .update(JSON.stringify({ action: "start_planner_day", input }))
    .digest("hex");
  for (let attempt = 0; ; attempt++) {
    try {
      return await getDb().transaction(async (tx) => {
        const [principal] = await tx
          .select({ status: user.status })
          .from(user)
          .where(eq(user.id, owner))
          .for("update");
        if (!principal || principal.status !== "active")
          throw new DomainError("ACCOUNT_UNAVAILABLE", 403, "Аккаунт недоступен.");
        const [saved] = await tx
          .select()
          .from(plannerCommands)
          .where(
            and(
              eq(plannerCommands.userId, owner),
              eq(plannerCommands.operationId, input.operationId),
            ),
          );
        if (saved) {
          if (saved.payloadHash !== hash)
            throw new DomainError(
              "OPERATION_REUSED",
              409,
              "Этот запрос уже использован для другого действия.",
            );
          const { workoutId } = z.strictObject({ workoutId: z.uuid() }).parse(saved.result);
          return getWorkout(owner, workoutId, tx);
        }
        const [profile] = await tx.select().from(profiles).where(eq(profiles.userId, owner));
        if (!profile?.onboardingCompleted || !profile.adultConfirmed)
          throw new DomainError("ONBOARDING_REQUIRED", 409, "Сначала заполните профиль.");
        const [program] = await tx
          .select()
          .from(workoutPlannerPrograms)
          .where(
            and(
              eq(workoutPlannerPrograms.userId, owner),
              eq(workoutPlannerPrograms.revision, input.expectedProgramRevision),
            ),
          );
        if (!program)
          throw new DomainError("PROGRAM_NOT_FOUND", 404, "Подтверждённая программа не найдена.");
        const [latest] = await tx
          .select({ revision: workoutPlannerPrograms.revision })
          .from(workoutPlannerPrograms)
          .where(
            and(
              eq(workoutPlannerPrograms.userId, owner),
              sql`${workoutPlannerPrograms.draft}->'config'->>'mode' = ${program.draft.config.mode}`,
            ),
          )
          .orderBy(desc(workoutPlannerPrograms.revision))
          .limit(1);
        if (latest?.revision !== input.expectedProgramRevision)
          throw new DomainError(
            "REVISION_CONFLICT",
            409,
            "План изменился. Обновите программу перед началом.",
          );
        const day = program.draft.days.find((candidate) => candidate.key === input.dayKey);
        if (!day) throw new DomainError("DAY_NOT_FOUND", 404, "День отсутствует в этой программе.");
        assertPlannerDayExecution(day);
        const [active] = await tx
          .select({ id: workouts.id })
          .from(workouts)
          .where(and(eq(workouts.userId, owner), inArray(workouts.status, ["ready", "active"])))
          .limit(1);
        if (active)
          throw new DomainError(
            "WORKOUT_ACTIVE",
            409,
            "У тебя уже есть активное занятие. Продолжи его или закончи раньше.",
          );
        const [inventory] = await tx
          .select()
          .from(builderInventories)
          .where(
            and(
              eq(builderInventories.userId, owner),
              eq(builderInventories.place, program.draft.config.place),
            ),
          )
          .for("update");
        if (!inventory)
          throw new DomainError(
            "INVENTORY_REQUIRED",
            409,
            "Сначала подтверди инвентарь для этого места.",
          );
        const variantIds = [...new Set(day.steps.map((step) => step.exercise.variantId))];
        const revisionIds = [...new Set(day.steps.map((step) => step.revisionId))];
        // Lock stable variants first: new revision FK inserts cannot race admission.
        await tx
          .select({ id: variants.id })
          .from(variants)
          .where(inArray(variants.id, variantIds))
          .orderBy(asc(variants.id))
          .for("update");
        await tx
          .select({ id: variantRevisions.id })
          .from(variantRevisions)
          .where(inArray(variantRevisions.id, revisionIds))
          .orderBy(asc(variantRevisions.id))
          .for("update");
        await tx
          .select({ variantId: variantRequirements.variantId })
          .from(variantRequirements)
          .where(inArray(variantRequirements.variantId, variantIds))
          .orderBy(asc(variantRequirements.variantId), asc(variantRequirements.resourceTypeId))
          .for("share");
        const [preferences] = await tx
          .select()
          .from(plannerPreferences)
          .where(eq(plannerPreferences.userId, owner));
        if (
          day.steps.some((step) =>
            preferences?.excludedVariantIds.includes(step.exercise.variantId),
          )
        )
          throw new DomainError(
            "PROGRAM_UNAVAILABLE",
            409,
            "В плане есть исключённое упражнение. Подготовь обновлённый план.",
          );
        const available = await getAvailableBuilderCatalog(
          owner,
          program.draft.config.place,
          undefined,
          tx,
        );
        const byRevision = new Map(available.map((exercise) => [exercise.revisionId, exercise]));
        if (
          day.steps.some(
            (step) => byRevision.get(step.revisionId)?.variantId !== step.exercise.variantId,
          )
        )
          throw new DomainError(
            "PROGRAM_UNAVAILABLE",
            409,
            "Карточка или нужный инвентарь изменились. Подготовь обновлённый план.",
          );
        const resources = await tx
          .select({
            resourceTypeId: builderInventoryResources.resourceTypeId,
            quantity: builderInventoryResources.quantity,
            isStable: builderInventoryResources.isStable,
            confirmedAt: builderInventoryResources.confirmedAt,
          })
          .from(builderInventoryResources)
          .innerJoin(resourceTypes, eq(resourceTypes.id, builderInventoryResources.resourceTypeId))
          .where(
            and(
              eq(builderInventoryResources.userId, owner),
              eq(builderInventoryResources.place, program.draft.config.place),
            ),
          )
          .for("share");
        const [plan] = await tx
          .insert(plans)
          .values({ userId: owner, templateId: null, name: day.title })
          .returning();
        const startedAt = new Date();
        const [workout] = await tx
          .insert(workouts)
          .values({
            userId: owner,
            planId: plan.id,
            name: day.title,
            status: "active",
            startedAt,
            rewardDay: rewardDay(startedAt),
            rewardKind: ["strength", "calisthenics"].includes(program.draft.config.direction)
              ? "main"
              : "support",
            place: program.draft.config.place,
            availableSeconds: Math.max(1, Math.round(day.estimate.maxSeconds)),
            sourceProfileRevision: inventory.revision,
            sourcePlannerRevision: program.revision,
            sourcePlannerDayKey: day.key,
            energyActivity: program.draft.config.direction,
            isDemo: false,
          })
          .returning();
        await tx.insert(workoutSteps).values(
          day.steps.map((step, ordinal) => ({
            userId: owner,
            workoutId: workout.id,
            variantRevisionId: step.revisionId,
            ordinal,
            name: step.exercise.name,
            sets: step.sets,
            reps: step.target,
            instructions: step.exercise.instructions.join("\n"),
            metric: step.exercise.metric,
            snapshot: step,
          })),
        );
        if (resources.length)
          await tx.insert(workoutResources).values(
            resources.map((resource) => ({
              ...resource,
              userId: owner,
              workoutId: workout.id,
              maxLoadG: null,
              confirmedAt: resource.isStable === true ? resource.confirmedAt : null,
            })),
          );
        await tx.insert(plannerCommands).values({
          userId: owner,
          operationId: input.operationId,
          payloadHash: hash,
          result: { workoutId: workout.id },
        });
        return getWorkout(owner, workout.id, tx);
      });
    } catch (error) {
      const cause = error instanceof Error && "cause" in error ? error.cause : error;
      const code = typeof cause === "object" && cause && "code" in cause ? cause.code : undefined;
      if (attempt >= 2 || (code !== "40001" && code !== "40P01")) throw error;
    }
  }
}
