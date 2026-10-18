import { z } from "zod";
import type {
  AssistantActionReply,
  AssistantHistory,
  AssistantReply,
} from "../../shared/assistant";
import type { CompanionId } from "../../shared/contracts";
import { DomainError } from "../domain/errors";
import { reserveAiReply, settleAiReply } from "../domain/trial";
import { applyWorkoutCommand } from "../domain/workouts";
import { authorizeAssistant, readAssistantContext } from "./context";
import { runAssistantEngine, type EngineResult } from "./engine";
import { ASSISTANT_POLICY_VERSION, preparedSafety } from "./policy";
import {
  ASSISTANT_DEADLINE_MS,
  ASSISTANT_MODEL,
  assistantEnabled,
  callProvider,
  type Provider,
} from "./provider";
import {
  admitAssistantTurn,
  attachAssistantReservation,
  failAssistantTurn,
  findAssistantAction,
  finishAssistantTurn,
  readAssistantMessages,
  assertAssistantTurnActive,
} from "./repository";
import { ASSISTANT_TOOLS, executeAssistantTool } from "./tools";
import { readChatHistory } from "./history";

export const assistantRequestInput = z.strictObject({
  operationId: z.uuid(),
  text: z.string().trim().min(1).max(2_000),
  expectedHistoryRevision: z.number().int().min(0).max(2147483646).optional(),
  companion: z.enum(["max", "lika"]).optional(),
});
export const assistantActionInput = z.strictObject({ proposalId: z.uuid(), operationId: z.uuid() });

export async function getAssistantHistory(
  ownerId: string,
  query: unknown = {},
): Promise<AssistantHistory> {
  return readChatHistory(ownerId, query, assistantEnabled());
}

export async function sendAssistantMessage(
  ownerId: string,
  raw: unknown,
  provider: Provider = callProvider,
): Promise<AssistantReply> {
  const input = assistantRequestInput.parse(raw);
  const localSafety = preparedSafety(input.text);
  const admission = await admitAssistantTurn(
    ownerId,
    input.operationId,
    input.text,
    localSafety !== null,
    { expectedHistoryRevision: input.expectedHistoryRevision, companion: input.companion },
  );
  if ("error" in admission) throw admission.error;
  if ("replay" in admission) return admission.replay;
  const turn = admission.turn;
  let reservationId: string | undefined;
  let recordedUsage: EngineResult<never>["usage"] = {
    calls: 0,
    promptTokens: 0,
    completionTokens: 0,
    totalTokens: 0,
    costHintRub: null,
  };
  let attempts = 0;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ASSISTANT_DEADLINE_MS);
  try {
    if (!localSafety && !assistantEnabled())
      throw new DomainError(
        "AI_NOT_CONNECTED",
        503,
        "Диалог с напарником пока недоступен. Занятие можно вести через карточки.",
      );
    if (!localSafety) {
      const reservation = await reserveAiReply(ownerId, input.operationId);
      reservationId = reservation.id;
      if (reservation.status !== "reserved")
        throw new DomainError(
          "AI_OPERATION_UNKNOWN",
          409,
          "Этот запрос уже использовал свой лимит. Отправь новый вопрос.",
        );
      if (!(await attachAssistantReservation(ownerId, input.operationId, reservation.id)))
        throw new DomainError(
          "AI_OPERATION_UNKNOWN",
          409,
          "Предыдущий ответ не удалось восстановить. Отправь новый вопрос.",
        );
    }
    const profile = localSafety ? {} : await readAssistantContext(ownerId);
    const history = localSafety
      ? []
      : await readAssistantMessages(ownerId, turn.companion as CompanionId, 4);
    const response = await runAssistantEngine({
      text: input.text,
      companion: turn.companion as CompanionId,
      history,
      profile,
      provider: async (request) => {
        await assertAssistantTurnActive(ownerId, input.operationId);
        attempts += 1;
        return provider(request);
      },
      signal: controller.signal,
      tools: ASSISTANT_TOOLS,
      executeTool: (call) => executeAssistantTool(ownerId, input.text, call),
      onUsage: (usage) => {
        recordedUsage = usage;
      },
    });
    if (controller.signal.aborted)
      throw new DomainError("AI_TIMEOUT", 504, "Напарник не успел ответить. Попробуй позже.");
    const reply: AssistantReply = {
      operationId: input.operationId,
      messages: [
        {
          id: `${input.operationId}:user`,
          operationId: input.operationId,
          companion: turn.companion as CompanionId,
          role: "user",
          text: input.text,
          createdAt: turn.createdAt.toISOString(),
        },
        {
          id: `${input.operationId}:assistant`,
          operationId: input.operationId,
          companion: turn.companion as CompanionId,
          role: "assistant",
          text: response.text,
          source: response.source,
          createdAt: new Date().toISOString(),
          ...(response.action ? { actions: [response.action] } : {}),
        },
      ],
    };
    return await finishAssistantTurn(ownerId, input.operationId, reply, response.useful, {
      ...response.usage,
      model: ASSISTANT_MODEL,
      policyVersion: ASSISTANT_POLICY_VERSION,
    });
  } catch (error) {
    const failure =
      error instanceof DomainError
        ? error
        : new DomainError(
            "AI_REQUEST_FAILED",
            503,
            "Ответ не удалось подготовить. Попробуй позже.",
          );
    try {
      if (reservationId) await settleAiReply(ownerId, reservationId, false);
      await failAssistantTurn(ownerId, input.operationId, failure, {
        ...recordedUsage,
        calls: attempts,
        costHintRub: null,
        model: ASSISTANT_MODEL,
        policyVersion: ASSISTANT_POLICY_VERSION,
      });
    } catch {
      /* The next owner-scoped admission releases an expired reservation. */
    }
    throw failure;
  } finally {
    clearTimeout(timer);
  }
}

export async function confirmAssistantAction(
  ownerId: string,
  raw: unknown,
): Promise<AssistantActionReply> {
  const input = assistantActionInput.parse(raw);
  await authorizeAssistant(ownerId);
  const proposal = await findAssistantAction(ownerId, input.proposalId);
  if (proposal.type !== "energy_estimate")
    throw new DomainError(
      "AI_ACTION_NOT_CONFIRMABLE",
      422,
      "Черновик программы нужно просмотреть и подтвердить в подборе.",
    );
  if (proposal.operationId !== input.operationId)
    throw new DomainError(
      "OPERATION_REUSED",
      409,
      "Для этого предложения используй исходное подтверждение.",
    );
  return applyWorkoutCommand(
    ownerId,
    proposal.workoutId,
    {
      operationId: proposal.operationId,
      expectedRevision: proposal.expectedRevision,
      command: { type: "estimate_energy", ...proposal.input },
    },
    async (tx) => {
      await findAssistantAction(ownerId, input.proposalId, tx);
    },
  );
}
