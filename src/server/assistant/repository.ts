import { createHash } from "node:crypto";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import type { AssistantAction, AssistantChatMessage, AssistantReply } from "../../shared/assistant";
import type { CompanionId } from "../../shared/contracts";
import { getDb } from "../db";
import { assistantTurns, profiles, user } from "../db/schema";
import { DomainError } from "../domain/errors";
import { settleAiReply } from "../domain/trial";
import {
  assistantOwnerTransaction as ownerTransaction,
  type AssistantTransaction as Transaction,
} from "./transaction";
import { chatRevision, advanceChatRevision, markConfirmedChatActions } from "./history";

const LEASE_MS = 90_000;
export function assistantDailyIntentLimit(): number {
  const parsed = z.coerce
    .number()
    .int()
    .min(1)
    .max(10_000)
    .safeParse(process.env.AI_DAILY_INTENT_LIMIT ?? "200");
  if (!parsed.success)
    throw new DomainError("AI_CONFIGURATION_INVALID", 503, "Диалог с напарником пока недоступен.");
  return parsed.data;
}
type Turn = typeof assistantTurns.$inferSelect;
export type Admission = { replay: AssistantReply } | { turn: Turn } | { error: DomainError };

export function assistantPayloadHash(text: string) {
  return createHash("sha256").update(JSON.stringify({ text })).digest("hex");
}

function stateError(turn: Turn) {
  if (turn.status === "running")
    return new DomainError(
      "AI_OPERATION_PENDING",
      409,
      "Ответ ещё готовится. Повтори проверку этого сообщения.",
    );
  if (turn.status === "unknown")
    return new DomainError(
      "AI_OPERATION_UNKNOWN",
      409,
      "Предыдущий ответ не удалось восстановить. Тренировка не изменялась; можешь отправить новый вопрос.",
    );
  return new DomainError(
    turn.errorCode ?? "AI_REQUEST_FAILED",
    turn.errorStatus ?? 503,
    "Этот ответ не удалось подготовить. Можешь отправить вопрос заново.",
  );
}

async function expireTurn(tx: Transaction, ownerId: string, turn: Turn, now: Date) {
  if (turn.reservationId) await settleAiReply(ownerId, turn.reservationId, false, tx);
  await tx
    .update(assistantTurns)
    .set({
      status: "unknown",
      errorCode: "AI_OPERATION_UNKNOWN",
      errorStatus: 409,
      finishedAt: now,
    })
    .where(
      and(
        eq(assistantTurns.userId, ownerId),
        eq(assistantTurns.operationId, turn.operationId),
        eq(assistantTurns.status, "running"),
      ),
    );
  await advanceChatRevision(tx, ownerId, turn.companion as CompanionId);
}

