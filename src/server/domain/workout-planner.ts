import { createHash } from "node:crypto";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "../db";
import {
  plannerCommands,
  plannerPreferences,
  workoutPlannerPrograms,
  user,
  profiles,
  recordedSets,
  workoutSteps,
  workouts,
  variants,
  variantRevisions,
  variantRevisionMuscles,
  builderInventories,
} from "../db/schema";
import type {
  PlannerConfig,
  PlannerDraft,
  PlannerHistory,
  PlannerPreferences,
  PlannerPreview,
  PlannerProgram,
  PlannerState,
} from "../../shared/workout-planner";
import type { Experience } from "../../shared/contracts";
import type { MuscleGroup } from "../../shared/catalog-taxonomy";
import { MUSCLE_GROUPS } from "../../shared/catalog-taxonomy";
import { getAvailableBuilderCatalog } from "./workout-builder";
import {
  buildPlannerDraft,
  getPlannerReplacements,
  summarizePlannerHistory,
} from "./workout-planner-engine";
import { DomainError } from "./errors";

const variantId = z
  .string()
  .min(1)
  .max(160)
  .regex(/^[a-zA-Z0-9_.-]+$/);
const revision = z.number().int().min(0).max(1_000_000);
const uniqueVariants = z
  .array(variantId)
  .max(100)
  .refine((ids) => new Set(ids).size === ids.length);
export const plannerConfigInput = z
  .strictObject({
    mode: z.enum(["program", "single"]),
    place: z.enum(["home", "gym", "outdoor", "workout_park"]),
    direction: z.enum(["strength", "calisthenics", "yoga", "stretch", "mobility"]),
    split: z.enum(["fullbody", "upper_lower", "push_pull_legs"]),
    daysPerWeek: z.number().int().min(1).max(4),
    intent: z.enum(["start", "maintain", "develop"]),
    durationMinutes: z.number().int().min(15).max(120),
    execution: z.enum(["straight", "pairs"]),
    variety: z.enum(["familiar", "different"]),
    preferredTemplateId: z.string().min(1).max(120).optional(),
    excludeVariantIds: uniqueVariants.optional(),
    replacements: z
      .array(
        z.strictObject({
          dayKey: z.string().min(1).max(80),
          slotKey: z.string().min(1).max(100),
          variantId,
        }),
      )
      .max(80)
      .refine((rows) => new Set(rows.map((r) => `${r.dayKey}:${r.slotKey}`)).size === rows.length)
      .optional(),
  })
  .superRefine((config, ctx) => {
    if (config.mode === "program" && config.split === "upper_lower" && config.daysPerWeek < 2)
      ctx.addIssue({
        code: "custom",
        path: ["daysPerWeek"],
        message: "Сплит верх/низ рассчитан на 2–4 занятия.",
      });
    if (config.mode === "program" && config.split === "push_pull_legs" && config.daysPerWeek !== 3)
      ctx.addIssue({
        code: "custom",
        path: ["daysPerWeek"],
        message: "Жимы/тяги/ноги рассчитаны на три занятия.",
      });
    if (
      !["strength", "calisthenics"].includes(config.direction) &&
      (config.split !== "fullbody" || config.execution !== "straight")
    )
      ctx.addIssue({
        code: "custom",
        message: "Для этого направления используем цельную последовательность.",
      });
  });
export const plannerConfirmInput = z.strictObject({
  operationId: z.uuid(),
  expectedProgramRevision: revision,
  fingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  config: plannerConfigInput,
});
export const plannerPreferencesInput = z
  .strictObject({
    operationId: z.uuid(),
    expectedRevision: revision,
    excludedVariantIds: uniqueVariants,
    favoriteVariantIds: uniqueVariants,
  })
  .refine(
    (input) => !input.favoriteVariantIds.some((id) => input.excludedVariantIds.includes(id)),
    {
      message: "Упражнение не может одновременно быть любимым и исключённым.",
    },
  );
export const plannerReplacementInput = z.strictObject({
  config: plannerConfigInput,
  dayKey: z.string().min(1).max(80),
  slotKey: z.string().min(1).max(100),
});
type Database = ReturnType<typeof getDb>;
type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];
type Reader = Pick<Database, "select">;

