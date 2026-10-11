import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import type { AccountState, Profile, Progress } from "../../shared/contracts";
import { getDb } from "../db";
import {
  equipmentProfiles,
  profileResources,
  profiles,
  recordedSets,
  resourceTypes,
  trials,
  user,
  workouts,
  xpEvents,
} from "../db/schema";
import { DomainError } from "./errors";

export const profileInput = z
  .object({
    name: z.string().trim().min(1).max(80),
    interests: z
      .array(z.enum(["strength", "home", "calisthenics", "yoga", "mobility", "fitness", "explore"]))
      .max(7)
      .optional(),
    companion: z.enum(["max", "lika"]),
    theme: z.enum(["dark", "rose"]),
    goal: z.enum(["habit", "strength", "energy"]),
    experience: z.enum(["beginner", "returning", "regular"]),
    discipline: z.enum(["strength", "calisthenics", "mobility", "yoga"]),
    daysPerWeek: z.number().int().min(1).max(7),
    durationMinutes: z.number().int().min(5).max(180),
    location: z.enum(["home", "gym", "outdoor", "workout_park"]),
    equipment: z
      .array(
        z
          .object({ code: z.string().min(1).max(100), quantity: z.number().int().min(1).max(100) })
          .strict(),
      )
      .max(50)
      .refine((rows) => new Set(rows.map((r) => r.code)).size === rows.length, "Повтор ресурса"),
    timezone: z
      .string()
      .max(80)
      .refine((v) => {
        try {
          new Intl.DateTimeFormat("ru", { timeZone: v });
          return true;
        } catch {
          return false;
        }
      }),
    onboardingCompleted: z.boolean(),
    adultConfirmed: z.boolean(),
    remindersEnabled: z.boolean(),
    showWorkoutEnergy: z.boolean().optional(),
    trainingDays: z
      .array(z.number().int().min(0).max(6))
      .min(1)
      .max(7)
      .refine((v) => new Set(v).size === v.length),
    reminderTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  })
  .strict()
  .refine((p) => !p.onboardingCompleted || p.adultConfirmed, "Подтвердите совершеннолетие");