export async function admitAssistantTurn(
  ownerId: string,
  operationId: string,
  text: string,
  allowPreparedSafety = false,
  context?: { expectedHistoryRevision?: number; companion?: CompanionId },
): Promise<Admission> {
  const hash = assistantPayloadHash(text);
  return ownerTransaction(ownerId, async (tx): Promise<Admission> => {
    const clock = await tx.execute<{ now: Date }>(sql`select now() as now`);
    const now = new Date(clock.rows[0].now);
    const [existing] = await tx
      .select()
      .from(assistantTurns)
      .where(and(eq(assistantTurns.userId, ownerId), eq(assistantTurns.operationId, operationId)));
    if (existing) {
      if (existing.payloadHash !== hash)
        throw new DomainError(
          "OPERATION_REUSED",
          409,
          "Идентификатор сообщения уже использован для другого текста.",
        );
      if (existing.userDeletedAt || existing.assistantDeletedAt)
        return {
          error: new DomainError(
            "AI_MESSAGE_REMOVED",
            410,
            "Это сообщение удалено из разговора. Отправь новый вопрос.",
          ),
        };
      if (context?.companion && existing.companion !== context.companion)
        return {
          error: new DomainError(
            "AI_COMPANION_CHANGED",
            409,
            "Напарник изменился. Открой его разговор заново.",
          ),
        };
      if (existing.status === "completed" && existing.result) return { replay: existing.result };
      if (existing.status === "running" && existing.leaseExpiresAt <= now) {
        await expireTurn(tx, ownerId, existing, now);
        return { error: stateError({ ...existing, status: "unknown" }) };
      }
      return { error: stateError(existing) };
    }
    const running = await tx
      .select()
      .from(assistantTurns)
      .where(and(eq(assistantTurns.userId, ownerId), eq(assistantTurns.status, "running")))
      .limit(8);
    for (const turn of running) {
      if (turn.leaseExpiresAt > now && !allowPreparedSafety)
        return {
          error: new DomainError(
            "AI_BUSY",
            409,
            "Напарник уже отвечает на другое сообщение. Дождись ответа.",
          ),
        };
      if (turn.leaseExpiresAt <= now) await expireTurn(tx, ownerId, turn, now);
    }
    const [profile] = await tx
      .select({
        companion: profiles.companion,
        adultConfirmed: profiles.adultConfirmed,
        completed: profiles.onboardingCompleted,
      })
      .from(profiles)
      .where(eq(profiles.userId, ownerId));
    if (!profile) throw new DomainError("PROFILE_NOT_FOUND", 404, "Профиль ещё не создан.");
    if (context?.companion && profile.companion !== context.companion)
      throw new DomainError(
        "AI_COMPANION_CHANGED",
        409,
        "Напарник изменился. Открой разговор заново.",
      );
    const revision = await chatRevision(tx, ownerId, profile.companion as CompanionId);
    if (
      context?.expectedHistoryRevision !== undefined &&
      context.expectedHistoryRevision !== revision
    )
      throw new DomainError(
        "AI_HISTORY_CHANGED",
        409,
        "Разговор изменился на другом устройстве. Обнови историю и отправь вопрос ещё раз.",
      );
    if (!allowPreparedSafety && (!profile.adultConfirmed || !profile.completed))
      throw new DomainError(
        "ADULT_CONFIRMATION_REQUIRED",
        403,
        "Сначала заверши знакомство и подтверди возраст 18+.",
      );
    const [recent] = await tx
      .select({ count: sql<number>`count(*)::int` })
      .from(assistantTurns)
      .where(
        and(
          eq(assistantTurns.userId, ownerId),
          sql`${assistantTurns.createdAt} > ${now}::timestamptz - interval '1 minute'`,
        ),
      );
    if (recent.count >= 6)
      return {
        error: new DomainError(
          "AI_RATE_LIMIT",
          429,
          "Сообщения отправляются слишком часто. Подожди немного.",
        ),
      };
    if (!allowPreparedSafety) {
      const limit = assistantDailyIntentLimit();
      // The global budget lock exists only within this short database admission,
      // never while waiting for the provider. Counts include failed/unknown turns.
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtextextended('miron:assistant:daily-budget', 0))`,
      );
      const [daily] = await tx
        .select({ count: sql<number>`count(*)::int` })
        .from(assistantTurns)
        .where(
          and(
            eq(assistantTurns.providerAdmitted, true),
            sql`${assistantTurns.createdAt} >= (date_trunc('day', ${now}::timestamptz at time zone 'Europe/Moscow') at time zone 'Europe/Moscow')`,
            sql`${assistantTurns.createdAt} < ((date_trunc('day', ${now}::timestamptz at time zone 'Europe/Moscow') + interval '1 day') at time zone 'Europe/Moscow')`,
          ),
        );
      if (daily.count >= limit)
        return {
          error: new DomainError(
            "AI_DAILY_LIMIT",
            429,
            "Сегодня достигнут общий лимит beta-диалога. Продолжить занятие можно через карточки; чат станет доступен в новый день.",
          ),
        };
    }
    const [turn] = await tx
      .insert(assistantTurns)
      .values({
        userId: ownerId,
        operationId,
        text,
        payloadHash: hash,
        companion: profile.companion,
        providerAdmitted: !allowPreparedSafety,
        leaseExpiresAt: new Date(now.getTime() + LEASE_MS),
      })
      .returning();
    await advanceChatRevision(tx, ownerId, profile.companion as CompanionId);
    return { turn };
  });
}

export async function attachAssistantReservation(
  ownerId: string,
  operationId: string,
  reservationId: string,
) {
  return ownerTransaction(ownerId, async (tx) => {
    const updated = await tx
      .update(assistantTurns)
      .set({ reservationId })
      .where(
        and(
          eq(assistantTurns.userId, ownerId),
          eq(assistantTurns.operationId, operationId),
          eq(assistantTurns.status, "running"),
        ),
      )
      .returning();
    if (!updated.length) {
      await settleAiReply(ownerId, reservationId, false, tx);
      return false;
    }
    return true;
  });
}

export async function finishAssistantTurn(
  ownerId: string,
  operationId: string,
  result: AssistantReply,
  useful: boolean,
  usage: NonNullable<Turn["usage"]>,
): Promise<AssistantReply> {
  const outcome = await ownerTransaction(ownerId, async (tx) => {
    const [turn] = await tx
      .select()
      .from(assistantTurns)
      .where(and(eq(assistantTurns.userId, ownerId), eq(assistantTurns.operationId, operationId)));
    if (!turn) throw new DomainError("AI_OPERATION_NOT_FOUND", 404, "Сообщение не найдено.");
    if (turn.userDeletedAt || turn.assistantDeletedAt)
      return {
        error: new DomainError(
          "AI_MESSAGE_REMOVED",
          410,
          "Этот запрос удалён. Ответ не добавлен в разговор.",
        ),
      };
    if (turn.status === "completed" && turn.result) return { result: turn.result };
    const clock = await tx.execute<{ now: Date }>(sql`select now() as now`);
    const now = new Date(clock.rows[0].now);
    if (turn.status !== "running") return { error: stateError(turn) };
    if (turn.leaseExpiresAt <= now) {
      await expireTurn(tx, ownerId, turn, now);
      return { error: stateError({ ...turn, status: "unknown" }) };
    }
    if (turn.reservationId) await settleAiReply(ownerId, turn.reservationId, useful, tx);
    const historyRevision = await advanceChatRevision(tx, ownerId, turn.companion as CompanionId);
    result = { ...result, historyRevision };
    await tx
      .update(assistantTurns)
      .set({ status: "completed", result, usage, finishedAt: now })
      .where(and(eq(assistantTurns.userId, ownerId), eq(assistantTurns.operationId, operationId)));
    return { result };
  });
  if (outcome.error) throw outcome.error;
  return outcome.result;
}

export async function failAssistantTurn(
  ownerId: string,
  operationId: string,
  error: DomainError,
  usage?: NonNullable<Turn["usage"]>,
) {
  await ownerTransaction(ownerId, async (tx) => {
    const [turn] = await tx
      .select()
      .from(assistantTurns)
      .where(and(eq(assistantTurns.userId, ownerId), eq(assistantTurns.operationId, operationId)));
    if (!turn) return;
    if (turn.status !== "running") {
      if (usage && turn.status === "unknown" && (turn.userDeletedAt || turn.assistantDeletedAt))
        await tx
          .update(assistantTurns)
          .set({ usage })
          .where(
            and(eq(assistantTurns.userId, ownerId), eq(assistantTurns.operationId, operationId)),
          );
      return;
    }
    if (turn.reservationId) await settleAiReply(ownerId, turn.reservationId, false, tx);
    await tx
      .update(assistantTurns)
      .set({
        status: "failed",
        errorCode: error.code,
        errorStatus: error.status,
        ...(usage ? { usage } : {}),
        finishedAt: new Date(),
      })
      .where(and(eq(assistantTurns.userId, ownerId), eq(assistantTurns.operationId, operationId)));
    await advanceChatRevision(tx, ownerId, turn.companion as CompanionId);
  });
}

export async function assertAssistantTurnActive(ownerId: string, operationId: string) {
  const [turn] = await getDb()
    .select({ turn: assistantTurns, active: user.status })
    .from(assistantTurns)
    .innerJoin(user, eq(user.id, assistantTurns.userId))
    .where(and(eq(assistantTurns.userId, ownerId), eq(assistantTurns.operationId, operationId)));
  if (!turn || turn.active !== "active")
    throw new DomainError("ACCOUNT_UNAVAILABLE", 403, "Аккаунт недоступен.");
  if (turn.turn.userDeletedAt || turn.turn.assistantDeletedAt)
    throw new DomainError(
      "AI_MESSAGE_REMOVED",
      410,
      "Запрос удалён из разговора; подготовка ответа остановлена.",
    );
  if (turn.turn.status !== "running") throw stateError(turn.turn);
}

export async function readAssistantMessages(
  ownerId: string,
  companion: CompanionId,
  limit = 25,
): Promise<AssistantChatMessage[]> {
  const turns = await getDb()
    .select({ result: assistantTurns.result })
    .from(assistantTurns)
    .where(
      and(
        eq(assistantTurns.userId, ownerId),
        eq(assistantTurns.companion, companion),
        eq(assistantTurns.status, "completed"),
        isNull(assistantTurns.userDeletedAt),
        isNull(assistantTurns.assistantDeletedAt),
      ),
    )
    .orderBy(desc(assistantTurns.createdAt), desc(assistantTurns.operationId))
    .limit(limit);
  const messages = turns.reverse().flatMap((turn) => turn.result?.messages ?? []);
  return markConfirmedChatActions(ownerId, messages);
}

export async function findAssistantAction(
  ownerId: string,
  proposalId: string,
  reader: Pick<ReturnType<typeof getDb>, "select"> = getDb(),
): Promise<AssistantAction> {
  const [turn] = await reader
    .select({ result: assistantTurns.result })
    .from(assistantTurns)
    .where(
      and(
        eq(assistantTurns.userId, ownerId),
        eq(assistantTurns.status, "completed"),
        isNull(assistantTurns.userDeletedAt),
        isNull(assistantTurns.assistantDeletedAt),
        sql`${assistantTurns.result} @> ${JSON.stringify({ messages: [{ actions: [{ id: proposalId }] }] })}::jsonb`,
      ),
    )
    .limit(1);
  const action = turn?.result?.messages
    .flatMap((message) => message.actions ?? [])
    .find((item) => item.id === proposalId);
  if (!action)
    throw new DomainError("AI_PROPOSAL_NOT_FOUND", 404, "Предложение не найдено в твоём чате.");
  return action;
}
