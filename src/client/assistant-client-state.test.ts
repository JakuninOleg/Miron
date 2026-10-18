import { describe, expect, it } from "vitest";
import type { ChatMessage } from "@/shared/contracts";
import {
  mergeAssistantMessages,
  pendingAssistantMessage,
  PENDING_ASSISTANT_KEY,
  readPendingAssistant,
  reconcileAssistantHistory,
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
  it("keeps loaded older pages on append, replaces them on deletion and ignores an older response", () => {
    const old = { ...pendingAssistantMessage(pending), companion: "max" as const };
    const latest = { ...old, id: "latest", operationId: crypto.randomUUID(), text: "Новое" };
    const snapshot = { companion: "max" as const, revision: 4, resetRevision: 1 };
    const page = {
      enabled: true,
      companion: "max" as const,
      revision: 5,
      resetRevision: 1,
      nextCursor: null,
      messages: [latest],
    };
    expect(
      reconcileAssistantHistory([old], snapshot, page)?.messages.map((message) => message.id),
    ).toEqual([old.id, latest.id]);
    expect(
      reconcileAssistantHistory([old], snapshot, { ...page, resetRevision: 5 })?.messages,
    ).toEqual([latest]);
    expect(reconcileAssistantHistory([old], snapshot, { ...page, revision: 3 })).toBeNull();
    const lika = reconcileAssistantHistory([old], snapshot, {
      ...page,
      companion: "lika",
      messages: [],
    });
    expect(lika?.messages).toEqual([]);
  });
  it("preserves every deliberately loaded page when the caller opts out of the recent-message cap", () => {
    const messages = Array.from({ length: 120 }, (_, index) => ({
      ...pendingAssistantMessage(pending),
      id: `message-${index}`,
      operationId: undefined,
    }));
    expect(mergeAssistantMessages(messages, [])).toHaveLength(100);
    expect(mergeAssistantMessages(messages, [], undefined, Infinity)).toHaveLength(120);
  });
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
