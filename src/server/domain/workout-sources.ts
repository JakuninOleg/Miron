import { and, asc, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import type { PlannerConfig, PlannerDay } from "../../shared/workout-planner";
import type { SavedWorkoutPreview } from "../../shared/workout-sources";
import { estimateBuilderWorkout } from "../../shared/workout-builder";
import { getDb } from "../db";
import {
  profiles,
  user,
  workoutPlannerPrograms,
  workouts,
  workoutSteps,
  calendarEntries,
} from "../db/schema";
import { readCustomWorkout } from "./workout-builder";
import { DomainError } from "./errors";
import type { RewardKind } from "../../shared/contracts";

export const savedSourceInput = z.strictObject({
  source: z.enum(["template", "history", "schedule"]),
  id: z.uuid(),
});
export const savedStartInput = savedSourceInput.extend({
  operationId: z.uuid(),
  expectedSourceRevision: z.number().int().min(1).max(1_000_000),
});
export const plannerStartInput = z.strictObject({
  operationId: z.uuid(),
  expectedProgramRevision: z.number().int().min(1).max(1_000_000),
  dayKey: z.string().min(1).max(80),
});
type Reader = Pick<ReturnType<typeof getDb>, "select">;
export type StartInput = z.infer<typeof plannerStartInput> | z.infer<typeof savedStartInput>;

export async function readSavedSource(
  owner: string,
  raw: unknown,
  reader: Reader,
): Promise<SavedWorkoutPreview> {
  const input = savedSourceInput.parse(raw);
  if (input.source === "schedule") {
    const [entry] = await reader
      .select()
      .from(calendarEntries)
      .where(and(eq(calendarEntries.userId, owner), eq(calendarEntries.id, input.id)));
    if (!entry) throw new DomainError("SCHEDULE_NOT_FOUND", 404, "Запись календаря не найдена.");
    if (entry.status !== "planned")
      throw new DomainError(
        "SCHEDULE_CLOSED",
        409,
        "Это занятие уже начато, пропущено или убрано из расписания.",
      );
    return { ...input, revision: entry.revision, ...entry.snapshot };
  }
  if (input.source === "template") {
    const template = await readCustomWorkout(owner, input.id, reader);
    const main = template.steps.filter(
      (step) => (step.phase ?? "main") === "main" && step.exercise.focusMode === "loading",
    );
    return {
      ...input,
      revision: template.revision,
      place: template.place,
      direction: template.direction,
      rewardKind:
        ["strength", "calisthenics"].includes(template.direction) &&
        new Set(main.map((step) => step.exercise.variantId)).size >= 3 &&
        main.reduce((sum, step) => sum + step.sets, 0) >= 6
          ? "main"
          : "support",
      day: {
        key: `custom-${template.id}`,
        title: template.name,
        sourceTemplateId: template.id,
        steps: template.steps.map((step, index) => ({
          ...step,
          slotKey: `custom-${index}`,
          phase: step.phase ?? "main",
          sourceVariantId: step.exercise.variantId,
        })),
        estimate: template.estimate,
        warnings: ["Собственная тренировка. Проверь состав и текущие условия перед стартом."],
      },
    };
  }
  const [workout] = await reader
    .select()
    .from(workouts)
    .where(and(eq(workouts.userId, owner), eq(workouts.id, input.id)));
  if (!workout) throw new DomainError("WORKOUT_NOT_FOUND", 404, "Тренировка не найдена.");
  if (
    !["completed", "partial"].includes(workout.status) ||
    workout.isDemo ||
    !workout.energyActivity
  )
    throw new DomainError(
      "REPEAT_UNAVAILABLE",
      409,
      "Для повтора выбери сохранённое завершённое занятие.",
    );
  const rows = await reader
    .select()
    .from(workoutSteps)
    .where(and(eq(workoutSteps.userId, owner), eq(workoutSteps.workoutId, input.id)))
    .orderBy(asc(workoutSteps.ordinal));
  if (!rows.length || rows.some((row) => !row.snapshot))
    throw new DomainError(
      "REPEAT_UNAVAILABLE",
      409,
      "У старой тренировки нет полного состава. Собери актуальный вариант в конструкторе.",
    );
  const steps = rows.flatMap((row) =>
    row.snapshot ? [{ ...row.snapshot, sets: row.sets, target: row.reps }] : [],
  );
  const place = z.enum(["home", "gym", "outdoor", "workout_park"]).parse(workout.place);
  return {
    ...input,
    revision: workout.revision,
    place,
    direction: workout.energyActivity,
    rewardKind: z.enum(["main", "support"]).parse(workout.rewardKind),
    day: {
      key: `repeat-${workout.id}`,
      title: workout.name,
      sourceTemplateId: workout.id,
      steps,
      estimate: estimateBuilderWorkout(steps),
      warnings: [
        "Повторяем состав, а не прошлые рабочие веса. Сегодняшнюю нагрузку выбирай заново.",
      ],
    },
  };
}

export async function getSavedWorkoutPreview(owner: string, raw: unknown) {
  return getDb().transaction(async (tx) => {
    const [principal] = await tx
      .select({ status: user.status })
      .from(user)
      .where(eq(user.id, owner))
      .for("share");
    const [profile] = await tx.select().from(profiles).where(eq(profiles.userId, owner));
    if (principal?.status !== "active")
      throw new DomainError("ACCOUNT_UNAVAILABLE", 403, "Аккаунт недоступен.");
    if (!profile?.onboardingCompleted || !profile.adultConfirmed)
      throw new DomainError("ONBOARDING_REQUIRED", 409, "Сначала заполни профиль.");
    return readSavedSource(owner, raw, tx);
  });
}

export async function readStartSource(
  owner: string,
  input: StartInput,
  reader: Reader,
): Promise<{
  day: PlannerDay;
  config: Pick<PlannerConfig, "place" | "direction" | "intent">;
  revision?: number;
  rewardKind?: RewardKind;
}> {
  if ("source" in input) {
    const saved = await readSavedSource(owner, { source: input.source, id: input.id }, reader);
    if (saved.revision !== input.expectedSourceRevision)
      throw new DomainError(
        "REVISION_CONFLICT",
        409,
        "Состав изменился. Проверь тренировку ещё раз.",
      );
    return {
      day: saved.day,
      config: { place: saved.place, direction: saved.direction, intent: "maintain" },
      rewardKind: saved.rewardKind,
    };
  }
  const [program] = await reader
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
  const [latest] = await reader
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
      "План изменился. Обнови программу перед началом.",
    );
  const day = program.draft.days.find((candidate) => candidate.key === input.dayKey);
  if (!day) throw new DomainError("DAY_NOT_FOUND", 404, "День отсутствует в этой программе.");
  return { day, config: program.draft.config, revision: program.revision };
}
