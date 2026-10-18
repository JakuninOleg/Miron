import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { and, eq, inArray, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { closeDb, getDb } from "../db";
import {
  aiReservations,
  assistantTurns,
  exercises,
  plans,
  profiles,
  recordedSets,
  trials,
  user,
  variantRevisions,
  variants,
  workouts,
  workoutSteps,
  workoutPlannerPrograms,
  xpEvents,
} from "../db/schema";
import { initializeAccount } from "../domain/profile";
import { DomainError } from "../domain/errors";
import { getWorkout } from "../domain/workouts";
import { applyWorkoutCommand } from "../domain/workouts";
import { admitAssistantTurn, attachAssistantReservation, finishAssistantTurn } from "./repository";
import { confirmAssistantAction, getAssistantHistory, sendAssistantMessage } from "./service";
import { reserveAiReply } from "../domain/trial";
import { saveBuilderInventory } from "../domain/workout-builder";
import { readAssistantProfile } from "./context";
import { executeAssistantTool } from "./tools";
import type { Provider, ProviderReply } from "./provider";

if (existsSync(".env.local")) process.loadEnvFile(".env.local");
const enabled = process.env.RUN_DB_TESTS === "true";
const scope = JSON.stringify({
  route: "in_scope",
  topics: ["training"],
  riskFlags: [],
  trainingSafety: "allow",
});
const review = JSON.stringify({ decision: "allow", reasonCode: "within_policy" });
function providerReply(content: string, toolCalls: ProviderReply["toolCalls"] = []): ProviderReply {
  return {
    content,
    toolCalls,
    usage: { promptTokens: 100, completionTokens: 20, totalTokens: 120, costHintRub: 0.001 },
  };
}
function providerFixture(
  responses = [
    providerReply(scope),
    providerReply("Открой карточки занятия — разберём их вместе."),
    providerReply(review),
  ],
) {
  const provider = vi.fn<Provider>();
  for (const response of responses) provider.mockResolvedValueOnce(response);
  return provider;
}

describe.runIf(enabled)(
  "PostgreSQL beta assistant owner isolation, operations and confirmed energy",
  () => {
    const owners = Array.from({ length: 10 }, () => randomUUID());
    const [
      alice,
      bob,
      failedOwner,
      leaseOwner,
      safetyOwner,
      energyOwner,
      adultOwner,
      capOwnerA,
      capOwnerB,
      previewOwner,
    ] = owners;
    const workoutId = randomUUID();
    const stepId = randomUUID();
    const revisionId = randomUUID();
    const familyId = `assistant-test.${randomUUID()}`;

    beforeAll(async () => {
      const url = new URL(process.env.DATABASE_URL!);
      if (!["127.0.0.1", "localhost"].includes(url.hostname))
        throw new Error("Integration fixtures require local PostgreSQL");
      vi.stubEnv("ENABLE_AI_ASSISTANT", "true");
      vi.stubEnv("PLUSVIBE_API_KEY", "synthetic-provider-key-never-used");
      await getDb()
        .insert(user)
        .values(
          owners.map((id) => ({
            id,
            name: "Assistant fixture",
            email: `${id}@example.test`,
            emailVerified: true,
          })),
        );
      for (const owner of owners) {
        await initializeAccount(owner);
        if (owner !== adultOwner)
          await getDb()
            .update(profiles)
            .set({ adultConfirmed: true, onboardingCompleted: true })
            .where(eq(profiles.userId, owner));
      }
      await getDb()
        .insert(exercises)
        .values({ id: familyId, nameRu: "Fixture exercise", discipline: "strength" });
      await getDb().insert(variants).values({
        id: familyId,
        exerciseId: familyId,
        nameRu: "Fixture exercise",
        aliasEn: "Fixture",
        pattern: "push",
        resistanceMode: "bodyweight",
        metric: "reps",
        sourceBasis: "test",
      });
      await getDb().insert(variantRevisions).values({
        id: revisionId,
        variantId: familyId,
        revision: 1,
        instructions: "Synthetic draft",
      });
      const [plan] = await getDb()
        .insert(plans)
        .values({ userId: energyOwner, name: "Energy fixture" })
        .returning();
      await getDb().insert(workouts).values({
        id: workoutId,
        userId: energyOwner,
        planId: plan.id,
        name: "Занятие для оценки",
        status: "partial",
        energyActivity: "strength",
        place: "home",
        availableSeconds: 120,
        sourceProfileRevision: 1,
        completedAt: new Date(),
        isDemo: true,
      });
      await getDb().insert(workoutSteps).values({
        id: stepId,
        userId: energyOwner,
        workoutId,
        variantRevisionId: revisionId,
        ordinal: 0,
        name: "Отжимания",
        sets: 1,
        reps: 10,
        instructions: "Synthetic draft",
        metric: "reps",
      });
      await getDb()
        .insert(recordedSets)
        .values({ userId: energyOwner, workoutId, stepId, setIndex: 0, reps: 10, weightG: 0 });
      await getDb()
        .insert(xpEvents)
        .values({ userId: energyOwner, workoutId, event: "partial", amount: 25 });
    }, 30_000);

    afterAll(async () => {
      await getDb().delete(user).where(inArray(user.id, owners));
      await getDb().delete(variantRevisions).where(eq(variantRevisions.id, revisionId));
      await getDb().delete(variants).where(eq(variants.id, familyId));
      await getDb().delete(exercises).where(eq(exercises.id, familyId));
      vi.unstubAllEnvs();
      await closeDb();
    });

    it("reads confirmed planner inventory only for its owner and previews bounded seeded drafts without saving training", async () => {
      await saveBuilderInventory(previewOwner, {
        operationId: randomUUID(),
        place: "gym",
        expectedRevision: 0,
        resources: [],
      });
      const own = await readAssistantProfile(previewOwner);
      expect(own.confirmedBuilderInventories).toEqual([
        expect.objectContaining({ place: "gym", revision: 1, resourceCount: expect.any(Number) }),
      ]);
      expect((await readAssistantProfile(bob)).confirmedBuilderInventories).toEqual([]);
      const base = {
        mode: "single",
        place: "gym",
        direction: "strength",
        split: "fullbody",
        daysPerWeek: 1,
        intent: "start",
        durationMinutes: 25,
        execution: "straight",
        variety: "familiar",
      };
      for (const config of [
        base,
        { ...base, mode: "program", daysPerWeek: 4, durationMinutes: 120 },
      ]) {
        const outcome = await executeAssistantTool(previewOwner, "Подготовь черновик", {
          id: "preview",
          type: "function",
          function: { name: "preview_workout", arguments: JSON.stringify(config) },
        });
        expect(Buffer.byteLength(JSON.stringify(outcome.evidence))).toBeLessThan(14_000);
        expect(outcome.action).toMatchObject({ type: "planner" });
        if (outcome.action?.type === "planner") {
          const href = new URL(outcome.action.href, "https://example.test");
          expect(href.pathname).toBe("/workout-builder");
          expect(href.searchParams.get("from")).toBe("assistant");
          expect(JSON.parse(href.searchParams.get("assistantConfig")!)).toMatchObject(config);
        }
      }
      expect(
        await getDb()
          .select()
          .from(workoutPlannerPrograms)
          .where(eq(workoutPlannerPrograms.userId, previewOwner)),
      ).toEqual([]);
      expect(
        await getDb().select().from(workouts).where(eq(workouts.userId, previewOwner)),
      ).toEqual([]);
    });

    it("serializes concurrent owner intents and replays a lost response without a model call or quota duplicate", async () => {
      const operationId = randomUUID();
      let release!: () => void;
      let announce!: () => void;
      const started = new Promise<void>((resolve) => {
        announce = resolve;
      });
      const waiting = new Promise<void>((resolve) => {
        release = resolve;
      });
      let calls = 0;
      const provider = vi.fn<Provider>(async () => {
        calls += 1;
        if (calls === 1) {
          announce();
          await waiting;
          return providerReply(scope);
        }
        return providerReply(calls === 2 ? "Открой карточки занятия." : review);
      });
      const first = sendAssistantMessage(alice, { operationId, text: "Обсудим занятие" }, provider);
      await started;
      await expect(
        sendAssistantMessage(alice, { operationId, text: "Обсудим занятие" }, provider),
      ).rejects.toMatchObject({ code: "AI_OPERATION_PENDING" });
      await expect(
        sendAssistantMessage(alice, { operationId: randomUUID(), text: "Другой вопрос" }, provider),
      ).rejects.toMatchObject({ code: "AI_BUSY" });
      const safetyProvider = providerFixture();
      const urgent = await sendAssistantMessage(
        alice,
        { operationId: randomUUID(), text: "Трудно дышать сейчас" },
        safetyProvider,
      );
      expect(urgent.messages[1].source).toBe("prepared");
      expect(safetyProvider).not.toHaveBeenCalled();
      release();
      const result = await first;
      expect(
        await sendAssistantMessage(alice, { operationId, text: "Обсудим занятие" }, provider),
      ).toEqual(result);
      expect(provider).toHaveBeenCalledTimes(3);
      await expect(
        sendAssistantMessage(alice, { operationId, text: "Подменённый вопрос" }, provider),
      ).rejects.toMatchObject({ code: "OPERATION_REUSED" });
      const [trial] = await getDb().select().from(trials).where(eq(trials.userId, alice));
      expect(trial).toMatchObject({ used: 1, reserved: 0 });
      expect(
        (await getAssistantHistory(alice)).messages.filter(
          (message) => message.operationId === operationId,
        ),
      ).toEqual(result.messages);
      expect((await getAssistantHistory(bob)).messages).toEqual([]);
      await getDb()
        .update(trials)
        .set({ startsAt: new Date(Date.now() - 86_400_000), endsAt: new Date(Date.now() - 1_000) })
        .where(eq(trials.userId, alice));
      expect(
        await sendAssistantMessage(alice, { operationId, text: "Обсудим занятие" }, provider),
      ).toEqual(result);
      await getDb().update(profiles).set({ companion: "lika" }).where(eq(profiles.userId, alice));
      expect((await getAssistantHistory(alice)).messages).toEqual([]);
    });

    it("releases failed reply quota and does not resubmit the same operation", async () => {
      const operationId = randomUUID();
      const provider = vi
        .fn<Provider>()
        .mockRejectedValue(new DomainError("AI_PROVIDER_UNAVAILABLE", 503, "Недоступно"));
      await expect(
        sendAssistantMessage(failedOwner, { operationId, text: "Привет" }, provider),
      ).rejects.toMatchObject({ code: "AI_PROVIDER_UNAVAILABLE" });
      await expect(
        sendAssistantMessage(failedOwner, { operationId, text: "Привет" }, provider),
      ).rejects.toMatchObject({ code: "AI_PROVIDER_UNAVAILABLE" });
      expect(provider).toHaveBeenCalledTimes(1);
      const [trial] = await getDb().select().from(trials).where(eq(trials.userId, failedOwner));
      expect(trial).toMatchObject({ used: 0, reserved: 0 });
      expect((await getAssistantHistory(failedOwner)).messages).toMatchObject([
        { role: "user", replyState: "failed" },
      ]);
      const [turn] = await getDb()
        .select()
        .from(assistantTurns)
        .where(eq(assistantTurns.userId, failedOwner));
      expect(turn.usage?.calls).toBe(1);
    });

    it("marks expired unknown operations durably and releases their reservation", async () => {
      const operationId = randomUUID();
      await admitAssistantTurn(leaseOwner, operationId, "Привет");
      const reservation = await reserveAiReply(leaseOwner, operationId);
      await attachAssistantReservation(leaseOwner, operationId, reservation.id);
      await getDb()
        .update(assistantTurns)
        .set({ leaseExpiresAt: new Date(Date.now() - 1_000) })
        .where(eq(assistantTurns.userId, leaseOwner));
      const provider = providerFixture();
      await expect(
        sendAssistantMessage(leaseOwner, { operationId, text: "Привет" }, provider),
      ).rejects.toMatchObject({ code: "AI_OPERATION_UNKNOWN" });
      await expect(
        sendAssistantMessage(leaseOwner, { operationId, text: "Привет" }, provider),
      ).rejects.toMatchObject({ code: "AI_OPERATION_UNKNOWN" });
      expect(provider).not.toHaveBeenCalled();
      const [reserved] = await getDb()
        .select()
        .from(aiReservations)
        .where(eq(aiReservations.id, reservation.id));
      expect(reserved.status).toBe("released");
    });

    it("keeps local urgent support available when the trial expired and does not call provider", async () => {
      await getDb()
        .update(trials)
        .set({ startsAt: new Date(Date.now() - 86_400_000), endsAt: new Date(Date.now() - 1_000) })
        .where(eq(trials.userId, safetyOwner));
      const provider = providerFixture();
      const reply = await sendAssistantMessage(
        safetyOwner,
        { operationId: randomUUID(), text: "Сейчас давит в груди, трудно дышать" },
        provider,
      );
      expect(reply.messages[1].text).toContain("103 или 112");
      expect(provider).not.toHaveBeenCalled();
      const [trial] = await getDb().select().from(trials).where(eq(trials.userId, safetyOwner));
      expect(trial.used).toBe(0);
    });

    it("requires adult access and blocks disabled accounts", async () => {
      const provider = providerFixture();
      await expect(
        sendAssistantMessage(adultOwner, { operationId: randomUUID(), text: "План" }, provider),
      ).rejects.toMatchObject({ code: "ADULT_CONFIRMATION_REQUIRED" });
      const help = await sendAssistantMessage(
        adultOwner,
        { operationId: randomUUID(), text: "Трудно дышать, давит в груди" },
        provider,
      );
      expect(help.messages[1]).toMatchObject({ source: "prepared" });
      expect(help.messages[1].text).toContain("103 или 112");
      await getDb().update(user).set({ status: "deleting" }).where(eq(user.id, adultOwner));
      await expect(getAssistantHistory(adultOwner)).rejects.toMatchObject({
        code: "ACCOUNT_UNAVAILABLE",
      });
      expect(provider).not.toHaveBeenCalled();
    });

    it("creates an energy preview without mutation, authorizes confirmation and replays ACK independently of XP", async () => {
      const original = await getWorkout(energyOwner, workoutId);
      const provider = providerFixture([
        providerReply(scope),
        providerReply("", [
          {
            id: "energy",
            type: "function",
            function: {
              name: "preview_energy",
              arguments: JSON.stringify({
                workoutId,
                bodyWeightKg: 80,
                workload: [{ exerciseId: stepId, sets: 2, repsPerSet: 12 }],
              }),
            },
          },
        ]),
        providerReply(
          "Вот уточнение со слов: 80 кг, 2 подхода по 12 повторов. Подтверди его кнопкой; журнал и XP не меняются.",
        ),
        providerReply(review),
      ]);
      const reply = await sendAssistantMessage(
        energyOwner,
        {
          operationId: randomUUID(),
          text: "Уточни расход: моя масса 80 кг, отжимания 2 подхода по 12 повторов",
        },
        provider,
      );
      expect(await getWorkout(energyOwner, workoutId)).toEqual(original);
      const action = reply.messages[1].actions?.[0];
      if (!action || action.type !== "energy_estimate") throw new Error("Energy preview missing");
      await expect(
        confirmAssistantAction(bob, { proposalId: action.id, operationId: action.operationId }),
      ).rejects.toMatchObject({ code: "AI_PROPOSAL_NOT_FOUND" });
      await expect(
        confirmAssistantAction(energyOwner, { proposalId: action.id, operationId: randomUUID() }),
      ).rejects.toMatchObject({ code: "OPERATION_REUSED" });
      const results = await Promise.all(
        Array.from({ length: 6 }, () =>
          confirmAssistantAction(energyOwner, {
            proposalId: action.id,
            operationId: action.operationId,
          }),
        ),
      );
      for (const ack of results) expect(ack).toEqual(results[0]);
      expect(results[0].workout.revision).toBe(original.revision + 1);
      expect(results[0].workout.energyEstimate?.bodyWeightKg).toBe(80);
      expect(results[0].workout.recordedSets).toEqual(original.recordedSets);
      expect(results[0].progress.xp).toBe(25);
      expect(provider).toHaveBeenCalledTimes(4);
      expect(
        await confirmAssistantAction(energyOwner, {
          proposalId: action.id,
          operationId: action.operationId,
        }),
      ).toEqual(results[0]);
      await expect(
        confirmAssistantAction(energyOwner, {
          proposalId: action.id,
          operationId: action.operationId,
          input: { bodyWeightKg: 100 },
        }),
      ).rejects.toMatchObject({ name: "ZodError" });
      const [turn] = await getDb()
        .select()
        .from(assistantTurns)
        .where(
          and(
            eq(assistantTurns.userId, energyOwner),
            eq(assistantTurns.operationId, reply.operationId),
          ),
        );
      expect(turn.usage).toMatchObject({ calls: 4, totalTokens: 480 });
      const history = await getAssistantHistory(energyOwner);
      expect(history.messages[1].actions?.[0]).toMatchObject({ confirmed: true });

      const staleProvider = providerFixture([
        providerReply(scope),
        providerReply("", [
          {
            id: "stale",
            type: "function",
            function: {
              name: "preview_energy",
              arguments: JSON.stringify({ workoutId, bodyWeightKg: 81 }),
            },
          },
        ]),
        providerReply("Приблизительная поправка для массы тела 81 кг; подтверди её кнопкой."),
        providerReply(review),
      ]);
      const staleReply = await sendAssistantMessage(
        energyOwner,
        { operationId: randomUUID(), text: "Моя масса 81 кг, уточни оценку" },
        staleProvider,
      );
      const staleAction = staleReply.messages[1].actions?.[0];
      if (!staleAction || staleAction.type !== "energy_estimate")
        throw new Error("Stale fixture missing");
      await applyWorkoutCommand(energyOwner, workoutId, {
        operationId: randomUUID(),
        expectedRevision: results[0].workout.revision,
        command: { type: "estimate_energy", bodyWeightKg: 82 },
      });
      await expect(
        confirmAssistantAction(energyOwner, {
          proposalId: staleAction.id,
          operationId: staleAction.operationId,
        }),
      ).rejects.toMatchObject({ code: "REVISION_CONFLICT" });
      expect((await getWorkout(energyOwner, workoutId)).energyEstimate?.bodyWeightKg).toBe(82);
    });

    it("admits only one concurrent owner at the global daily cap and replays before the cap", async () => {
      const [baseline] = await getDb()
        .select({ count: sql<number>`count(*)::int` })
        .from(assistantTurns)
        .where(
          and(
            eq(assistantTurns.providerAdmitted, true),
            sql`${assistantTurns.createdAt} >= (date_trunc('day', now() at time zone 'Europe/Moscow') at time zone 'Europe/Moscow')`,
            sql`${assistantTurns.createdAt} < ((date_trunc('day', now() at time zone 'Europe/Moscow') + interval '1 day') at time zone 'Europe/Moscow')`,
          ),
        );
      vi.stubEnv("AI_DAILY_INTENT_LIMIT", String(baseline.count + 1));
      try {
        const operations = [randomUUID(), randomUUID()];
        const admissions = await Promise.all([
          admitAssistantTurn(capOwnerA, operations[0], "Привет"),
          admitAssistantTurn(capOwnerB, operations[1], "Привет"),
        ]);
        expect(admissions.filter((item) => "turn" in item)).toHaveLength(1);
        expect(
          admissions
            .filter((item) => "error" in item)
            .map((item) => "error" in item && item.error.code),
        ).toEqual(["AI_DAILY_LIMIT"]);
        const admitted = admissions.find((item) => "turn" in item);
        if (!admitted || !("turn" in admitted)) throw new Error("Admission missing");
        const turn = admitted.turn;
        const message = {
          id: turn.operationId,
          role: "assistant" as const,
          text: "Привет!",
          createdAt: turn.createdAt.toISOString(),
        };
        const reply = { operationId: turn.operationId, messages: [message] };
        const persistedReply = await finishAssistantTurn(
          turn.userId,
          turn.operationId,
          reply,
          false,
          {
            model: "mock",
            policyVersion: "test",
            calls: 1,
            promptTokens: 1,
            completionTokens: 1,
            totalTokens: 2,
            costHintRub: null,
          },
        );
        expect(await admitAssistantTurn(turn.userId, turn.operationId, "Привет")).toEqual({
          replay: persistedReply,
        });
        const deniedOwner = turn.userId === capOwnerA ? capOwnerB : capOwnerA;
        const denied = await admitAssistantTurn(deniedOwner, randomUUID(), "Снова вопрос");
        expect("error" in denied && denied.error.code).toBe("AI_DAILY_LIMIT");
        const [failed] = await getDb()
          .select()
          .from(assistantTurns)
          .where(eq(assistantTurns.userId, failedOwner));
        const failedReplay = await admitAssistantTurn(failedOwner, failed.operationId, failed.text);
        expect("error" in failedReplay && failedReplay.error.code).toBe("AI_PROVIDER_UNAVAILABLE");
        const [unknown] = await getDb()
          .select()
          .from(assistantTurns)
          .where(eq(assistantTurns.userId, leaseOwner));
        const unknownReplay = await admitAssistantTurn(
          leaseOwner,
          unknown.operationId,
          unknown.text,
        );
        expect("error" in unknownReplay && unknownReplay.error.code).toBe("AI_OPERATION_UNKNOWN");
        const safety = await sendAssistantMessage(
          deniedOwner,
          { operationId: randomUUID(), text: "Сейчас трудно дышать" },
          providerFixture(),
        );
        expect(safety.messages[1].source).toBe("prepared");
        const [prepared] = await getDb()
          .select()
          .from(assistantTurns)
          .where(eq(assistantTurns.operationId, safety.operationId));
        expect(prepared.providerAdmitted).toBe(false);
      } finally {
        vi.stubEnv("AI_DAILY_INTENT_LIMIT", "200");
      }
    });
  },
);
