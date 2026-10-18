import { createHash } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { workoutExecution } from "../../shared/workout-execution";
import { dropSetResultError } from "../../shared/training-methods";
import { estimateWorkoutEnergy, isEnergyActivity } from "../../shared/workout-energy";
import { canRateWorkout, type WorkoutLoadFeedback } from "../../shared/workout-feedback";
import type {
  CommandAck,
  RewardKind,
  Workout,
  WorkoutReward,
  WorkoutEnergyEstimate,
  WorkoutStatus,
} from "../../shared/contracts";
import {
  dailyXpDelta,
  eligibleXp,
  isTerminalWorkout,
  rewardDay,
  XP_POLICY_VERSION,
  XP_TIMEZONE,
} from "../../shared/xp-policy";
import { getDb } from "../db";
import { CATALOG_SKILL_POLICY } from "../db/catalog-skill-policy";
import {
  dailyXp,
  equipmentProfiles,
  exercises,
  plans,
  profileResources,
  profiles,
  recordedSets,
  resourceTypes,
  templates,
  templateSteps,
  user,
  variantRequirements,
  variantRevisions,
  variants,
  workoutCommands,
  workoutResources,
  workouts,
  workoutSteps,
  xpEvents,
} from "../db/schema";
import { resourcesSatisfy } from "./catalog";
import { DomainError } from "./errors";
import { assertProductAccess } from "./access";
import { getProgress } from "./profile";
import { correctWorkoutSet } from "../../shared/workout-edits";
import { lighterWorkout } from "../../shared/workout-adjustment";
import { estimateBuilderWorkout } from "../../shared/workout-builder";
import { getWorkoutAlternatives } from "./workout-alternatives";

export function kilogramsToGrams(value: number) {
  const decimal = value.toString();
  if (!/^\d+(?:\.\d{1,3})?$/.test(decimal))
    throw new DomainError("INVALID_WEIGHT", 400, "Укажите вес с точностью до грамма.");
  const [whole, fraction = ""] = decimal.split(".");
  return Number(whole) * 1000 + Number(fraction.padEnd(3, "0"));
}

export const workoutCommandInput = z
  .object({
    operationId: z.string().uuid(),
    expectedRevision: z.number().int().positive(),
    command: z.discriminatedUnion("type", [
      z.strictObject({ type: z.literal("lighten_remaining") }),
      z.strictObject({
        type: z.literal("replace_exercise"),
        exerciseId: z.uuid(),
        revisionId: z.uuid(),
      }),
      z.strictObject({
        type: z.literal("correct_set"),
        setId: z.uuid(),
        reps: z.number().int().min(1).max(1000),
        weightKg: z
          .number()
          .min(0)
          .max(1000)
          .refine((value) => /^\d+(?:\.\d{1,3})?$/.test(value.toString())),
        drop: z
          .strictObject({
            reps: z.number().int().min(1).max(100),
            weightKg: z
              .number()
              .positive()
              .max(1000)
              .refine((value) => /^\d+(?:\.\d{1,3})?$/.test(value.toString())),
          })
          .optional(),
      }),
      z.strictObject({
        type: z.literal("correct_timed_set"),
        setId: z.uuid(),
        durationSeconds: z.number().int().min(1).max(86400),
      }),
      z.strictObject({ type: z.literal("undo_set"), setId: z.uuid() }),
      z
        .object({
          type: z.literal("record_timed_set"),
          exerciseId: z.uuid(),
          setId: z.uuid(),
          durationSeconds: z.number().int().min(1).max(86400),
        })
        .strict(),
      z
        .object({
          type: z.literal("record_set"),
          exerciseId: z.string().uuid(),
          setId: z.string().uuid(),
          reps: z.number().int().min(1).max(1000),
          weightKg: z
            .number()
            .min(0)
            .max(1000)
            .refine((n) => /^\d+(?:\.\d{1,3})?$/.test(n.toString())),
          drop: z
            .strictObject({
              reps: z.number().int().min(1).max(100),
              weightKg: z
                .number()
                .positive()
                .max(1000)
                .refine((n) => /^\d+(?:\.\d{1,3})?$/.test(n.toString())),
            })
            .optional(),
        })
        .strict(),
      z.object({ type: z.literal("next_exercise") }).strict(),
      z.object({ type: z.literal("finish") }).strict(),
      z
        .object({
          type: z.literal("rate_load"),
          feedback: z.enum(["easy", "just_right", "hard", "too_hard"]),
        })
        .strict(),
      z.object({ type: z.literal("end_early") }).strict(),
      z.object({ type: z.literal("skip_exercise"), exerciseId: z.uuid() }).strict(),
      z
        .object({
          type: z.literal("estimate_energy"),
          bodyWeightKg: z.number().min(25).max(400).multipleOf(0.1).optional(),
          workload: z
            .array(
              z
                .object({
                  exerciseId: z.uuid(),
                  sets: z.number().int().min(0).max(30),
                  repsPerSet: z.number().int().min(1).max(1000).optional(),
                  durationSecondsPerSet: z.number().int().min(1).max(86400).optional(),
                })
                .strict(),
            )
            .min(1)
            .max(50)
            .optional(),
        })
        .strict(),
    ]),
  })
  .strict();