async function transaction<T>(owner: string, work: (tx: Transaction) => Promise<T>): Promise<T> {
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
        return work(tx);
      });
    } catch (error) {
      const cause = error instanceof Error && "cause" in error ? error.cause : error;
      const code = typeof cause === "object" && cause && "code" in cause ? cause.code : null;
      if (attempt >= 2 || (code !== "40001" && code !== "40P01")) throw error;
    }
  }
}
function hash(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}
async function replay<T>(
  tx: Reader,
  owner: string,
  operationId: string,
  payloadHash: string,
): Promise<T | undefined> {
  const [saved] = await tx
    .select()
    .from(plannerCommands)
    .where(and(eq(plannerCommands.userId, owner), eq(plannerCommands.operationId, operationId)));
  if (!saved) return undefined;
  if (saved.payloadHash !== payloadHash)
    throw new DomainError(
      "OPERATION_REUSED",
      409,
      "Этот запрос уже использован для другого действия.",
    );
  return saved.result as T;
}
function toProgram(row: typeof workoutPlannerPrograms.$inferSelect): PlannerProgram {
  return { revision: row.revision, confirmedAt: row.confirmedAt.toISOString(), draft: row.draft };
}
async function preferences(owner: string, reader: Reader): Promise<PlannerPreferences> {
  const [row] = await reader
    .select()
    .from(plannerPreferences)
    .where(eq(plannerPreferences.userId, owner));
  return {
    revision: row?.revision ?? 0,
    excludedVariantIds: row?.excludedVariantIds ?? [],
    favoriteVariantIds: row?.favoriteVariantIds ?? [],
  };
}
async function lastProgram(
  owner: string,
  mode: PlannerConfig["mode"],
  reader: Reader,
): Promise<PlannerProgram | null> {
  const [row] = await reader
    .select()
    .from(workoutPlannerPrograms)
    .where(
      and(
        eq(workoutPlannerPrograms.userId, owner),
        sql`${workoutPlannerPrograms.draft}->'config'->>'mode' = ${mode}`,
      ),
    )
    .orderBy(desc(workoutPlannerPrograms.revision))
    .limit(1);
  return row ? toProgram(row) : null;
}
async function latestRevision(owner: string, reader: Reader): Promise<number> {
  const [row] = await reader
    .select({ revision: workoutPlannerPrograms.revision })
    .from(workoutPlannerPrograms)
    .where(eq(workoutPlannerPrograms.userId, owner))
    .orderBy(desc(workoutPlannerPrograms.revision))
    .limit(1);
  return row?.revision ?? 0;
}
async function experience(owner: string, reader: Reader): Promise<Experience> {
  const [row] = await reader
    .select({ experience: profiles.experience, adult: profiles.adultConfirmed })
    .from(profiles)
    .where(eq(profiles.userId, owner));
  if (!row?.adult)
    throw new DomainError(
      "ADULT_CONFIRMATION_REQUIRED",
      409,
      "Сервис тренировок доступен совершеннолетним. Подтверди возраст в профиле.",
    );
  return z.enum(["beginner", "returning", "regular"]).parse(row.experience);
}
async function history(owner: string, reader: Reader): Promise<PlannerHistory[]> {
  const sessions = await reader
    .select()
    .from(workouts)
    .where(
      and(
        eq(workouts.userId, owner),
        eq(workouts.isDemo, false),
        inArray(workouts.status, ["completed", "partial", "aborted"]),
      ),
    )
    .orderBy(desc(workouts.completedAt))
    .limit(60);
  if (!sessions.length) return [];
  const rows = await reader
    .select({
      workoutId: recordedSets.workoutId,
      reps: recordedSets.reps,
      seconds: recordedSets.durationSeconds,
      weight: recordedSets.weightG,
      variantId: variantRevisions.variantId,
      revisionId: variantRevisions.id,
      snapshot: workoutSteps.snapshot,
    })
    .from(recordedSets)
    .innerJoin(
      workoutSteps,
      and(
        eq(workoutSteps.userId, recordedSets.userId),
        eq(workoutSteps.workoutId, recordedSets.workoutId),
        eq(workoutSteps.id, recordedSets.stepId),
      ),
    )
    .innerJoin(variantRevisions, eq(variantRevisions.id, workoutSteps.variantRevisionId))
    .where(
      and(
        eq(recordedSets.userId, owner),
        inArray(
          recordedSets.workoutId,
          sessions.map((session) => session.id),
        ),
      ),
    )
    .orderBy(desc(recordedSets.createdAt))
    .limit(6000);
  // Pinned planner snapshots keep phase and muscle provenance even after a catalog revision changes.
  const missingIds = [...new Set(rows.filter((row) => !row.snapshot).map((row) => row.revisionId))];
  const muscleRows = missingIds.length
    ? await reader
        .select()
        .from(variantRevisionMuscles)
        .where(inArray(variantRevisionMuscles.variantRevisionId, missingIds))
    : [];
  return sessions
    .filter((session) => session.completedAt)
    .map((session) => ({
      id: session.id,
      endedAt: session.completedAt!.toISOString(),
      status: z.enum(["completed", "partial", "aborted"]).parse(session.status),
      programRevision: session.sourcePlannerRevision,
      dayKey: session.sourcePlannerDayKey,
      sets: rows
        .filter((row) => row.workoutId === session.id)
        .map((row) => ({
          variantId: row.variantId,
          reps: row.reps,
          durationSeconds: row.seconds,
          weightKg: row.weight / 1000,
          primaryMuscles:
            row.snapshot?.exercise.primaryMuscles.map((muscle) => muscle.code) ??
            muscleRows
              .filter(
                (muscle) =>
                  muscle.variantRevisionId === row.revisionId && muscle.role === "primary",
              )
              .map((muscle) => muscle.muscleGroupCode)
              .filter((muscle): muscle is MuscleGroup => muscle in MUSCLE_GROUPS),
          secondaryMuscles:
            row.snapshot?.exercise.secondaryMuscles.map((muscle) => muscle.code) ??
            muscleRows
              .filter(
                (muscle) =>
                  muscle.variantRevisionId === row.revisionId && muscle.role === "secondary",
              )
              .map((muscle) => muscle.muscleGroupCode)
              .filter((muscle): muscle is MuscleGroup => muscle in MUSCLE_GROUPS),
          phase: row.snapshot?.phase ?? "main",
        })),
    }));
}
export async function getPlannerState(owner: string): Promise<PlannerState> {
  return transaction(owner, async (tx) => {
    // A transaction owns one pg connection: execute queries serially on that connection.
    const pref = await preferences(owner, tx);
    const program = await lastProgram(owner, "program", tx);
    const single = await lastProgram(owner, "single", tx);
    const currentExperience = await experience(owner, tx);
    const recentHistory = await history(owner, tx);
    const names = pref.excludedVariantIds.length
      ? await tx
          .select({ variantId: variants.id, name: variants.nameRu })
          .from(variants)
          .where(inArray(variants.id, pref.excludedVariantIds))
      : [];
    return {
      preferences: pref,
      program,
      single,
      excludedExercises: names,
      experience: currentExperience,
      historySummary: summarizePlannerHistory(recentHistory, new Date()),
    };
  });
}
async function context(owner: string, config: PlannerConfig, tx: Transaction) {
  const pref = await preferences(owner, tx);
  const previous = await lastProgram(owner, config.mode, tx);
  const currentExperience = await experience(owner, tx);
  const recentHistory = await history(owner, tx);
  const catalog = await getAvailableBuilderCatalog(owner, config.place, undefined, tx);
  return {
    config,
    catalog,
    preferences: pref,
    previous,
    experience: currentExperience,
    history: recentHistory,
    now: new Date(),
  };
}
async function preview(
  owner: string,
  config: PlannerConfig,
  tx: Transaction,
): Promise<PlannerPreview> {
  const input = await context(owner, config, tx);
  const draft = buildPlannerDraft(input);
  // Owner lock serializes inventory/preferences/confirmation writes. Inventory is re-read inside it.
  const [inventory] = await tx
    .select()
    .from(builderInventories)
    .where(and(eq(builderInventories.userId, owner), eq(builderInventories.place, config.place)));
  if (!inventory) throw new DomainError("INVENTORY_REQUIRED", 409, "Сначала укажи инвентарь.");
  const expectedProgramRevision = await latestRevision(owner, tx);
  const metadata = {
    expectedProgramRevision,
    preferencesRevision: input.preferences.revision,
    inventoryRevision: inventory.revision,
  };
  return { ...draft, ...metadata, fingerprint: hash({ owner, draft, ...metadata }) };
}
export async function previewPlanner(owner: string, value: unknown): Promise<PlannerPreview> {
  const config = plannerConfigInput.parse(value);
  return transaction(owner, (tx) => preview(owner, config, tx));
}
export async function plannerReplacementOptions(owner: string, value: unknown) {
  const input = plannerReplacementInput.parse(value);
  return transaction(owner, async (tx) => ({
    options: getPlannerReplacements({
      ...(await context(owner, input.config, tx)),
      dayKey: input.dayKey,
      slotKey: input.slotKey,
    }),
  }));
}
export async function confirmPlanner(owner: string, value: unknown): Promise<PlannerProgram> {
  const input = plannerConfirmInput.parse(value);
  const payloadHash = hash({ action: "planner-confirm-v1", input });
  return transaction(owner, async (tx) => {
    const prior = await replay<PlannerProgram>(tx, owner, input.operationId, payloadHash);
    if (prior) return prior;
    const [active] = await tx
      .select({ id: workouts.id })
      .from(workouts)
      .where(and(eq(workouts.userId, owner), inArray(workouts.status, ["ready", "active"])))
      .limit(1);
    if (active)
      throw new DomainError(
        "WORKOUT_ACTIVE",
        409,
        "Сначала заверши текущую тренировку. После этого можно подтвердить новый состав.",
      );
    if ((await latestRevision(owner, tx)) !== input.expectedProgramRevision)
      throw new DomainError(
        "PROGRAM_CONFLICT",
        409,
        "Программа уже изменилась. Получи новый черновик.",
      );
    const current = await preview(owner, input.config, tx);
    if (current.fingerprint !== input.fingerprint)
      throw new DomainError(
        "PREVIEW_CHANGED",
        409,
        "Условия, история или состав изменились. Посмотри обновлённый черновик перед подтверждением.",
      );
    if (input.expectedProgramRevision >= 4000)
      throw new DomainError(
        "PROGRAM_VERSION_LIMIT",
        409,
        "Достигнут предел сохранённых версий. Обратись в поддержку.",
      );
    // Catalogue retirement/revocation locks use the same variant order as constructor saves.
    const revisionIds = [
      ...new Set(current.days.flatMap((day) => day.steps.map((step) => step.revisionId))),
    ];
    await tx
      .select({ id: variants.id })
      .from(variants)
      .innerJoin(variantRevisions, eq(variantRevisions.variantId, variants.id))
      .where(inArray(variantRevisions.id, revisionIds))
      .orderBy(asc(variants.id))
      .for("update", { of: variants });
    await tx
      .select({ id: variantRevisions.id })
      .from(variantRevisions)
      .where(inArray(variantRevisions.id, revisionIds))
      .orderBy(asc(variantRevisions.id))
      .for("share");
    const locked = await preview(owner, input.config, tx);
    if (locked.fingerprint !== input.fingerprint)
      throw new DomainError("PREVIEW_CHANGED", 409, "Каталог изменился. Получи новый черновик.");
    const draft: PlannerDraft = {
      policyVersion: locked.policyVersion,
      config: locked.config,
      days: locked.days,
      notes: locked.notes,
      changes: locked.changes,
      weeklyPrimarySets: locked.weeklyPrimarySets,
      historySummary: locked.historySummary,
      disclosure: locked.disclosure,
    };
    const [stored] = await tx
      .insert(workoutPlannerPrograms)
      .values({ userId: owner, revision: input.expectedProgramRevision + 1, draft })
      .returning();
    const result = toProgram(stored);
    await tx
      .insert(plannerCommands)
      .values({ userId: owner, operationId: input.operationId, payloadHash, result });
    return result;
  });
}
export async function savePlannerPreferences(
  owner: string,
  value: unknown,
): Promise<PlannerPreferences> {
  const input = plannerPreferencesInput.parse(value);
  const payloadHash = hash({ action: "planner-preferences-v1", input });
  return transaction(owner, async (tx) => {
    const prior = await replay<PlannerPreferences>(tx, owner, input.operationId, payloadHash);
    if (prior) return prior;
    const current = await preferences(owner, tx);
    if (current.revision !== input.expectedRevision)
      throw new DomainError(
        "PREFERENCES_CONFLICT",
        409,
        "Предпочтения уже изменились. Обнови данные.",
      );
    const ids = [...new Set([...input.excludedVariantIds, ...input.favoriteVariantIds])];
    const known = ids.length
      ? await tx.select({ id: variants.id }).from(variants).where(inArray(variants.id, ids))
      : [];
    if (known.length !== ids.length)
      throw new DomainError("UNKNOWN_EXERCISE", 400, "Одно из упражнений отсутствует в каталоге.");
    const result: PlannerPreferences = {
      revision: current.revision + 1,
      excludedVariantIds: input.excludedVariantIds,
      favoriteVariantIds: input.favoriteVariantIds,
    };
    await tx
      .insert(plannerPreferences)
      .values({ userId: owner, ...result })
      .onConflictDoUpdate({
        target: plannerPreferences.userId,
        set: { ...result, updatedAt: new Date() },
      });
    await tx
      .insert(plannerCommands)
      .values({ userId: owner, operationId: input.operationId, payloadHash, result });
    return result;
  });
}
