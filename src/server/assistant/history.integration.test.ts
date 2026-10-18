import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { and, eq, inArray, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { closeDb, getDb } from "../db";
import {
  aiReservations,
  assistantHistoryCommands,
  assistantTurns,
  profiles,
  trials,
  user,
} from "../db/schema";
import { initializeAccount } from "../domain/profile";
import { reserveAiReply } from "../domain/trial";
import type { AssistantHistoryAction, AssistantReply } from "../../shared/assistant";
import type { CompanionId } from "../../shared/contracts";
import { getAssistantHistory, sendAssistantMessage } from "./service";
import { assistantHistoryMutationInput, mutateChatHistory } from "./history";
import {
  admitAssistantTurn,
  assistantPayloadHash,
  attachAssistantReservation,
  findAssistantAction,
  finishAssistantTurn,
  readAssistantMessages,
} from "./repository";

if (existsSync(".env.local")) process.loadEnvFile(".env.local");
const usage = {
  model: "synthetic",
  policyVersion: "test",
  calls: 1,
  promptTokens: 10,
  completionTokens: 10,
  totalTokens: 20,
  costHintRub: null,
};
describe.runIf(process.env.RUN_DB_TESTS === "true")(
  "private synchronized chat history and content deletion",
  () => {
    const alice = randomUUID(),
      bob = randomUUID(),
      runningOwner = randomUUID(),
      minor = randomUUID();
    const owners = [alice, bob, runningOwner, minor];
    const maxIds = Array.from({ length: 31 }, () => randomUUID());
    const likaId = randomUUID(),
      bobId = randomUUID(),
      proposalId = randomUUID();
    let cursor: string;
    function reply(id: string, persona: CompanionId, text: string): AssistantReply {
      return {
        operationId: id,
        messages: [
          {
            id: `${id}:user`,
            operationId: id,
            companion: persona,
            role: "user",
            text,
            createdAt: "2026-10-10T12:00:00.123Z",
          },
          {
            id: `${id}:assistant`,
            operationId: id,
            companion: persona,
            role: "assistant",
            text: `Ответ: ${text}`,
            createdAt: "2026-10-10T12:00:01.000Z",
            ...(id === maxIds[0]
              ? {
                  actions: [
                    {
                      id: proposalId,
                      type: "planner",
                      title: "Черновик",
                      href: "/workout-builder",
                    },
                  ],
                }
              : {}),
          },
        ],
      };
    }
    async function add(ownerId: string, persona: CompanionId, id: string, text: string) {
      await getDb()
        .insert(assistantTurns)
        .values({
          userId: ownerId,
          operationId: id,
          text,
          payloadHash: assistantPayloadHash(text),
          companion: persona,
          providerAdmitted: false,
          status: "completed",
          leaseExpiresAt: new Date(),
          createdAt: new Date("2026-10-10T12:00:00.123Z"),
          finishedAt: new Date(),
          result: reply(id, persona, text),
        });
    }
    async function mutate(ownerId: string, persona: CompanionId, action: AssistantHistoryAction) {
      const history = await getAssistantHistory(ownerId, { companion: persona });
      return mutateChatHistory(ownerId, {
        operationId: randomUUID(),
        companion: persona,
        expectedRevision: history.revision,
        action,
      });
    }
    async function allMessages(ownerId: string, persona: CompanionId) {
      let page = await getAssistantHistory(ownerId, { companion: persona });
      const messages = [...page.messages];
      for (let count = 0; page.nextCursor && count < 10; count++) {
        page = await getAssistantHistory(ownerId, { companion: persona, before: page.nextCursor });
        messages.unshift(...page.messages);
      }
      return messages;
    }
    async function append(ownerId: string, text: string) {
      const id = randomUUID();
      const admitted = await admitAssistantTurn(ownerId, id, text);
      if (!("turn" in admitted)) throw new Error("Synthetic admission failed");
      return finishAssistantTurn(ownerId, id, reply(id, "max", text), false, usage);
    }
    beforeAll(async () => {
      const url = new URL(process.env.DATABASE_URL ?? "");
      if (
        !["127.0.0.1", "localhost"].includes(url.hostname) ||
        url.port !== "55432" ||
        url.pathname !== "/miron"
      )
        throw new Error("Chat history fixtures require local PostgreSQL:55432/miron.");
      await getDb()
        .insert(user)
        .values(
          owners.map((id) => ({
            id,
            name: "History fixture",
            email: `${id}@example.test`,
            emailVerified: true,
          })),
        );
      for (const owner of owners) {
        await initializeAccount(owner);
        if (owner !== minor)
          await getDb()
            .update(profiles)
            .set({ adultConfirmed: true, onboardingCompleted: true })
            .where(eq(profiles.userId, owner));
      }
      for (const [index, id] of maxIds.entries()) {
        await add(alice, "max", id, `История ${index}`);
        // Exact microseconds matter: JS Date cursors would silently skip rows within this ms.
        await getDb().execute(
          sql`update ${assistantTurns} set created_at = '2026-10-10T12:00:00.123000Z'::timestamptz + ${index} * interval '1 microsecond' where ${assistantTurns.userId} = ${alice} and ${assistantTurns.operationId} = ${id}`,
        );
      }
      await add(alice, "lika", likaId, "Разговор с Ликой");
      await add(bob, "max", bobId, "Чужой разговор");
    });
    afterAll(async () => {
      await getDb().delete(user).where(inArray(user.id, owners));
      await closeDb();
    });

    it("loads the same persisted pages on another session, preserving microsecond ordering and persona separation", async () => {
      const first = await getAssistantHistory(alice, { companion: "max" });
      expect(first.messages).toHaveLength(50);
      expect(first.nextCursor).toBeTypeOf("string");
      expect(await getAssistantHistory(alice, { companion: "max" })).toEqual(first);
      cursor = first.nextCursor!;
      const second = await getAssistantHistory(alice, { companion: "max", before: cursor });
      expect(second.messages).toHaveLength(12);
      expect(second.nextCursor).toBeNull();
      expect(
        new Set([...first.messages, ...second.messages].map((message) => message.id)).size,
      ).toBe(62);
      expect(
        (await getAssistantHistory(alice, { companion: "lika" })).messages.every(
          (message) => message.operationId === likaId,
        ),
      ).toBe(true);
      expect(
        (await getAssistantHistory(bob, { companion: "max" })).messages.every(
          (message) => message.operationId === bobId,
        ),
      ).toBe(true);
    });
    it("keeps an older cursor valid when a new completed turn is appended", async () => {
      const result = await append(alice, "Новый вопрос");
      expect(result.historyRevision).toBe(2);
      const older = await getAssistantHistory(alice, { companion: "max", before: cursor });
      expect(older.messages).toHaveLength(12);
      expect(older.resetRevision).toBe(0);
    });
    it("rejects another owner's target, mismatched persona, malformed cursor and unconfirmed access", async () => {
      await expect(
        mutate(bob, "max", { type: "delete_turn", turnId: maxIds[0] }),
      ).rejects.toMatchObject({ code: "AI_MESSAGE_NOT_FOUND" });
      await expect(
        mutate(alice, "lika", { type: "delete_turn", turnId: maxIds[0] }),
      ).rejects.toMatchObject({ code: "AI_MESSAGE_NOT_FOUND" });
      await expect(getAssistantHistory(alice, { before: "bad" })).rejects.toMatchObject({
        code: "INVALID_CHAT_CURSOR",
      });
      await expect(
        getAssistantHistory(alice, { companion: "lika", before: cursor }),
      ).rejects.toMatchObject({ code: "AI_HISTORY_CHANGED" });
      await expect(getAssistantHistory(minor)).rejects.toMatchObject({
        code: "ADULT_CONFIRMATION_REQUIRED",
      });
      await expect(
        mutateChatHistory(minor, {
          operationId: randomUUID(),
          companion: "max",
          expectedRevision: 0,
          action: { type: "clear" },
        }),
      ).rejects.toMatchObject({ code: "ADULT_CONFIRMATION_REQUIRED" });
    });
    it("deletes a request's actual content, preserves the answer text, revokes its proposal and excludes the pair from AI context", async () => {
      expect((await findAssistantAction(alice, proposalId)).id).toBe(proposalId);
      await mutate(alice, "max", { type: "delete_message", turnId: maxIds[0], role: "user" });
      const remaining = (await allMessages(alice, "max")).filter(
        (message) => message.operationId === maxIds[0],
      );
      expect(remaining).toHaveLength(1);
      expect(remaining[0].role).toBe("assistant");
      expect(remaining[0].actions).toBeUndefined();
      const [stored] = await getDb()
        .select()
        .from(assistantTurns)
        .where(and(eq(assistantTurns.userId, alice), eq(assistantTurns.operationId, maxIds[0])));
      expect(stored.text).toBe("[удалено]");
      expect(stored.result?.messages.some((message) => message.role === "user")).toBe(false);
      expect(
        (await readAssistantMessages(alice, "max", 100)).some(
          (message) => message.operationId === maxIds[0],
        ),
      ).toBe(false);
      await expect(findAssistantAction(alice, proposalId)).rejects.toMatchObject({
        code: "AI_PROPOSAL_NOT_FOUND",
      });
      expect(await admitAssistantTurn(alice, maxIds[0], "История 0")).toMatchObject({
        error: { code: "AI_MESSAGE_REMOVED" },
      });
      await expect(
        getAssistantHistory(alice, { companion: "max", before: cursor }),
      ).rejects.toMatchObject({ code: "AI_HISTORY_CHANGED" });
    });
    it("deletes just an answer or an entire exchange and replays a racing deletion once", async () => {
      await mutate(alice, "max", { type: "delete_message", turnId: maxIds[1], role: "assistant" });
      expect(
        (await allMessages(alice, "max"))
          .filter((message) => message.operationId === maxIds[1])
          .map((message) => message.role),
      ).toEqual(["user"]);
      const history = await getAssistantHistory(alice, { companion: "max" });
      const input = {
        operationId: randomUUID(),
        companion: "max",
        expectedRevision: history.revision,
        action: { type: "delete_turn", turnId: maxIds[2] },
      };
      const [first, retry] = await Promise.all([
        mutateChatHistory(alice, input),
        mutateChatHistory(alice, input),
      ]);
      expect(retry).toEqual(first);
      expect(
        await getDb()
          .select()
          .from(assistantHistoryCommands)
          .where(eq(assistantHistoryCommands.operationId, input.operationId)),
      ).toHaveLength(1);
      expect(
        (await allMessages(alice, "max")).some((message) => message.operationId === maxIds[2]),
      ).toBe(false);
      await expect(
        mutateChatHistory(alice, { ...input, action: { type: "clear" } }),
      ).rejects.toMatchObject({ code: "OPERATION_REUSED" });
    });
    it("clears only one persona, retains usage metadata, and never re-clears newer messages on a lost-ACK retry", async () => {
      const before = await getAssistantHistory(alice, { companion: "max" });
      const storedBefore = await getDb()
        .select({ providerAdmitted: assistantTurns.providerAdmitted, usage: assistantTurns.usage })
        .from(assistantTurns)
        .where(and(eq(assistantTurns.userId, alice), eq(assistantTurns.companion, "max")));
      const input = {
        operationId: randomUUID(),
        companion: "max",
        expectedRevision: before.revision,
        action: { type: "clear" },
      };
      const receipt = await mutateChatHistory(alice, input);
      expect((await getAssistantHistory(alice, { companion: "max" })).messages).toEqual([]);
      expect((await getAssistantHistory(alice, { companion: "lika" })).messages).toHaveLength(2);
      const storedAfter = await getDb()
        .select({ providerAdmitted: assistantTurns.providerAdmitted, usage: assistantTurns.usage })
        .from(assistantTurns)
        .where(and(eq(assistantTurns.userId, alice), eq(assistantTurns.companion, "max")));
      expect(storedAfter).toEqual(storedBefore);
      const next = await append(alice, "После очистки");
      expect(await mutateChatHistory(alice, input)).toEqual(receipt);
      expect(
        (await getAssistantHistory(alice, { companion: "max" })).messages.map(
          (message) => message.operationId,
        ),
      ).toEqual([next.operationId, next.operationId]);
      await expect(
        mutateChatHistory(alice, { ...input, operationId: randomUUID() }),
      ).rejects.toMatchObject({ code: "AI_HISTORY_CHANGED" });
    });
    it("cancels a running reply and reservation without allowing finish, retry or a late old request to resurrect it", async () => {
      const id = randomUUID();
      const admitted = await admitAssistantTurn(runningOwner, id, "Текущий вопрос", false, {
        expectedHistoryRevision: 0,
        companion: "max",
      });
      expect("turn" in admitted).toBe(true);
      const reservation = await reserveAiReply(runningOwner, id);
      expect(await attachAssistantReservation(runningOwner, id, reservation.id)).toBe(true);
      expect(
        (await getAssistantHistory(runningOwner, { pendingOperationId: id })).pending?.state,
      ).toBe("running");
      expect((await getAssistantHistory(runningOwner)).messages).toMatchObject([
        { role: "user", text: "Текущий вопрос", replyState: "pending" },
      ]);
      await getDb()
        .update(assistantTurns)
        .set({ leaseExpiresAt: new Date(Date.now() - 1000) })
        .where(and(eq(assistantTurns.userId, runningOwner), eq(assistantTurns.operationId, id)));
      expect((await getAssistantHistory(runningOwner)).messages[0].replyState).toBe("failed");
      await mutate(runningOwner, "max", { type: "clear" });
      await expect(
        finishAssistantTurn(runningOwner, id, reply(id, "max", "Запоздалый ответ"), true, usage),
      ).rejects.toMatchObject({ code: "AI_MESSAGE_REMOVED" });
      expect(await admitAssistantTurn(runningOwner, id, "Текущий вопрос")).toMatchObject({
        error: { code: "AI_MESSAGE_REMOVED" },
      });
      expect(
        (await getAssistantHistory(runningOwner, { pendingOperationId: id })).pending?.state,
      ).toBe("removed");
      const [stored] = await getDb()
        .select()
        .from(aiReservations)
        .where(eq(aiReservations.id, reservation.id));
      expect(stored.status).toBe("released");
      const [trial] = await getDb().select().from(trials).where(eq(trials.userId, runningOwner));
      expect(trial.used).toBe(0);
      expect(trial.reserved).toBe(0);
      await expect(
        admitAssistantTurn(runningOwner, randomUUID(), "Задержанный запрос", false, {
          expectedHistoryRevision: 0,
          companion: "max",
        }),
      ).rejects.toMatchObject({ code: "AI_HISTORY_CHANGED" });
    });
    it("keeps deletion input strict and bounded", () => {
      const input = {
        operationId: randomUUID(),
        companion: "max",
        expectedRevision: 0,
        action: { type: "clear" },
      };
      expect(assistantHistoryMutationInput.safeParse(input).success).toBe(true);
      expect(assistantHistoryMutationInput.safeParse({ ...input, ownerId: bob }).success).toBe(
        false,
      );
      expect(
        assistantHistoryMutationInput.safeParse({ ...input, expectedRevision: -1 }).success,
      ).toBe(false);
      expect(
        assistantHistoryMutationInput.safeParse({
          ...input,
          action: { type: "delete_message", turnId: "bad", role: "system" },
        }).success,
      ).toBe(false);
    });
    it("stops subsequent provider calls after another device clears during generation", async () => {
      vi.stubEnv("ENABLE_AI_ASSISTANT", "true");
      vi.stubEnv("PLUSVIBE_API_KEY", "synthetic-history-test-never-used");
      let enter: () => void = () => undefined;
      let release: () => void = () => undefined;
      const started = new Promise<void>((resolve) => {
        enter = resolve;
      });
      const blocked = new Promise<void>((resolve) => {
        release = resolve;
      });
      let calls = 0;
      const id = randomUUID();
      const pending = sendAssistantMessage(
        runningOwner,
        { operationId: id, text: "Объясни отдых между подходами" },
        async () => {
          calls++;
          enter();
          await blocked;
          return {
            content: JSON.stringify({
              route: "in_scope",
              topics: ["training"],
              riskFlags: [],
              trainingSafety: "allow",
            }),
            toolCalls: [],
            usage: { promptTokens: 10, completionTokens: 10, totalTokens: 20, costHintRub: null },
          };
        },
      );
      const rejected = expect(pending).rejects.toMatchObject({ code: "AI_MESSAGE_REMOVED" });
      try {
        await Promise.race([
          started,
          pending.then(() => {
            throw new Error("Reply completed before test gate");
          }),
        ]);
        await mutate(runningOwner, "max", { type: "clear" });
        release();
        await rejected;
        expect(calls).toBe(1);
        const [stored] = await getDb()
          .select()
          .from(assistantTurns)
          .where(and(eq(assistantTurns.userId, runningOwner), eq(assistantTurns.operationId, id)));
        expect(stored.text).toBe("[удалено]");
        expect(stored.result).toBeNull();
        expect(stored.usage?.calls).toBe(1);
      } finally {
        release();
        vi.unstubAllEnvs();
      }
    });
  },
);