export type WorkoutCommand = z.infer<typeof workoutCommandInput>;
export function commandHash(command: WorkoutCommand) {
  return createHash("sha256").update(JSON.stringify(command)).digest("hex");
}
export function checkCommandReplay(
  saved: { requestHash: string; result: unknown } | undefined,
  hash: string,
) {
  if (!saved) return undefined;
  if (saved.requestHash !== hash)
    throw new DomainError(
      "OPERATION_REUSED",
      409,
      "Идентификатор действия уже использован с другими данными.",
    );
  return saved.result;
}
export function assertOwner(actual: string, principal: string) {
  if (actual !== principal)
    throw new DomainError("WORKOUT_NOT_FOUND", 404, "Тренировка не найдена.");
}

export async function getWorkout(
  userId: string,
  workoutId: string,
  db: Pick<ReturnType<typeof getDb>, "select"> = getDb(),
): Promise<Workout> {
  const [workout] = await db
    .select()
    .from(workouts)
    .where(and(eq(workouts.userId, userId), eq(workouts.id, workoutId)));
  if (!workout) throw new DomainError("WORKOUT_NOT_FOUND", 404, "Тренировка не найдена.");
  const steps = await db
    .select()
    .from(workoutSteps)
    .where(and(eq(workoutSteps.userId, userId), eq(workoutSteps.workoutId, workoutId)))
    .orderBy(workoutSteps.ordinal);
  const sets = await db
    .select()
    .from(recordedSets)
    .where(and(eq(recordedSets.userId, userId), eq(recordedSets.workoutId, workoutId)))
    .orderBy(recordedSets.createdAt, recordedSets.setIndex);
  const resources = await db
    .select({
      code: resourceTypes.code,
      quantity: workoutResources.quantity,
      maxLoadG: workoutResources.maxLoadG,
      isStable: workoutResources.isStable,
      confirmedAt: workoutResources.confirmedAt,
    })
    .from(workoutResources)
    .innerJoin(resourceTypes, eq(resourceTypes.id, workoutResources.resourceTypeId))
    .where(and(eq(workoutResources.userId, userId), eq(workoutResources.workoutId, workoutId)));
  return {
    id: workout.id,
    title: workout.name,
    ...(workout.savedSource ? { source: workout.savedSource } : {}),
    subtitle: workout.sourcePlannerRevision
      ? "Подтверждённый личный план · инструкции могут быть черновиками"
      : workout.isDemo
        ? "Демонстрационная программа · не прошла экспертную проверку"
        : "Персональная программа",
    estimatedMinutes: Math.round(workout.availableSeconds / 60),
    exercises: steps.map((step) => ({
      revisionId: step.variantRevisionId,
      id: step.id,
      name: step.name,
      description: step.instructions,
      equipment:
        step.snapshot?.exercise.equipment.map((resource) => resource.code) ??
        resources.map((r) => r.code),
      skipped: step.skipped,
      sets: step.sets,
      targetReps: step.reps,
      ...(step.metric === "time" ? { targetDurationSeconds: step.reps } : {}),
      ...(step.snapshot?.exercise.timing.perSide ? { perSide: true } : {}),
      restSeconds: step.snapshot?.restSeconds ?? 60,
      ...(step.snapshot ? { timing: step.snapshot.exercise.timing } : {}),
      instructions: step.snapshot?.exercise.instructions ?? [step.instructions],
      metric: step.metric as "reps" | "time",
      status: step.snapshot?.exercise.status ?? (workout.isDemo ? "demo" : "published"),
      ...(step.snapshot?.pairKey ? { pairKey: step.snapshot.pairKey } : {}),
      ...(step.snapshot?.transitionSeconds !== undefined
        ? { transitionSeconds: step.snapshot.transitionSeconds }
        : {}),
      ...(step.snapshot?.phase ? { phase: step.snapshot.phase } : {}),
      ...(step.snapshot?.coaching ? { coaching: step.snapshot.coaching } : {}),
      ...(step.snapshot?.dropSet ? { dropSet: step.snapshot.dropSet } : {}),
    })),
    currentIndex: workout.currentIndex,
    status: workout.status as Workout["status"],
    revision: workout.revision,
    recordedSets: sets.map((s) => ({
      id: s.id,
      exerciseId: s.stepId,
      setIndex: s.setIndex,
      reps: s.reps,
      durationSeconds: s.durationSeconds,
      weightKg: s.weightG / 1000,
      ...(s.drop ? { drop: s.drop } : {}),
      completedAt: s.createdAt.toISOString(),
    })),
    startedAt: workout.startedAt?.toISOString() ?? null,
    completedAt: workout.completedAt?.toISOString() ?? null,
    rewardKind: workout.rewardKind as RewardKind,
    ...(workout.rewardDay ? { rewardDay: workout.rewardDay } : {}),
    ...(workout.reward ? { reward: workout.reward } : {}),
    ...(workout.sourcePlannerRevision
      ? { sourcePlannerRevision: workout.sourcePlannerRevision }
      : {}),
    ...(workout.sourcePlannerDayKey ? { sourcePlannerDayKey: workout.sourcePlannerDayKey } : {}),
    ...(workout.energyActivity ? { energyActivity: workout.energyActivity } : {}),
    ...(workout.energyEstimate ? { energyEstimate: workout.energyEstimate } : {}),
    ...(workout.loadFeedback ? { loadFeedback: workout.loadFeedback } : {}),
  };
}
export async function listWorkouts(userId: string) {
  return getDb()
    .select()
    .from(workouts)
    .where(eq(workouts.userId, userId))
    .orderBy(sql`${workouts.createdAt} desc`)
    .limit(50);
}
export const createWorkoutInput = z
  .object({
    templateCode: z.string().min(1).max(100).optional(),
    equipmentProfileId: z.string().uuid().optional(),
  })
  .strict();
