import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "../db";
import { aiReservations, trials } from "../db/schema";
import { DomainError } from "./errors";

export function quotaAvailable(
  trial: { startsAt: Date; endsAt: Date; limit: number; used: number; reserved: number },
  now = new Date(),
) {
  return now >= trial.startsAt && now < trial.endsAt && trial.used + trial.reserved < trial.limit;
}
export async function reserveAiReply(userId: string, operationId: string) {
  z.string().uuid().parse(operationId);
  return getDb().transaction(async (tx) => {
    const [trial] = await tx.select().from(trials).where(eq(trials.userId, userId)).for("update");
    if (!trial) throw new DomainError("TRIAL_NOT_STARTED", 403, "Пробный период недоступен.");
    const clock = await tx.execute<{ now: Date }>(sql`select now() as now`);
    const now = new Date(clock.rows[0].now);
    const expired = await tx
      .update(aiReservations)
      .set({ status: "released" })
      .where(
        and(
          eq(aiReservations.userId, userId),
          eq(aiReservations.status, "reserved"),
          sql`${aiReservations.expiresAt}<=${now}`,
        ),
      )
      .returning();
    if (expired.length) {
      trial.reserved -= expired.length;
      await tx.update(trials).set({ reserved: trial.reserved }).where(eq(trials.userId, userId));
    }
    const [existing] = await tx
      .select()
      .from(aiReservations)
      .where(and(eq(aiReservations.userId, userId), eq(aiReservations.operationId, operationId)));
    if (existing)
      return {
        id: existing.id,
        status: existing.status,
        expiresAt: existing.expiresAt.toISOString(),
        replayed: true,
      };
    if (!quotaAvailable(trial, now))
      throw new DomainError(
        "AI_LIMIT_REACHED",
        403,
        "Пробный период закончился или исчерпан лимит ответов.",
      );
    await tx
      .update(trials)
      .set({ reserved: sql`${trials.reserved}+1` })
      .where(eq(trials.userId, userId));
    const [reservation] = await tx
      .insert(aiReservations)
      .values({ userId, operationId })
      .returning();
    return {
      id: reservation.id,
      status: reservation.status,
      expiresAt: reservation.expiresAt.toISOString(),
      replayed: false,
    };
  });
}
// Only the server gateway calls settlement after a successful provider reply.
type TrialTransaction = Parameters<Parameters<ReturnType<typeof getDb>["transaction"]>[0]>[0];
export async function settleAiReply(
  userId: string,
  reservationId: string,
  success: boolean,
  transaction?: TrialTransaction,
) {
  z.string().uuid().parse(reservationId);
  const settle = async (tx: TrialTransaction) => {
    const [trial] = await tx.select().from(trials).where(eq(trials.userId, userId)).for("update");
    if (!trial) throw new DomainError("TRIAL_NOT_FOUND", 404, "Пробный период не найден.");
    const [reservation] = await tx
      .select()
      .from(aiReservations)
      .where(and(eq(aiReservations.userId, userId), eq(aiReservations.id, reservationId)));
    if (!reservation) throw new DomainError("RESERVATION_NOT_FOUND", 404, "Запрос не найден.");
    if (reservation.status !== "reserved") return { status: reservation.status, replayed: true };
    const result = await tx.execute<{ now: Date }>(sql`select now() as now`);
    const now = new Date(result.rows[0].now);
    const consume = success && now < reservation.expiresAt && now < trial.endsAt;
    await tx
      .update(trials)
      .set({
        reserved: sql`${trials.reserved}-1`,
        used: consume ? sql`${trials.used}+1` : trials.used,
      })
      .where(eq(trials.userId, userId));
    const status = consume ? "consumed" : "released";
    await tx
      .update(aiReservations)
      .set({ status })
      .where(and(eq(aiReservations.userId, userId), eq(aiReservations.id, reservationId)));
    return { status, replayed: false };
  };
  return transaction ? settle(transaction) : getDb().transaction(settle);
}
