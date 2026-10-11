import { createHash } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "../db";
import { profiles, user, workouts } from "../db/schema";
import { DomainError } from "./errors";
import { getProfile } from "./profile";

export const completeOnboardingInput = z
  .object({
    operationId: z.uuid(),
    companion: z.enum(["max", "lika"]),
    interests: z
      .array(z.enum(["strength", "home", "calisthenics", "yoga", "mobility", "fitness", "explore"]))
      .max(7)
      .refine((ids) => new Set(ids).size === ids.length),
    adultConfirmed: z.literal(true),
  })
  .strict();

/** Initial acquaintance is monotonic. Replaying artwork never resets an account or its trial. */
export async function completeOnboarding(userId: string, raw: unknown) {
  const input = completeOnboardingInput.parse(raw);
  const hash = createHash("sha256")
    .update(
      JSON.stringify({
        companion: input.companion,
        interests: [...input.interests].sort(),
        adultConfirmed: input.adultConfirmed,
      }),
    )
    .digest("hex");
  await getDb().transaction(async (tx) => {
    const [owner] = await tx
      .select({ status: user.status })
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
    if (!current) throw new DomainError("PROFILE_NOT_FOUND", 404, "Профиль ещё не создан.");
    if (
      current.onboardingOperationId === input.operationId &&
      current.onboardingPayloadHash !== hash
    )
      throw new DomainError(
        "IDEMPOTENCY_CONFLICT",
        409,
        "Это действие уже было использовано с другими параметрами.",
      );
    if (current.onboardingCompleted) return;
    const [ongoing] = await tx
      .select({ id: workouts.id })
      .from(workouts)
      .where(and(eq(workouts.userId, userId), sql`${workouts.status} in ('ready','active')`))
      .limit(1);
    if (ongoing && current.companion !== input.companion)
      throw new DomainError(
        "COMPANION_LOCKED",
        409,
        "Напарника можно сменить после завершения текущей тренировки.",
      );
    const discipline = input.interests.find((id) =>
      ["strength", "calisthenics", "yoga", "mobility"].includes(id),
    );
    await tx
      .update(profiles)
      .set({
        companion: input.companion,
        theme: input.companion === "lika" ? "rose" : "dark",
        onboardingInterests: input.interests,
        ...(discipline ? { discipline } : {}),
        adultConfirmed: true,
        onboardingCompleted: true,
        onboardingOperationId: input.operationId,
        onboardingPayloadHash: hash,
        revision: sql`${profiles.revision}+1`,
        updatedAt: new Date(),
      })
      .where(eq(profiles.userId, userId));
  });
  return getProfile(userId);
}