export async function createWorkout(userId: string, raw: unknown = {}) {
  const input = createWorkoutInput.parse(raw);
  const workoutId = await getDb().transaction(async (tx) => {
    const [owner] = await tx
      .select({ status: user.status })
      .from(user)
      .where(eq(user.id, userId))
      .for("update");
    if (!owner || owner.status !== "active")
      throw new DomainError("ACCOUNT_UNAVAILABLE", 403, "Аккаунт недоступен.");
    const [profile] = await tx
      .select()
      .from(profiles)
      .where(eq(profiles.userId, userId))
      .for("update");
    const [equipment] = await tx
      .select()
      .from(equipmentProfiles)
      .where(
        and(
          input.equipmentProfileId ? eq(equipmentProfiles.id, input.equipmentProfileId) : undefined,
          eq(equipmentProfiles.userId, userId),
        ),
      )
      .orderBy(equipmentProfiles.createdAt)
      .limit(1)
      .for("update");
    if (!profile || !equipment)
      throw new DomainError("PROFILE_NOT_FOUND", 404, "Сначала сохраните профиль и инвентарь.");
    if (!profile.onboardingCompleted || !profile.adultConfirmed)
      throw new DomainError("ONBOARDING_REQUIRED", 409, "Сначала заполните профиль.");
    const [active] = await tx
      .select()
      .from(workouts)
      .where(and(eq(workouts.userId, userId), sql`${workouts.status} in ('ready','active')`))
      .orderBy(sql`${workouts.createdAt} desc`)
      .limit(1);
    if (active) {
      if (active.status === "ready") {
        await assertProductAccess(userId, tx);
        await tx
          .update(workouts)
          .set({
            status: "active",
            startedAt: new Date(),
            rewardDay: rewardDay(new Date()),
            revision: active.revision + 1,
            updatedAt: new Date(),
          })
          .where(and(eq(workouts.userId, userId), eq(workouts.id, active.id)));
      }
      return active.id;
    }
    await assertProductAccess(userId, tx);
    const [template] = await tx
      .select()
      .from(templates)
      .where(eq(templates.code, input.templateCode ?? `demo-${profile.discipline}`));
    if (!template) throw new DomainError("TEMPLATE_NOT_FOUND", 404, "Шаблон не найден.");
    const demo = template.status === "demo";
    if (
      template.status !== "published" &&
      !(
        demo &&
        process.env.NODE_ENV !== "production" &&
        process.env.ENABLE_DEMO_WORKOUTS === "true"
      )
    )
      throw new DomainError(
        "CONTENT_NOT_PUBLISHED",
        409,
        "Программа ещё не прошла экспертную проверку.",
      );
    const steps = await tx
      .select({
        revisionId: variantRevisions.id,
        revisionStatus: variantRevisions.status,
        variantId: variants.id,
        variantStatus: variants.status,
        exerciseDiscipline: exercises.discipline,
        name: sql<string>`coalesce(${variantRevisions.editorial}->>'displayNameRu', ${variants.nameRu})`,
        metric: variants.metric,
        instructions: variantRevisions.instructions,
        editorial: variantRevisions.editorial,
        assignmentGate: sql<
          string | null
        >`${variantRevisions.editorial}->'execution'->>'assignmentGate'`,
        ordinal: templateSteps.ordinal,
        sets: templateSteps.sets,
        reps: templateSteps.reps,
      })
      .from(templateSteps)
      .innerJoin(variantRevisions, eq(variantRevisions.id, templateSteps.variantRevisionId))
      .innerJoin(variants, eq(variants.id, variantRevisions.variantId))
      .innerJoin(exercises, eq(exercises.id, variants.exerciseId))
      .where(eq(templateSteps.templateId, template.id))
      .orderBy(templateSteps.ordinal);
    if (!steps.length)
      throw new DomainError("EMPTY_TEMPLATE", 409, "В шаблоне пока нет упражнений.");
    if (
      steps.some((step) => !["standard_review", "skill_review"].includes(step.assignmentGate ?? ""))
    )
      throw new DomainError(
        "CONTENT_NOT_PUBLISHED",
        409,
        "У карточки ещё не проверены условия допуска к тренировке.",
      );
    if (
      steps.some(
        (step) =>
          step.assignmentGate === "skill_review" ||
          step.editorial?.skillDemand?.requiresPriorSkill === true ||
          CATALOG_SKILL_POLICY[step.variantId]?.kind === "movement",
      )
    )
      throw new DomainError(
        "SKILL_ASSESSMENT_REQUIRED",
        409,
        "Для этого навыка нужна отдельная проверка тренером.",
      );
    if (
      steps.some((step) => {
        const demand = step.editorial?.skillDemand;
        const policy = CATALOG_SKILL_POLICY[step.variantId];
        return (
          step.assignmentGate !== "standard_review" ||
          !demand ||
          demand.requiresPriorSkill !== false ||
          !["none", "preparation"].includes(demand.kind) ||
          (policy ? policy.kind !== demand.kind : demand.kind !== "none")
        );
      })
    )
      throw new DomainError(
        "CONTENT_NOT_PUBLISHED",
        409,
        "У карточки ещё не проверены условия допуска к тренировке.",
      );
    if (
      !demo &&
      steps.some((s) => s.revisionStatus !== "published" || s.variantStatus !== "published")
    )
      throw new DomainError(
        "CONTENT_NOT_PUBLISHED",
        409,
        "Карточка упражнения недоступна для назначения.",
      );
    const resources = await tx
      .select({
        resourceTypeId: resourceTypes.id,
        code: resourceTypes.code,
        quantity: profileResources.quantity,
        maxLoadG: profileResources.maxLoadG,
        isStable: profileResources.isStable,
        confirmedAt: profileResources.confirmedAt,
      })
      .from(profileResources)
      .innerJoin(resourceTypes, eq(resourceTypes.id, profileResources.resourceTypeId))
      .where(
        and(
          eq(profileResources.userId, userId),
          eq(profileResources.equipmentProfileId, equipment.id),
        ),
      );
    const requirements = await tx
      .select({
        variantId: variantRequirements.variantId,
        code: resourceTypes.code,
        quantity: variantRequirements.quantity,
        requiresConfirmation: variantRequirements.requiresConfirmation,
      })
      .from(variantRequirements)
      .innerJoin(resourceTypes, eq(resourceTypes.id, variantRequirements.resourceTypeId));
    if (
      steps.some(
        (step) =>
          !resourcesSatisfy(
            requirements.filter((r) => r.variantId === step.variantId),
            resources,
          ),
      )
    )
      throw new DomainError(
        "MISSING_RESOURCES",
        409,
        "Для этой программы не хватает подтверждённых ресурсов.",
      );
    const [plan] = await tx
      .insert(plans)
      .values({ userId, templateId: template.id, name: template.name })
      .returning();
    const [workout] = await tx
      .insert(workouts)
      .values({
        userId,
        planId: plan.id,
        name: template.name,
        isDemo: demo,
        status: "active",
        startedAt: new Date(),
        rewardDay: rewardDay(new Date()),
        rewardKind: template.rewardKind,
        place: equipment.place,
        availableSeconds: profile.defaultMinutes * 60,
        sourceProfileRevision: equipment.revision,
        energyActivity:
          steps.every((step) => step.exerciseDiscipline === steps[0].exerciseDiscipline) &&
          isEnergyActivity(steps[0].exerciseDiscipline)
            ? steps[0].exerciseDiscipline
            : null,
      })
      .returning();
    await tx.insert(workoutSteps).values(
      steps.map((s) => ({
        userId,
        workoutId: workout.id,
        variantRevisionId: s.revisionId,
        name: s.name,
        instructions: s.instructions,
        metric: s.metric,
        ordinal: s.ordinal,
        sets: s.sets,
        reps: s.metric === "time" ? 20 : s.reps,
      })),
    );
    if (resources.length)
      await tx.insert(workoutResources).values(
        resources.map((r) => ({
          resourceTypeId: r.resourceTypeId,
          quantity: r.quantity,
          maxLoadG: r.maxLoadG,
          isStable: r.isStable,
          confirmedAt: r.confirmedAt,
          userId,
          workoutId: workout.id,
        })),
      );
    return workout.id;
  });
  return getWorkout(userId, workoutId);
}

