import type { AssistantChatMessage } from "@/shared/assistant";

/** Only an explicit retry sends this draft again. It is never an offline queue. */
export interface PendingAssistantOperation {
  owner: string;
  operationId: string;
  text: string;
  createdAt: string;
}

export const PENDING_ASSISTANT_KEY = "miron:assistant:pending:v1";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function readPendingAssistant(
  storage: Pick<Storage, "getItem" | "removeItem">,
  owner: string,
): PendingAssistantOperation | null {
  try {
    const value: unknown = JSON.parse(storage.getItem(PENDING_ASSISTANT_KEY) ?? "null");
    if (typeof value !== "object" || value === null) return null;
    const pending = value as Record<string, unknown>;
    if (
      pending.owner !== owner ||
      !owner.startsWith("user:") ||
      typeof pending.operationId !== "string" ||
      !UUID.test(pending.operationId) ||
      typeof pending.text !== "string" ||
      !pending.text.trim() ||
      pending.text.length > 2000 ||
      typeof pending.createdAt !== "string" ||
      !Number.isFinite(Date.parse(pending.createdAt))
    ) {
      storage.removeItem(PENDING_ASSISTANT_KEY);
      return null;
    }
    return {
      owner,
      operationId: pending.operationId,
      text: pending.text,
      createdAt: pending.createdAt,
    };
  } catch {
    // A blocked storage API must not prevent online chat in this tab.
    return null;
  }
}

export function pendingAssistantMessage(pending: PendingAssistantOperation): AssistantChatMessage {
  return {
    id: pending.operationId,
    operationId: pending.operationId,
    role: "user",
    text: pending.text,
    createdAt: pending.createdAt,
  };
}

/** Optimistic ID equals operationId, so recovery replaces the draft exactly once. */
export function mergeAssistantMessages(
  current: AssistantChatMessage[],
  confirmed: AssistantChatMessage[],
  operationId?: string,
): AssistantChatMessage[] {
  const messages = new Map<string, AssistantChatMessage>();
  const confirmedTurns = new Set(
    confirmed
      .filter((message) => message.operationId)
      .map((message) => `${message.operationId}:${message.role}`),
  );
  for (const message of current) {
    if (message.id !== operationId && !confirmedTurns.has(`${message.operationId}:${message.role}`))
      messages.set(message.id, message);
  }
  for (const message of confirmed) messages.set(message.id, message);
  return [...messages.values()]
    .sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt))
    .slice(-100);
}
