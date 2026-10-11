import { describe, expect, it } from "vitest";
import { resourcesSatisfy } from "./catalog";
import {
  assertOwner,
  checkCommandReplay,
  commandHash,
  kilogramsToGrams,
  workoutCommandInput,
  createWorkoutInput,
} from "./workouts";
import { quotaAvailable } from "./trial";

describe("training invariants", () => {
  it("rejects forged reward dates, kinds, clocks and XP authority", () => {
    const base = {
      operationId: crypto.randomUUID(),
      expectedRevision: 1,
      command: { type: "end_early" },
    };
    expect(workoutCommandInput.safeParse(base).success).toBe(true);
    for (const forged of [
      { rewardDay: "2026-10-01" },
      { rewardKind: "main" },
      { awardedXp: 50 },
      { completedAt: "2026-10-01" },
    ]) {
      expect(createWorkoutInput.safeParse(forged).success).toBe(false);
      expect(workoutCommandInput.safeParse({ ...base, ...forged }).success).toBe(false);
      expect(
        workoutCommandInput.safeParse({ ...base, command: { ...base.command, ...forged } }).success,
      ).toBe(false);
    }
  });
  it("bounds actual seconds and rejects mixed result authority", () => {
    const base = {
      operationId: crypto.randomUUID(),
      expectedRevision: 1,
      command: {
        type: "record_timed_set",
        exerciseId: crypto.randomUUID(),
        setId: crypto.randomUUID(),
        durationSeconds: 30,
      },
    };
    expect(workoutCommandInput.safeParse(base).success).toBe(true);
    for (const durationSeconds of [0, -1, 1.5, 86401])
      expect(
        workoutCommandInput.safeParse({ ...base, command: { ...base.command, durationSeconds } })
          .success,
      ).toBe(false);
    expect(
      workoutCommandInput.safeParse({ ...base, command: { ...base.command, reps: 30 } }).success,
    ).toBe(false);
  });
  it("preserves canonical legacy request hashes and historical ACK payloads", () => {
    const legacy = {
      operationId: "11111111-1111-4111-8111-111111111111",
      expectedRevision: 1,
      command: {
        type: "record_set" as const,
        exerciseId: "22222222-2222-4222-8222-222222222222",
        setId: "33333333-3333-4333-8333-333333333333",
        reps: 20,
        weightKg: 0,
      },
    };
    expect(commandHash(workoutCommandInput.parse(legacy))).toBe(commandHash(legacy));
    const result = { recordedSets: [{ reps: 20, weightKg: 0 }] };
    expect(
      checkCommandReplay({ requestHash: commandHash(legacy), result }, commandHash(legacy)),
    ).toBe(result);
  });
  it("converts decimal kilograms without multiplying a binary fraction", () => {
    expect(kilogramsToGrams(12.345)).toBe(12345);
    expect(kilogramsToGrams(0.125)).toBe(125);
    expect(() => kilogramsToGrams(0.0001)).toThrow("точностью до грамма");
  });
  it("one dumbbell never satisfies a pair and support requires confirmation", () => {
    expect(
      resourcesSatisfy(
        [{ code: "dumbbell", quantity: 2, requiresConfirmation: false }],
        [{ code: "dumbbell", quantity: 1 }],
      ),
    ).toBe(false);
    const support = { code: "stable_bench", quantity: 1, requiresConfirmation: true };
    expect(
      resourcesSatisfy([support], [{ code: "stable_bench", quantity: 1, isStable: true }]),
    ).toBe(false);
    expect(
      resourcesSatisfy(
        [support],
        [{ code: "stable_bench", quantity: 1, isStable: true, confirmedAt: new Date() }],
      ),
    ).toBe(true);
  });
  it("replays exact command result and rejects operation reuse with different payload", () => {
    const input = workoutCommandInput.parse({
      operationId: "11111111-1111-4111-8111-111111111111",
      expectedRevision: 1,
      command: { type: "finish" },
    });
    const hash = commandHash(input);
    const result = { revision: 2, xp: 50 };
    expect(checkCommandReplay({ requestHash: hash, result }, hash)).toBe(result);
    expect(() =>
      checkCommandReplay(
        { requestHash: hash, result },
        commandHash({ ...input, expectedRevision: 2 }),
      ),
    ).toThrow("другими данными");
  });
  it("returns identical absence semantics for another owner", () => {
    expect(() => assertOwner("user-a", "user-b")).toThrow("Тренировка не найдена");
  });
  it("reservations consume quota capacity and the 168-hour boundary is exclusive", () => {
    const trial = {
      startsAt: new Date("2026-01-01T00:00:00Z"),
      endsAt: new Date("2026-01-08T00:00:00Z"),
      limit: 100,
      used: 99,
      reserved: 1,
    };
    expect(quotaAvailable(trial, new Date("2026-01-07"))).toBe(false);
    expect(quotaAvailable({ ...trial, reserved: 0 }, new Date("2026-01-07"))).toBe(true);
    expect(quotaAvailable({ ...trial, reserved: 0 }, trial.endsAt)).toBe(false);
    expect(quotaAvailable({ ...trial, reserved: 0 }, new Date("2025-12-31"))).toBe(false);
  });
  it("rejects arbitrary command types and extra client authority", () => {
    expect(
      workoutCommandInput.safeParse({
        operationId: crypto.randomUUID(),
        expectedRevision: 1,
        command: { type: "finish", xp: 999 },
      }).success,
    ).toBe(false);
  });
});