export async function initializeAccount(userId: string) {
  await getDb().transaction(async (tx) => {
    const [owner] = await tx.select().from(user).where(eq(user.id, userId)).for("update");
    if (!owner || owner.status !== "active")
      throw new DomainError("ACCOUNT_UNAVAILABLE", 403, "Аккаунт недоступен.");
    await tx.insert(profiles).values({ userId, displayName: owner.name }).onConflictDoNothing();
    await tx.insert(trials).values({ userId }).onConflictDoNothing();
  });
}
export const ensureAccount = initializeAccount;
type Reader = Pick<ReturnType<typeof getDb>, "select">;
export async function getProgress(userId: string, reader: Reader = getDb()): Promise<Progress> {
  const events = await reader.select().from(xpEvents).where(eq(xpEvents.userId, userId));
  const completed = await reader
    .select()
    .from(workouts)
    .where(
      and(
        eq(workouts.userId, userId),
        sql`${workouts.status} in ('completed','partial','aborted')`,
      ),
    )
    .orderBy(sql`${workouts.completedAt} desc`)
    .limit(50);
  const sets = await reader
    .select({ workoutId: recordedSets.workoutId })
    .from(recordedSets)
    .where(eq(recordedSets.userId, userId));
  return {
    xp: events.reduce((n, e) => n + e.amount, 0),
    completedWorkouts: Number(
      (
        await reader
          .select({ count: sql<number>`count(*)` })
          .from(workouts)
          .where(and(eq(workouts.userId, userId), eq(workouts.status, "completed")))
      )[0].count,
    ),
    history: completed.map((w) => ({
      id: w.id,
      title: w.name,
      status: w.status as Progress["history"][number]["status"],
      rewardKind: w.rewardKind as Progress["history"][number]["rewardKind"],
      ...(w.rewardDay ? { rewardDay: w.rewardDay } : {}),
      ...(w.energyEstimate ? { energyEstimate: w.energyEstimate } : {}),
      completedAt: w.completedAt!.toISOString(),
      sets: sets.filter((s) => s.workoutId === w.id).length,
      xp: events.filter((e) => e.workoutId === w.id).reduce((n, e) => n + e.amount, 0),
    })),
  };
}
export async function getProfile(userId: string): Promise<AccountState> {
  const db = getDb();
  const [p] = await db.select().from(profiles).where(eq(profiles.userId, userId));
  const [trial] = await db.select().from(trials).where(eq(trials.userId, userId));
  if (!p || !trial) throw new DomainError("PROFILE_NOT_FOUND", 404, "Профиль ещё не создан.");
  const resources = await db
    .select({ code: resourceTypes.code, quantity: profileResources.quantity })
    .from(profileResources)
    .innerJoin(resourceTypes, eq(resourceTypes.id, profileResources.resourceTypeId))
    .where(eq(profileResources.userId, userId));
  const profile: Profile = {
    name: p.displayName,
    interests: p.onboardingInterests,
    companion: p.companion as Profile["companion"],
    theme: p.theme as Profile["theme"],
    goal: p.goal as Profile["goal"],
    experience: p.experience as Profile["experience"],
    discipline: p.discipline as Profile["discipline"],
    daysPerWeek: p.weeklyDays,
    durationMinutes: p.defaultMinutes,
    location: p.location as Profile["location"],
    equipment: resources,
    timezone: p.timezone,
    trainingDays: p.trainingDays,
    reminderTime: p.reminderTime,
    onboardingCompleted: p.onboardingCompleted,
    adultConfirmed: p.adultConfirmed,
    remindersEnabled: p.remindersEnabled,
    showWorkoutEnergy: p.showWorkoutEnergy,
  };
  return {
    profile,
    trial: {
      startsAt: trial.startsAt.toISOString(),
      endsAt: trial.endsAt.toISOString(),
      replyLimit: trial.limit,
      repliesUsed: trial.used,
    },
    progress: await getProgress(userId),
  };
}
export async function updateProfile(userId: string, raw: unknown): Promise<AccountState> {
  const input = profileInput.parse(raw);
  await getDb().transaction(async (tx) => {
    const [owner] = await tx
      .select({ id: user.id, status: user.status })
      .from(user)
      .where(eq(user.id, userId))
      .for("update");
    if (owner?.status !== "active")
      throw new DomainError("ACCOUNT_UNAVAILABLE", 403, "Аккаунт недоступен.");
    const [current] = await tx
      .select()
      .from(profiles)
      .where(eq(profiles.userId, userId))
      .for("update");
    if (!current) throw new DomainError("PROFILE_NOT_FOUND", 404, "Профиль не найден.");
    if (current.onboardingCompleted && !input.adultConfirmed)
      throw new DomainError("ADULT_CONFIRMATION_REQUIRED", 400, "Подтвердите совершеннолетие.");
    if (current.companion !== input.companion) {
      const [ongoing] = await tx
        .select({ id: workouts.id })
        .from(workouts)
        .where(and(eq(workouts.userId, userId), sql`${workouts.status} in ('ready','active')`))
        .limit(1);
      if (ongoing)
        throw new DomainError(
          "COMPANION_LOCKED",
          409,
          "Напарника можно сменить после завершения текущей тренировки.",
        );
    }
    await tx
      .update(profiles)
      .set({
        displayName: input.name,
        ...(input.interests ? { onboardingInterests: [...new Set(input.interests)] } : {}),
        goal: input.goal,
        experience: input.experience,
        weeklyDays: input.daysPerWeek,
        defaultMinutes: input.durationMinutes,
        timezone: input.timezone,
        companion: input.companion,
        theme: input.theme,
        discipline: input.discipline,
        location: input.location,
        trainingDays: input.trainingDays,
        reminderTime: input.reminderTime,
        onboardingCompleted: current.onboardingCompleted || input.onboardingCompleted,
        adultConfirmed: input.adultConfirmed,
        remindersEnabled: input.remindersEnabled,
        ...(input.showWorkoutEnergy !== undefined
          ? { showWorkoutEnergy: input.showWorkoutEnergy }
          : {}),
        revision: sql`${profiles.revision}+1`,
        updatedAt: new Date(),
      })
      .where(eq(profiles.userId, userId));
    const [existing] = await tx
      .select()
      .from(equipmentProfiles)
      .where(eq(equipmentProfiles.userId, userId))
      .orderBy(equipmentProfiles.createdAt)
      .limit(1);
    const types = await tx.select().from(resourceTypes);
    const mapped = input.equipment.map((r) => {
      const type = types.find((t) => t.code === r.code);
      if (!type) throw new DomainError("UNKNOWN_RESOURCE", 400, "Ресурс отсутствует в каталоге.");
      return { userId, resourceTypeId: type.id, quantity: r.quantity };
    });
    const [saved] = existing
      ? await tx
          .update(equipmentProfiles)
          .set({
            name: "Основной инвентарь",
            place: input.location,
            revision: sql`${equipmentProfiles.revision}+1`,
            updatedAt: new Date(),
          })
          .where(and(eq(equipmentProfiles.id, existing.id), eq(equipmentProfiles.userId, userId)))
          .returning()
      : await tx
          .insert(equipmentProfiles)
          .values({ userId, name: "Основной инвентарь", place: input.location })
          .returning();
    await tx
      .delete(profileResources)
      .where(
        and(eq(profileResources.userId, userId), eq(profileResources.equipmentProfileId, saved.id)),
      );
    if (mapped.length)
      await tx
        .insert(profileResources)
        .values(mapped.map((r) => ({ ...r, equipmentProfileId: saved.id })));
  });
  return getProfile(userId);
}
