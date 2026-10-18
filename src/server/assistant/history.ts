import { createHash } from "node:crypto";
import { and, desc, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { z } from "zod";
import type {
  AssistantChatMessage,
  AssistantHistory,
  AssistantHistoryMutation,
  AssistantHistoryReceipt,
} from "../../shared/assistant";
import type { CompanionId } from "../../shared/contracts";
import { getDb } from "../db";
import {
  assistantConversations,
  assistantHistoryCommands,
  assistantTurns,
  profiles,
  workoutCommands,
} from "../db/schema";
import { DomainError } from "../domain/errors";
import { settleAiReply } from "../domain/trial";
import { assistantOwnerTransaction, type AssistantTransaction } from "./transaction";

const companion = z.enum(["max", "lika"]);
const revision = z.number().int().min(0).max(2147483646);
export const assistantHistoryQuery = z.strictObject({
  companion: companion.optional(),
  before: z.string().min(1).max(512).optional(),
  pendingOperationId: z.uuid().optional(),
});
export const assistantHistoryMutationInput = z.strictObject({
  operationId: z.uuid(),
  companion,
  expectedRevision: revision,
  action: z.discriminatedUnion("type", [
    z.strictObject({
      type: z.literal("delete_message"),
      turnId: z.uuid(),
      role: z.enum(["user", "assistant"]),
    }),
    z.strictObject({ type: z.literal("delete_turn"), turnId: z.uuid() }),
    z.strictObject({ type: z.literal("clear") }),
  ]),
});
const cursorInput = z.strictObject({
  at: z
    .string()
    .max(35)
    .refine(
      (value) =>
        /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/.test(value) &&
        Number.isFinite(Date.parse(value)),
    ),
  id: z.uuid(),
  revision,
  companion,
});
const PAGE_SIZE = 25;
const REDACTED = "[удалено]";

/** Called only while holding the account lock. */
export async function chatRevision(
  tx: AssistantTransaction,
  ownerId: string,
  persona: CompanionId,
): Promise<number> {
  await tx
    .insert(assistantConversations)
    .values({ userId: ownerId, companion: persona })
    .onConflictDoNothing();
  const [row] = await tx
    .select({ revision: assistantConversations.revision })
    .from(assistantConversations)
    .where(
      and(
        eq(assistantConversations.userId, ownerId),
        eq(assistantConversations.companion, persona),
      ),
    );
  return row.revision;
}
export async function advanceChatRevision(
  tx: AssistantTransaction,
  ownerId: string,
  persona: CompanionId,
): Promise<number> {
  await chatRevision(tx, ownerId, persona);
  const [row] = await tx
    .update(assistantConversations)
    .set({ revision: sql`${assistantConversations.revision} + 1`, updatedAt: new Date() })
    .where(
      and(
        eq(assistantConversations.userId, ownerId),
        eq(assistantConversations.companion, persona),
      ),
    )
    .returning({ revision: assistantConversations.revision });
  return row.revision;
}
async function requireChatProfile(tx: AssistantTransaction, ownerId: string) {
  const [profile] = await tx
    .select({
      companion: profiles.companion,
      adult: profiles.adultConfirmed,
      completed: profiles.onboardingCompleted,
    })
    .from(profiles)
    .where(eq(profiles.userId, ownerId));
  if (!profile?.adult || !profile.completed)
    throw new DomainError(
      "ADULT_CONFIRMATION_REQUIRED",
      403,
      "Сначала заверши знакомство и подтверди возраст 18+.",
    );
  return profile;
}

export async function markConfirmedChatActions(
  ownerId: string,
  messages: AssistantChatMessage[],
  reader: Pick<ReturnType<typeof getDb>, "select"> = getDb(),
) {
  const proposals = messages
    .flatMap((message) => message.actions ?? [])
    .filter((action) => action.type === "energy_estimate");
  if (!proposals.length) return messages;
  const confirmed = await reader
    .select({ operationId: workoutCommands.operationId, workoutId: workoutCommands.workoutId })
    .from(workoutCommands)
    .where(
      and(
        eq(workoutCommands.userId, ownerId),
        inArray(
          workoutCommands.operationId,
          proposals.map((action) => action.operationId),
        ),
      ),
    );
  return messages.map((message) => ({
    ...message,
    ...(message.actions
      ? {
          actions: message.actions.map((action) =>
            action.type === "energy_estimate" &&
            confirmed.some(
              (command) =>
                command.operationId === action.operationId &&
                command.workoutId === action.workoutId,
            )
              ? { ...action, confirmed: true }
              : action,
          ),
        }
      : {}),
  }));
}

export async function readChatHistory(
  ownerId: string,
  raw: unknown,
  enabled: boolean,
): Promise<AssistantHistory> {
  const query = assistantHistoryQuery.parse(raw);
  let cursor: z.infer<typeof cursorInput> | undefined;
  if (query.before) {
    try {
      cursor = cursorInput.parse(
        JSON.parse(Buffer.from(query.before, "base64url").toString("utf8")),
      );
    } catch {
      throw new DomainError(
        "INVALID_CHAT_CURSOR",
        400,
        "Не удалось открыть эту часть истории. Обнови разговор.",
      );
    }
  }
  return assistantOwnerTransaction(ownerId, async (tx) => {
    const profile = await requireChatProfile(tx, ownerId);
    const persona = query.companion ?? companion.parse(profile.companion);
    const currentRevision = await chatRevision(tx, ownerId, persona);
    const [reset] = await tx
      .select({
        revision: sql<number>`coalesce(max((${assistantHistoryCommands.result}->>'revision')::integer), 0)::integer`,
      })
      .from(assistantHistoryCommands)
      .where(
        and(
          eq(assistantHistoryCommands.userId, ownerId),
          sql`${assistantHistoryCommands.result}->>'companion' = ${persona}`,
        ),
      );
    const resetRevision = reset.revision;
    if (cursor && (cursor.companion !== persona || cursor.revision !== resetRevision))
      throw new DomainError(
        "AI_HISTORY_CHANGED",
        409,
        "Разговор изменился. Обнови историю перед загрузкой старых сообщений.",
      );
    const rows = await tx
      .select({
        id: assistantTurns.operationId,
        createdAt: assistantTurns.createdAt,
        text: assistantTurns.text,
        status: assistantTurns.status,
        leaseExpiresAt: assistantTurns.leaseExpiresAt,
        cursorAt: sql<string>`to_char(${assistantTurns.createdAt} at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`,
        result: assistantTurns.result,
      })
      .from(assistantTurns)
      .where(
        and(
          eq(assistantTurns.userId, ownerId),
          eq(assistantTurns.companion, persona),
          or(
            and(
              eq(assistantTurns.status, "completed"),
              sql`jsonb_array_length(coalesce(${assistantTurns.result}->'messages', '[]'::jsonb)) > 0`,
            ),
            and(
              inArray(assistantTurns.status, ["running", "failed", "unknown"]),
              isNull(assistantTurns.userDeletedAt),
            ),
          ),
          cursor
            ? sql`(${assistantTurns.createdAt}, ${assistantTurns.operationId}) < (${cursor.at}::timestamptz, ${cursor.id}::uuid)`
            : undefined,
        ),
      )
      .orderBy(desc(assistantTurns.createdAt), desc(assistantTurns.operationId))
      .limit(PAGE_SIZE + 1);
    const page = rows.slice(0, PAGE_SIZE);
    const oldest = page.at(-1);
    const nextCursor =
      rows.length > PAGE_SIZE && oldest
        ? Buffer.from(
            JSON.stringify({
              at: oldest.cursorAt,
              id: oldest.id,
              revision: resetRevision,
              companion: persona,
            }),
          ).toString("base64url")
        : null;
    let pending: AssistantHistory["pending"];
    if (query.pendingOperationId) {
      const [turn] = await tx
        .select({
          status: assistantTurns.status,
          leaseExpiresAt: assistantTurns.leaseExpiresAt,
          userDeletedAt: assistantTurns.userDeletedAt,
          assistantDeletedAt: assistantTurns.assistantDeletedAt,
        })
        .from(assistantTurns)
        .where(
          and(
            eq(assistantTurns.userId, ownerId),
            eq(assistantTurns.companion, persona),
            eq(assistantTurns.operationId, query.pendingOperationId),
          ),
        );
      pending = {
        operationId: query.pendingOperationId,
        state: !turn
          ? "absent"
          : turn.userDeletedAt || turn.assistantDeletedAt
            ? "removed"
            : turn.status === "running" && turn.leaseExpiresAt > new Date()
              ? "running"
              : turn.status === "completed"
                ? "completed"
                : "failed",
      };
    }
    const messages = await markConfirmedChatActions(
      ownerId,
      page.reverse().flatMap((turn): AssistantChatMessage[] =>
        turn.status === "completed"
          ? (turn.result?.messages ?? [])
          : [
              {
                id: `${turn.id}:user`,
                operationId: turn.id,
                companion: persona,
                role: "user",
                text: turn.text,
                createdAt: turn.createdAt.toISOString(),
                replyState:
                  turn.status === "running" && turn.leaseExpiresAt > new Date()
                    ? "pending"
                    : "failed",
              },
            ],
      ),
      tx,
    );
    return {
      enabled,
      companion: persona,
      revision: currentRevision,
      resetRevision,
      nextCursor,
      messages,
      ...(pending ? { pending } : {}),
    };
  });
}

/** A mutation invalidates in-flight generation using the old context; it cannot republish deleted text. */
async function retireRunning(
  tx: AssistantTransaction,
  ownerId: string,
  persona: CompanionId,
  now: Date,
) {
  const running = await tx
    .select()
    .from(assistantTurns)
    .where(
      and(
        eq(assistantTurns.userId, ownerId),
        eq(assistantTurns.companion, persona),
        eq(assistantTurns.status, "running"),
      ),
    );
  for (const turn of running)
    if (turn.reservationId) await settleAiReply(ownerId, turn.reservationId, false, tx);
  if (running.length)
    await tx
      .update(assistantTurns)
      .set({
        status: "unknown",
        text: REDACTED,
        result: null,
        userDeletedAt: now,
        assistantDeletedAt: now,
        errorCode: "AI_HISTORY_CHANGED",
        errorStatus: 409,
        finishedAt: now,
      })
      .where(
        and(
          eq(assistantTurns.userId, ownerId),
          eq(assistantTurns.companion, persona),
          eq(assistantTurns.status, "running"),
        ),
      );
}

export async function mutateChatHistory(
  ownerId: string,
  raw: unknown,
): Promise<AssistantHistoryReceipt> {
  const input: AssistantHistoryMutation = assistantHistoryMutationInput.parse(raw);
  const hash = createHash("sha256").update(JSON.stringify(input)).digest("hex");
  return assistantOwnerTransaction(ownerId, async (tx) => {
    await requireChatProfile(tx, ownerId);
    const [saved] = await tx
      .select()
      .from(assistantHistoryCommands)
      .where(
        and(
          eq(assistantHistoryCommands.userId, ownerId),
          eq(assistantHistoryCommands.operationId, input.operationId),
        ),
      );
    if (saved) {
      if (saved.payloadHash !== hash)
        throw new DomainError(
          "OPERATION_REUSED",
          409,
          "Этот запрос уже использован для другого удаления.",
        );
      return saved.result;
    }
    const currentRevision = await chatRevision(tx, ownerId, input.companion);
    if (currentRevision !== input.expectedRevision)
      throw new DomainError(
        "AI_HISTORY_CHANGED",
        409,
        "Разговор изменился на другом устройстве. Обнови его и повтори удаление.",
      );
    const now = new Date();
    if (input.action.type === "clear") {
      await retireRunning(tx, ownerId, input.companion, now);
      await tx
        .update(assistantTurns)
        .set({
          text: REDACTED,
          userDeletedAt: now,
          assistantDeletedAt: now,
          result: sql`case when ${assistantTurns.status} = 'completed' then jsonb_build_object('operationId', ${assistantTurns.operationId}, 'messages', '[]'::jsonb) else null end`,
        })
        .where(
          and(eq(assistantTurns.userId, ownerId), eq(assistantTurns.companion, input.companion)),
        );
    } else {
      const [turn] = await tx
        .select()
        .from(assistantTurns)
        .where(
          and(
            eq(assistantTurns.userId, ownerId),
            eq(assistantTurns.companion, input.companion),
            eq(assistantTurns.operationId, input.action.turnId),
          ),
        );
      const both = input.action.type === "delete_turn";
      const removeUser = input.action.type === "delete_turn" || input.action.role === "user";
      const removeAssistant =
        input.action.type === "delete_turn" || input.action.role === "assistant";
      if (
        !turn ||
        (both
          ? turn.userDeletedAt && turn.assistantDeletedAt
          : removeUser
            ? turn.userDeletedAt
            : turn.assistantDeletedAt)
      )
        throw new DomainError(
          "AI_MESSAGE_NOT_FOUND",
          404,
          "Сообщение не найдено в этом разговоре.",
        );
      await retireRunning(tx, ownerId, input.companion, now);
      if (turn.status !== "running")
        await tx
          .update(assistantTurns)
          .set({
            ...(removeUser ? { text: REDACTED, userDeletedAt: now } : {}),
            ...(removeAssistant ? { assistantDeletedAt: now } : {}),
            result: turn.result
              ? {
                  operationId: turn.operationId,
                  messages: turn.result.messages
                    .filter(
                      (message) =>
                        !(removeUser && message.role === "user") &&
                        !(removeAssistant && message.role === "assistant"),
                    )
                    .map((message) => {
                      if (!removeUser) return message;
                      const { actions: removedActions, ...remaining } = message;
                      void removedActions;
                      return remaining;
                    }),
                }
              : null,
          })
          .where(
            and(
              eq(assistantTurns.userId, ownerId),
              eq(assistantTurns.operationId, turn.operationId),
            ),
          );
    }
    const receipt: AssistantHistoryReceipt = {
      operationId: input.operationId,
      companion: input.companion,
      revision: await advanceChatRevision(tx, ownerId, input.companion),
    };
    await tx.insert(assistantHistoryCommands).values({
      userId: ownerId,
      operationId: input.operationId,
      payloadHash: hash,
      result: receipt,
    });
    return receipt;
  });
}