export async function applyWorkoutCommand(
  userId: string,
  workoutId: string,
  raw: unknown,
  authorizeProposal?: (
    tx: Parameters<Parameters<ReturnType<typeof getDb>["transaction"]>[0]>[0],
  ) => Promise<void>,
): Promise<CommandAck> {
  const input = workoutCommandInput.parse(raw);
  const hash = commandHash(input);
  return getDb().transaction(async (tx) => {
    // Serialize this principal's command IDs, including attempts against different workouts.
    const [owner] = await tx
      .select({ id: user.id, status: user.status })
      .from(user)
      .where(eq(user.id, userId))
      .for("update");
    if (!owner || owner.status !== "active")
      throw new DomainError("ACCOUNT_UNAVAILABLE", 403, "Аккаунт недоступен.");
    if (authorizeProposal) await authorizeProposal(tx);
    const [workout] = await tx
      .select()
      .from(workouts)
      .where(and(eq(workouts.userId, userId), eq(workouts.id, workoutId)))
      .for("update");
    if (!workout) throw new DomainError("WORKOUT_NOT_FOUND", 404, "Тренировка не найдена.");
    const [saved] = await tx
      .select()
      .from(workoutCommands)
      .where(
        and(eq(workoutCommands.userId, userId), eq(workoutCommands.operationId, input.operationId)),
      );
    if (saved && saved.workoutId !== workoutId)
      throw new DomainError("OPERATION_REUSED", 409, "Идентификатор действия уже использован.");
    const replay = checkCommandReplay(saved, hash);
    if (replay !== undefined) return replay as CommandAck;
    if (workout.revision !== input.expectedRevision)
      throw new DomainError(
        "REVISION_CONFLICT",
        409,
        "Тренировка изменилась на другом устройстве. Обновите занятие.",
      );
    if (input.command.type === "replace_exercise") {
      await assertProductAccess(userId, tx);
      const command = input.command;
      await tx
        .select({ id: variants.id })
        .from(variants)
        .innerJoin(variantRevisions, eq(variantRevisions.variantId, variants.id))
        .where(eq(variantRevisions.id, command.revisionId))
        .for("share");
      const available = await getWorkoutAlternatives(userId, workout.id, command.exerciseId, tx);
      const candidate = available.candidates.find(
        (exercise) => exercise.revisionId === command.revisionId,
      );
      if (!candidate)
        throw new DomainError(
          "EXERCISE_UNAVAILABLE",
          409,
          "Эта замена больше не подходит условиям. Обнови варианты.",
        );
      const steps = await tx
        .select()
        .from(workoutSteps)
        .where(and(eq(workoutSteps.userId, userId), eq(workoutSteps.workoutId, workout.id)))
        .orderBy(workoutSteps.ordinal);
      const selected = steps.find((step) => step.id === command.exerciseId)!;
      if (!selected.snapshot)
        throw new DomainError("REPLACEMENT_UNAVAILABLE", 409, "Нет сохранённого состава.");
      const snapshot = {
        ...selected.snapshot,
        exercise: candidate,
        revisionId: candidate.revisionId,
        changeNote: `Замена: ${selected.name} → ${candidate.name}`,
      };
      await tx
        .update(workoutSteps)
        .set({
          variantRevisionId: candidate.revisionId,
          name: candidate.name,
          metric: candidate.metric,
          instructions: candidate.instructions.join("\n"),
          snapshot,
        })
        .where(and(eq(workoutSteps.userId, userId), eq(workoutSteps.id, selected.id)));
      const pinned = steps.flatMap((step) =>
        step.id === selected.id ? [snapshot] : step.snapshot ? [step.snapshot] : [],
      );
      await tx
        .update(workouts)
        .set({
          revision: workout.revision + 1,
          updatedAt: new Date(),
          ...(pinned.length === steps.length
            ? {
                availableSeconds: Math.max(
                  1,
                  Math.round(estimateBuilderWorkout(pinned).maxSeconds),
                ),
              }
            : {}),
        })
        .where(and(eq(workouts.userId, userId), eq(workouts.id, workout.id)));
      const result: CommandAck = {
        operationId: input.operationId,
        workout: await getWorkout(userId, workout.id, tx),
        progress: await getProgress(userId, tx),
      };
      await tx.insert(workoutCommands).values({
        userId,
        workoutId: workout.id,
        operationId: input.operationId,
        requestHash: hash,
        result,
      });
      return result;
    }
    if (input.command.type === "lighten_remaining") {
      let next: Workout;
      try {
        next = lighterWorkout(await getWorkout(userId, workout.id, tx));
      } catch (cause) {
        throw new DomainError(
          "WORKOUT_EDIT_UNAVAILABLE",
          409,
          cause instanceof Error ? cause.message : "Не удалось изменить состав.",
        );
      }
      const steps = await tx
        .select()
        .from(workoutSteps)
        .where(and(eq(workoutSteps.userId, userId), eq(workoutSteps.workoutId, workout.id)))
        .orderBy(workoutSteps.ordinal);
      for (const step of steps) {
        const changed = next.exercises.find((exercise) => exercise.id === step.id);
        if (changed && changed.sets !== step.sets)
          await tx
            .update(workoutSteps)
            .set({
              sets: changed.sets,
              snapshot: step.snapshot ? { ...step.snapshot, sets: changed.sets } : null,
            })
            .where(and(eq(workoutSteps.userId, userId), eq(workoutSteps.id, step.id)));
      }
      const pinned = steps.flatMap((step) =>
        step.snapshot
          ? [
              {
                ...step.snapshot,
                sets: next.exercises.find((exercise) => exercise.id === step.id)?.sets ?? step.sets,
              },
            ]
          : [],
      );
      await tx
        .update(workouts)
        .set({
          revision: next.revision,
          updatedAt: new Date(),
          ...(pinned.length === steps.length
            ? {
                availableSeconds: Math.max(
                  1,
                  Math.round(estimateBuilderWorkout(pinned).maxSeconds),
                ),
              }
            : {}),
        })
        .where(and(eq(workouts.userId, userId), eq(workouts.id, workout.id)));
      const result: CommandAck = {
        operationId: input.operationId,
        workout: await getWorkout(userId, workout.id, tx),
        progress: await getProgress(userId, tx),
      };
      await tx.insert(workoutCommands).values({
        userId,
        workoutId: workout.id,
        operationId: input.operationId,
        requestHash: hash,
        result,
      });
      return result;
    }
    if (
      input.command.type === "correct_set" ||
      input.command.type === "correct_timed_set" ||
      input.command.type === "undo_set"
    ) {
      const current = await getWorkout(userId, workout.id, tx);
      const setId = input.command.setId;
      let next: Workout;
      try {
        next = correctWorkoutSet(current, input.command);
      } catch (cause) {
        throw new DomainError(
          "WORKOUT_EDIT_UNAVAILABLE",
          409,
          cause instanceof Error ? cause.message : "Не удалось исправить запись.",
        );
      }
      const target = and(
        eq(recordedSets.userId, userId),
        eq(recordedSets.workoutId, workout.id),
        eq(recordedSets.id, input.command.setId),
      );
      if (input.command.type === "undo_set") await tx.delete(recordedSets).where(target);
      else {
        const corrected = next.recordedSets.find((set) => set.id === setId)!;
        await tx
          .update(recordedSets)
          .set({
            reps: corrected.reps,
            durationSeconds: corrected.durationSeconds ?? null,
            weightG: kilogramsToGrams(corrected.weightKg),
            drop: corrected.drop ?? null,
          })
          .where(target);
      }
      await tx
        .update(workouts)
        .set({
          currentIndex: next.currentIndex,
          revision: next.revision,
          energyEstimate: next.energyEstimate ?? null,
          updatedAt: new Date(),
        })
        .where(and(eq(workouts.userId, userId), eq(workouts.id, workout.id)));
      const result: CommandAck = {
        operationId: input.operationId,
        workout: await getWorkout(userId, workout.id, tx),
        progress: await getProgress(userId, tx),
      };
      await tx.insert(workoutCommands).values({
        userId,
        operationId: input.operationId,
        workoutId: workout.id,
        requestHash: hash,
        result,
      });
      return result;
    }
    if (input.command.type === "estimate_energy" || input.command.type === "rate_load") {
      let energyEstimate: WorkoutEnergyEstimate | undefined;
      let loadFeedback: WorkoutLoadFeedback | undefined;
      const currentWorkout = await getWorkout(userId, workout.id, tx);
      if (input.command.type === "rate_load") {
        if (!canRateWorkout(currentWorkout))
          throw new DomainError(
            "WORKOUT_FEEDBACK_UNAVAILABLE",
            409,
            "Оценить нагрузку можно после занятия с выполненной основной работой.",
          );
        loadFeedback = input.command.feedback;
      } else {
        try {
          energyEstimate = estimateWorkoutEnergy(
            currentWorkout,
            input.command,
            new Date().toISOString(),
          );
        } catch (error) {
          throw new DomainError(
            "ENERGY_ESTIMATE_UNAVAILABLE",
            409,
            error instanceof Error ? error.message : "Не удалось оценить расход.",
          );
        }
      }
      await tx
        .update(workouts)
        .set({
          energyEstimate,
          loadFeedback,
          revision: workout.revision + 1,
          updatedAt: new Date(),
        })
        .where(and(eq(workouts.userId, userId), eq(workouts.id, workout.id)));
      const result: CommandAck = {
        operationId: input.operationId,
        workout: await getWorkout(userId, workout.id, tx),
        progress: await getProgress(userId, tx),
      };
      await tx.insert(workoutCommands).values({
        userId,
        operationId: input.operationId,
        workoutId: workout.id,
        requestHash: hash,
        result,
      });
      return result;
    }
    if (isTerminalWorkout(workout.status as WorkoutStatus))
      throw new DomainError("WORKOUT_FINISHED", 409, "Тренировка уже завершена.");
    const admittedAt = workout.startedAt ?? new Date();
    const pinnedDay = workout.rewardDay ?? rewardDay(admittedAt);
    let status: WorkoutStatus = "active";
    let reward: WorkoutReward | undefined;
    let currentIndex = workout.currentIndex;
    const command = input.command;
    const steps = await tx
      .select()
      .from(workoutSteps)
      .where(and(eq(workoutSteps.userId, userId), eq(workoutSteps.workoutId, workout.id)))
      .orderBy(workoutSteps.ordinal);
    const sets = await tx
      .select()
      .from(recordedSets)
      .where(and(eq(recordedSets.userId, userId), eq(recordedSets.workoutId, workout.id)))
      .orderBy(recordedSets.setIndex);
    const execution = workoutExecution(
      steps.map((step) => ({ ...step, pairKey: step.snapshot?.pairKey })),
      currentIndex,
      sets.map((set) => set.stepId),
    );
    if (command.type === "record_set" || command.type === "record_timed_set") {
      const step = steps.find((candidate) => candidate.id === command.exerciseId);
      if (!step || step.skipped || step.ordinal !== workout.currentIndex)
        throw new DomainError("INVALID_SET", 400, "Подход отсутствует в текущем упражнении.");
      if (command.type === "record_timed_set" && step.metric !== "time")
        throw new DomainError("INVALID_METRIC", 400, "Упражнение не измеряется временем.");
      if (command.type === "record_set" && step.metric === "time" && workout.sourcePlannerRevision)
        throw new DomainError("INVALID_METRIC", 400, "Запишите фактически выполненные секунды.");
      const existing = sets.filter((set) => set.stepId === step.id);
      if (sets.some((s) => s.id === command.setId))
        throw new DomainError("SET_ALREADY_RECORDED", 409, "Этот подход уже сохранён.");
      if (existing.length >= step.sets)
        throw new DomainError("INVALID_SET", 409, "Все подходы этого упражнения сохранены.");
      if (!execution.canRecord)
        throw new DomainError("PAIR_ORDER", 409, "Продолжите пару со следующего упражнения.");
      if (command.type === "record_set") {
        const invalidDrop = dropSetResultError(
          {
            sets: step.sets,
            metric: step.metric,
            dropSet: step.snapshot?.dropSet,
            pairKey: step.snapshot?.pairKey,
          },
          existing.length,
          command.weightKg,
          command.drop,
        );
        if (invalidDrop) throw new DomainError("INVALID_DROP_SET", 400, invalidDrop);
      }
      await tx.insert(recordedSets).values({
        id: command.setId,
        userId,
        workoutId: workout.id,
        stepId: step.id,
        setIndex: existing.length,
        reps: command.type === "record_set" ? command.reps : null,
        durationSeconds: command.type === "record_timed_set" ? command.durationSeconds : null,
        weightG: command.type === "record_set" ? kilogramsToGrams(command.weightKg) : 0,
        drop: command.type === "record_set" ? (command.drop ?? null) : null,
      });
    } else {
      const step = steps[currentIndex];
      const complete = (id: string, required: number) =>
        sets.filter((set) => set.stepId === id).length === required;
      if (command.type === "skip_exercise") {
        if (!step || step.id !== command.exerciseId || step.skipped || complete(step.id, step.sets))
          throw new DomainError("INVALID_EXERCISE", 409, "Пропустить можно текущее упражнение.");
        await tx
          .update(workoutSteps)
          .set({ skipped: true })
          .where(and(eq(workoutSteps.userId, userId), eq(workoutSteps.id, step.id)));
        currentIndex = execution.afterSkipIndex;
      } else if (command.type === "next_exercise") {
        if (!step || !execution.canAdvance)
          throw new DomainError(
            "INCOMPLETE_EXERCISE",
            409,
            "Сначала сохраните подходы упражнения.",
          );
        if (execution.nextIndex === null)
          throw new DomainError(
            "LAST_EXERCISE",
            409,
            "Это последнее упражнение. Завершите тренировку.",
          );
        currentIndex = execution.nextIndex;
      } else {
        const full = steps.length > 0 && steps.every((s) => !s.skipped && complete(s.id, s.sets));
        if (
          command.type === "finish" &&
          (!steps.length || steps.some((s) => !s.skipped && !complete(s.id, s.sets)))
        )
          throw new DomainError(
            "INCOMPLETE_WORKOUT",
            409,
            "Сначала сохраните подходы или завершите занятие раньше.",
          );
        status = full ? "completed" : sets.length ? "partial" : "aborted";
        const day = pinnedDay;
        const kind = workout.rewardKind as RewardKind;
        const eligible = eligibleXp(kind, status);
        await tx.insert(dailyXp).values({ userId, day }).onConflictDoNothing();
        const [ledger] = await tx
          .select()
          .from(dailyXp)
          .where(and(eq(dailyXp.userId, userId), eq(dailyXp.day, day)))
          .for("update");
        const awarded = dailyXpDelta(eligible, ledger.amount);
        const total = ledger.amount + awarded;
        if (awarded > 0) {
          await tx
            .update(dailyXp)
            .set({ amount: total, updatedAt: new Date() })
            .where(and(eq(dailyXp.userId, userId), eq(dailyXp.day, day)));
          await tx
            .insert(xpEvents)
            .values({ userId, workoutId: workout.id, event: status, amount: awarded });
        }
        reward = {
          policyVersion: XP_POLICY_VERSION,
          day,
          timezone: XP_TIMEZONE,
          kind,
          eligibleXp: eligible,
          awardedXp: awarded,
          dayTotalXp: total,
        };
      }
    }
    const revision = workout.revision + 1;
    await tx
      .update(workouts)
      .set({
        status,
        revision,
        currentIndex,
        startedAt: admittedAt,
        rewardDay: pinnedDay,
        updatedAt: new Date(),
        ...(isTerminalWorkout(status) ? { completedAt: new Date(), reward } : {}),
      })
      .where(and(eq(workouts.userId, userId), eq(workouts.id, workout.id)));
    if (
      (status === "completed" || status === "partial") &&
      isEnergyActivity(workout.energyActivity)
    ) {
      const [previousEnergy] = await tx
        .select({ estimate: workouts.energyEstimate })
        .from(workouts)
        .where(
          and(
            eq(workouts.userId, userId),
            sql`${workouts.energyEstimate}->>'weightSource' = 'user_reported'`,
          ),
        )
        .orderBy(sql`${workouts.updatedAt} desc`)
        .limit(1);
      const energyEstimate = estimateWorkoutEnergy(
        await getWorkout(userId, workout.id, tx),
        previousEnergy?.estimate ? { bodyWeightKg: previousEnergy.estimate.bodyWeightKg } : {},
        new Date().toISOString(),
      );
      await tx
        .update(workouts)
        .set({ energyEstimate })
        .where(and(eq(workouts.userId, userId), eq(workouts.id, workout.id)));
    }
    const result: CommandAck = {
      operationId: input.operationId,
      workout: await getWorkout(userId, workout.id, tx),
      progress: await getProgress(userId, tx),
    };
    await tx.insert(workoutCommands).values({
      userId,
      operationId: input.operationId,
      workoutId: workout.id,
      requestHash: hash,
      result,
    });
    return result;
  });
}
