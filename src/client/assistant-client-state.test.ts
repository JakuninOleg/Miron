import { describe, expect, it } from "vitest";
import type { ChatMessage } from "@/shared/contracts";
import {
  mergeAssistantMessages,
  pendingAssistantMessage,
  PENDING_ASSISTANT_KEY,
  readPendingAssistant,
  type PendingAssistantOperation,
} from "./assistant-client-state";

const pending: PendingAssistantOperation = {
  owner: "user:alice",
  operationId: "942857b7-f125-4090-abaf-e7d2f2a7a194",
  text: "Как отдыхать между подходами?",
  createdAt: "2026-10-12T12:00:00.000Z",
};
function storage(value: unknown) {
  const entries = new Map([[PENDING_ASSISTANT_KEY, JSON.stringify(value)]]);
  return {
    getItem: (key: string) => entries.get(key) ?? null,
    removeItem: (key: string) => void entries.delete(key),
  };
}

describe("assistant recovery", () => {
  it("recovers the same operation only for its authenticated owner", () => {
    const local = storage(pending);
    expect(readPendingAssistant(local, "user:alice")).toEqual(pending);
    expect(readPendingAssistant(local, "user:bob")).toBeNull();
    expect(local.getItem(PENDING_ASSISTANT_KEY)).toBeNull();
  });
  it("discards invalid or unbounded persisted drafts", () => {
    expect(
      readPendingAssistant(storage({ ...pending, text: "x".repeat(2001) }), pending.owner),
    ).toBeNull();
    expect(
      readPendingAssistant(storage({ ...pending, operationId: "bad" }), pending.owner),
    ).toBeNull();
    expect(readPendingAssistant(storage(pending), "demo")).toBeNull();
  });
  it("replaces an optimistic turn with the confirmed pair without duplicate retries", () => {
    const optimistic = pendingAssistantMessage(pending);
    const user: ChatMessage = { ...optimistic, id: "persisted-user" };
    const assistant: ChatMessage = {
      id: "persisted-reply",
      role: "assistant",
      text: "Дай себе время восстановить дыхание.",
      createdAt: "2026-10-12T12:00:01.000Z",
    };
    const merged = mergeAssistantMessages([optimistic], [user, assistant], pending.operationId);
    expect(merged).toEqual([user, assistant]);
    expect(mergeAssistantMessages(merged, [user, assistant], pending.operationId)).toEqual(merged);
  });
});
