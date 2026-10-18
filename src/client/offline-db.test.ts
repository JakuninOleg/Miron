import "fake-indexeddb/auto";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildDemoWorkout, DEFAULT_PROFILE } from "@/shared/demo";
import type { CommandEnvelope } from "@/shared/contracts";
import {
  acknowledgeCommand,
  acceptServerWorkout,
  journalCommand,
  offlineDb,
  ownerCommands,
  persistState,
  endOfflineSession,
  eraseOwnerOfflineData,
  queueOwnerMatches,
  type CachedState,
  type PendingCommand,
} from "./offline-db";
import { reduceWorkout } from "./workout-reducer";
function initial(key = "user:alice"): CachedState {
  return {
    key,
    profile: structuredClone(DEFAULT_PROFILE),
    trial: {
      startsAt: "2026-01-01T00:00:00Z",
      endsAt: "2026-01-08T00:00:00Z",
      replyLimit: 100,
      repliesUsed: 0,
    },
    progress: { xp: 0, completedWorkouts: 0, history: [] },
    messages: [],
    offlineReady: false,
    workout: buildDemoWorkout(DEFAULT_PROFILE),
  };
}
function operation(
  state: CachedState,
  command: CommandEnvelope["command"],
  createdAt = Date.now(),
): { next: CachedState; item: PendingCommand } {
  const envelope = {
    operationId: crypto.randomUUID(),
    expectedRevision: state.workout!.revision,
    command,
  };
  return {
    next: { ...state, workout: reduceWorkout(state.workout!, command) },
    item: {
      id: envelope.operationId,
      owner: state.key,
      workoutId: state.workout!.id,
      envelope,
      createdAt,
    },
  };
}
describe("durable per-account command journal", () => {
  it("archives conflicting work atomically for its owner and accepts only the compared local revision", async () => {
    const alice = initial(),
      bob = initial("user:bob");
    await persistState(alice);
    await persistState(bob);
    const a = operation(alice, {
      type: "record_set",
      exerciseId: alice.workout!.exercises[0].id,
      setId: crypto.randomUUID(),
      reps: 8,
      weightKg: 10,
    });
    const b = operation(bob, {
      type: "record_set",
      exerciseId: bob.workout!.exercises[0].id,
      setId: crypto.randomUUID(),
      reps: 10,
      weightKg: 5,
    });
    await journalCommand(a.next, a.item);
    await journalCommand(b.next, b.item);
    const canonical = { ...alice.workout!, revision: 9 };
    await expect(acceptServerWorkout(alice.key, canonical, alice.progress, 1)).rejects.toThrow(
      "Локальный журнал изменился",
    );
    expect(await ownerCommands(alice.key)).toHaveLength(1);
    const fail = () => {
      throw new Error("Storage failure");
    };
    offlineDb.workoutBackups.hook("creating", fail);
    try {
      await expect(
        acceptServerWorkout(alice.key, canonical, alice.progress, a.next.workout!.revision),
      ).rejects.toThrow("Storage failure");
    } finally {
      offlineDb.workoutBackups.hook("creating").unsubscribe(fail);
    }
    expect(await ownerCommands(alice.key)).toHaveLength(1);
    expect((await offlineDb.states.get(alice.key))?.workout?.recordedSets).toHaveLength(1);
    const accepted = await acceptServerWorkout(
      alice.key,
      canonical,
      alice.progress,
      a.next.workout!.revision,
    );
    expect(accepted.workout).toEqual(canonical);
    expect(await ownerCommands(alice.key)).toEqual([]);
    expect(await ownerCommands(bob.key)).toEqual([b.item]);
    const copies = await offlineDb.workoutBackups.where("owner").equals(alice.key).toArray();
    expect(copies).toHaveLength(1);
    expect(copies[0].commands).toEqual([a.item]);
    expect(copies[0].localWorkout.recordedSets).toHaveLength(1);
    expect(await offlineDb.workoutBackups.where("owner").equals(bob.key).count()).toBe(0);
    vi.stubGlobal("localStorage", { getItem: () => "alice", removeItem: vi.fn() });
    vi.stubGlobal("sessionStorage", { removeItem: vi.fn() });
    await endOfflineSession(alice.key);
    expect(await offlineDb.states.get(alice.key)).toBeUndefined();
    expect(await offlineDb.workoutBackups.where("owner").equals(alice.key).count()).toBe(1);
  });
  it("erases only the explicitly deleted account and leaves another owner's journal and active marker", async () => {
    const alice = initial(),
      bob = initial("user:bob");
    await persistState(alice);
    await persistState(bob);
    const queued = operation(bob, {
      type: "record_set",
      exerciseId: bob.workout!.exercises[0].id,
      setId: crypto.randomUUID(),
      reps: 8,
      weightKg: 0,
    });
    await journalCommand(queued.next, queued.item);
    const removeItem = vi.fn();
    vi.stubGlobal("localStorage", { getItem: () => "bob", removeItem });
    await eraseOwnerOfflineData(alice.key);
    expect(await offlineDb.states.get(alice.key)).toBeUndefined();
    expect(await ownerCommands(bob.key)).toEqual([queued.item]);
    expect(await offlineDb.states.get(bob.key)).toBeDefined();
    expect(removeItem).not.toHaveBeenCalled();
  });
  it("does not restore deleted chat from a stale private cache write or touch another owner", async () => {
    const before = initial();
    before.assistantSnapshot = { companion: "max", revision: 1, resetRevision: 0 };
    before.messages = [
      { id: "removed", role: "user", text: "Удалённый текст", createdAt: new Date().toISOString() },
    ];
    await persistState(before);
    const deleted = {
      ...before,
      messages: [],
      assistantSnapshot: { companion: "max" as const, revision: 2, resetRevision: 2 },
    };
    await persistState(deleted);
    const stale = await persistState(before);
    expect(stale.messages).toEqual([]);
    expect(stale.assistantSnapshot?.revision).toBe(2);
    const bob = initial("user:bob");
    bob.messages = [
      { id: "bob", role: "user", text: "Личная история Боба", createdAt: new Date().toISOString() },
    ];
    await persistState(bob);
    expect((await offlineDb.states.get(bob.key))?.messages).toHaveLength(1);
    expect((await offlineDb.states.get(before.key))?.messages).toEqual([]);
  });
  it("retains the atomic drop result only in its owner's pending journal across logout", async () => {
    const start = initial();
    start.workout = structuredClone(start.workout!);
    start.workout!.exercises[0].sets = 1;
    start.workout!.exercises[0].dropSet = { kind: "last_set_drop", targetReps: 8 };
    await persistState(start);
    const drop = { reps: 8, weightKg: 7.5 };
    const { next, item } = operation(start, {
      type: "record_set",
      exerciseId: start.workout!.exercises[0].id,
      setId: crypto.randomUUID(),
      reps: 10,
      weightKg: 10,
      drop,
    });
    await journalCommand(next, item);
    vi.stubGlobal("localStorage", { getItem: () => "alice", removeItem: vi.fn() });
    vi.stubGlobal("sessionStorage", { removeItem: vi.fn() });
    await endOfflineSession(start.key);
    expect(await ownerCommands("user:bob")).toEqual([]);
    const retained = await ownerCommands(start.key);
    expect(retained).toHaveLength(1);
    expect(retained[0].envelope.command).toMatchObject({ drop });
  });
  it("retains a terminal assessment in its owner's queue across logout and rebases it after the finish ACK", async () => {
    const start = initial();
    await persistState(start);
    const recorded = operation(
      start,
      {
        type: "record_set",
        exerciseId: start.workout!.exercises[0].id,
        setId: crypto.randomUUID(),
        reps: 8,
        weightKg: 0,
      },
      1,
    );
    const ended = operation(recorded.next, { type: "end_early" }, 2);
    const rated = operation(ended.next, { type: "rate_load", feedback: "too_hard" }, 3);
    for (const item of [recorded, ended, rated]) await journalCommand(item.next, item.item);
    vi.stubGlobal("localStorage", { getItem: () => "alice", removeItem: vi.fn() });
    vi.stubGlobal("sessionStorage", { removeItem: vi.fn() });
    await endOfflineSession(start.key);
    expect(await ownerCommands("user:bob")).toEqual([]);
    expect((await ownerCommands(start.key)).map((item) => item.envelope.command.type)).toEqual([
      "record_set",
      "end_early",
      "rate_load",
    ]);
    await acknowledgeCommand(start.key, recorded.item.id, recorded.next.workout!, start.progress);
    const afterEnd = await acknowledgeCommand(
      start.key,
      ended.item.id,
      ended.next.workout!,
      start.progress,
    );
    expect(afterEnd.state.workout?.loadFeedback).toBe("too_hard");
    expect(afterEnd.pending).toBe(1);
    const accepted = await acknowledgeCommand(
      start.key,
      rated.item.id,
      rated.next.workout!,
      start.progress,
    );
    expect(accepted.pending).toBe(0);
    expect(accepted.state.workout?.loadFeedback).toBe("too_hard");
    expect(accepted.state.progress).toEqual(start.progress);
  });
  it("logout clears confirmed chat while retaining its owner's unsynced workout journal", async () => {
    vi.stubGlobal("localStorage", { getItem: () => "alice", removeItem: vi.fn() });
    vi.stubGlobal("sessionStorage", { removeItem: vi.fn() });
    const start = initial("user:alice");
    start.messages = [
      {
        id: "private-chat",
        role: "assistant",
        text: "Личный разговор",
        createdAt: "2026-10-12T12:00:00.000Z",
      },
    ];
    await persistState(start);
    const recorded = operation(start, {
      type: "record_set",
      exerciseId: start.workout!.exercises[0].id,
      setId: crypto.randomUUID(),
      reps: 10,
      weightKg: 0,
    });
    await journalCommand(recorded.next, recorded.item);
    await endOfflineSession(start.key);
    const retained = await offlineDb.states.get(start.key);
    expect(retained?.messages).toEqual([]);
    expect(retained?.workout?.recordedSets).toHaveLength(1);
    expect(await ownerCommands(start.key)).toHaveLength(1);
    expect(await ownerCommands("user:bob")).toEqual([]);
    expect(await offlineDb.states.get("user:bob")).toBeUndefined();
  });
  it("retains automatic energy and reported corrections across reload/logout until that owner's ACK", async () => {
    const start = initial();
    await persistState(start);
    const recorded = operation(start, {
      type: "record_set",
      exerciseId: start.workout!.exercises[0].id,
      setId: crypto.randomUUID(),
      reps: 10,
      weightKg: 0,
    });
    await journalCommand(recorded.next, recorded.item);
    const end = operation(recorded.next, { type: "end_early" });
    await journalCommand(end.next, end.item);
    expect(end.next.workout!.energyEstimate).toBeDefined();
    const estimate = operation(end.next, {
      type: "estimate_energy",
      bodyWeightKg: 80,
      workload: [{ exerciseId: start.workout!.exercises[0].id, sets: 4, repsPerSet: 12 }],
    });
    await journalCommand(estimate.next, estimate.item);
    const persisted = await offlineDb.states.get(start.key);
    expect(persisted!.workout!.energyEstimate).toEqual(estimate.next.workout!.energyEstimate);
    expect(await ownerCommands("user:bob")).toHaveLength(0);
    vi.stubGlobal("localStorage", { getItem: () => "alice", removeItem: vi.fn() });
    vi.stubGlobal("sessionStorage", { removeItem: vi.fn() });
    await endOfflineSession(start.key);
    expect(await ownerCommands(start.key)).toHaveLength(3);
    const ackProgress = {
      xp: 25,
      completedWorkouts: 0,
      history: [
        {
          id: end.next.workout!.id,
          title: "Partial",
          completedAt: end.next.workout!.completedAt!,
          sets: 1,
          xp: 25,
          energyEstimate: estimate.next.workout!.energyEstimate,
        },
      ],
    };
    await acknowledgeCommand(start.key, recorded.item.id, recorded.next.workout!, start.progress);
    await acknowledgeCommand(start.key, end.item.id, end.next.workout!, ackProgress);
    const accepted = await acknowledgeCommand(
      start.key,
      estimate.item.id,
      estimate.next.workout!,
      ackProgress,
    );
    expect(accepted.pending).toBe(0);
    expect(accepted.state.progress.history[0].energyEstimate).toEqual(
      estimate.next.workout!.energyEstimate,
    );
    expect(accepted.state.progress.xp).toBe(25);
    const replay = await acknowledgeCommand(
      start.key,
      estimate.item.id,
      estimate.next.workout!,
      ackProgress,
    );
    expect(replay.state).toEqual(accepted.state);
  });
  it("retains a partial outcome and skipped marker while sequential ACKs catch up", async () => {
    const state = initial();
    await persistState(state);
    const first = operation(state, {
      type: "record_set",
      exerciseId: state.workout!.exercises[0].id,
      setId: crypto.randomUUID(),
      reps: 7,
      weightKg: 0,
    });
    await journalCommand(first.next, first.item);
    const skip = operation(first.next, {
      type: "skip_exercise",
      exerciseId: state.workout!.exercises[0].id,
    });
    await journalCommand(skip.next, skip.item);
    const end = operation(skip.next, { type: "end_early" });
    await journalCommand(end.next, end.item);
    const early = await acknowledgeCommand(
      state.key,
      first.item.id,
      first.next.workout!,
      state.progress,
    );
    expect(early.state.workout!.status).toBe("partial");
    expect(early.state.workout!.exercises[0].skipped).toBe(true);
    await acknowledgeCommand(state.key, skip.item.id, skip.next.workout!, state.progress);
    const confirmed = {
      ...end.next.workout!,
      reward: {
        policyVersion: "daily-v1" as const,
        day: "2026-10-07",
        timezone: "Europe/Moscow" as const,
        kind: "main" as const,
        eligibleXp: 25,
        awardedXp: 25,
        dayTotalXp: 25,
      },
    };
    const final = await acknowledgeCommand(state.key, end.item.id, confirmed, {
      xp: 25,
      completedWorkouts: 0,
      history: [],
    });
    expect(final.pending).toBe(0);
    expect(final.state.workout!.reward!.awardedXp).toBe(25);
    await acknowledgeCommand(state.key, end.item.id, confirmed, final.state.progress);
    expect((await offlineDb.states.get(state.key))!.progress.xp).toBe(25);
  });
  it("persists timed actuals without converting them to repetitions and replays one ACK", async () => {
    const state = initial();
    state.workout!.exercises[0].metric = "time";
    await persistState(state);
    const timed = operation(state, {
      type: "record_timed_set",
      exerciseId: state.workout!.exercises[0].id,
      setId: crypto.randomUUID(),
      durationSeconds: 37,
    });
    await journalCommand(timed.next, timed.item);
    const [pending] = await ownerCommands(state.key);
    expect(pending.envelope).toEqual(timed.item.envelope);
    expect(timed.next.workout!.recordedSets[0]).toMatchObject({ reps: null, durationSeconds: 37 });
    await acknowledgeCommand(state.key, pending.id, timed.next.workout!, state.progress);
    await acknowledgeCommand(state.key, pending.id, timed.next.workout!, state.progress);
    expect(await ownerCommands(state.key)).toHaveLength(0);
    expect((await offlineDb.states.get(state.key))!.workout!.recordedSets).toHaveLength(1);
    expect(await ownerCommands("user:bob")).toHaveLength(0);
  });
  beforeEach(async () => {
    await offlineDb.states.clear();
    await offlineDb.pending.clear();
    await offlineDb.workoutBackups.clear();
  });
  afterAll(() => offlineDb.close());
  afterEach(() => vi.unstubAllGlobals());
  function storage(initial: Record<string, string> = {}) {
    const values = new Map(Object.entries(initial));
    return {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => {
        values.set(key, value);
      },
      removeItem: (key: string) => {
        values.delete(key);
      },
    };
  }
  it("session expiry retains unconfirmed operations and their snapshot for the same reauthenticated owner", async () => {
    const local = storage({ "miron:account": "alice" });
    vi.stubGlobal("localStorage", local);
    vi.stubGlobal("sessionStorage", storage());
    const alice = initial();
    await persistState(alice);
    const pending = operation(alice, {
      type: "record_set",
      exerciseId: alice.workout!.exercises[0].id,
      setId: crypto.randomUUID(),
      reps: 8,
      weightKg: 0,
    });
    await journalCommand(pending.next, pending.item);
    await endOfflineSession(alice.key);
    expect(local.getItem("miron:account")).toBeNull();
    expect(queueOwnerMatches(alice.key, null)).toBe(false);
    expect((await ownerCommands(alice.key))[0].envelope).toEqual(pending.item.envelope);
    expect((await offlineDb.states.get(alice.key))!.workout).toEqual(pending.next.workout);
    // Reauthentication restores the same journal, including an operation whose HTTP ACK was lost.
    local.setItem("miron:account", "alice");
    expect(queueOwnerMatches(alice.key, "alice")).toBe(true);
    const restored = await ownerCommands("user:alice");
    await acknowledgeCommand(alice.key, restored[0].id, pending.next.workout!, alice.progress);
    expect(await ownerCommands(alice.key)).toHaveLength(0);
    expect((await offlineDb.states.get(alice.key))!.workout!.recordedSets).toHaveLength(1);
  });
  it("a different account neither reads nor resumes the suspended owner's journal", async () => {
    const local = storage({ "miron:account": "bob" });
    vi.stubGlobal("localStorage", local);
    vi.stubGlobal("sessionStorage", storage());
    const alice = initial();
    const bob = initial("user:bob");
    await persistState(alice);
    await persistState(bob);
    const pending = operation(alice, {
      type: "record_set",
      exerciseId: alice.workout!.exercises[0].id,
      setId: crypto.randomUUID(),
      reps: 8,
      weightKg: 0,
    });
    await journalCommand(pending.next, pending.item);
    await endOfflineSession(alice.key);
    expect(local.getItem("miron:account")).toBe("bob");
    expect(queueOwnerMatches(alice.key, "bob")).toBe(false);
    expect(queueOwnerMatches(bob.key, "bob")).toBe(true);
    expect(await ownerCommands(bob.key)).toEqual([]);
    expect((await offlineDb.states.get(bob.key))!.workout!.recordedSets).toHaveLength(0);
    await endOfflineSession(bob.key);
    expect(await offlineDb.states.get(bob.key)).toBeUndefined();
    expect(await ownerCommands(alice.key)).toHaveLength(1);
  });
  it("persists the same operation ID and provisional state before an HTTP response can be lost", async () => {
    const start = initial();
    await persistState(start);
    const op = operation(start, {
      type: "record_set",
      exerciseId: start.workout!.exercises[0].id,
      setId: crypto.randomUUID(),
      reps: 8,
      weightKg: 0,
    });
    await journalCommand(op.next, op.item);
    offlineDb.close();
    await offlineDb.open();
    expect((await ownerCommands(start.key))[0].envelope).toEqual(op.item.envelope);
    expect((await offlineDb.states.get(start.key))!.workout!.recordedSets).toHaveLength(1);
    expect(await ownerCommands("user:bob")).toEqual([]);
  });
  it("rolls back the command if persisting provisional state fails", async () => {
    const start = initial();
    await persistState(start);
    const op = operation(start, {
      type: "record_set",
      exerciseId: start.workout!.exercises[0].id,
      setId: crypto.randomUUID(),
      reps: 8,
      weightKg: 0,
    });
    const fail = vi
      .spyOn(offlineDb.states, "put")
      .mockRejectedValueOnce(new Error("quota exceeded"));
    await expect(journalCommand(op.next, op.item)).rejects.toThrow("quota exceeded");
    fail.mockRestore();
    expect(await ownerCommands(start.key)).toEqual([]);
    expect((await offlineDb.states.get(start.key))!.workout!.revision).toBe(1);
  });
  it("partial acknowledgement preserves later steps and the final ACK becomes authoritative", async () => {
    let state = initial();
    await persistState(state);
    const original = state;
    const steps = [];
    for (let count = 0; count < 2; count++) {
      const op = operation(
        state,
        {
          type: "record_set",
          exerciseId: state.workout!.exercises[0].id,
          setId: crypto.randomUUID(),
          reps: 8,
          weightKg: 0,
        },
        10 - count,
      );
      await journalCommand(op.next, op.item);
      state = op.next;
      steps.push(op);
    }
    const next = operation(state, { type: "next_exercise" }, 1);
    await journalCommand(next.next, next.item);
    state = next.next;
    steps.push(next);
    expect((await ownerCommands(state.key)).map((item) => item.id)).toEqual(
      steps.map((op) => op.item.id),
    );
    const ack1 = await acknowledgeCommand(
      state.key,
      steps[0].item.id,
      steps[0].next.workout!,
      original.progress,
    );
    expect(ack1.pending).toBe(2);
    expect(ack1.state.workout!.currentIndex).toBe(1);
    expect(ack1.state.workout!.recordedSets).toHaveLength(2);
    const profileRefresh = await persistState({
      ...original,
      profile: { ...original.profile, name: "Updated" },
    });
    expect(profileRefresh.workout!.currentIndex).toBe(1);
    await acknowledgeCommand(
      state.key,
      steps[1].item.id,
      steps[1].next.workout!,
      original.progress,
    );
    const canonical = { ...steps[2].next.workout!, subtitle: "Server confirmed" };
    const final = await acknowledgeCommand(
      state.key,
      steps[2].item.id,
      canonical,
      original.progress,
    );
    expect(final.pending).toBe(0);
    expect(final.state.workout).toEqual(canonical);
    const replay = await acknowledgeCommand(
      state.key,
      steps[0].item.id,
      steps[0].next.workout!,
      original.progress,
    );
    expect(replay.state.workout).toEqual(canonical);
  });
  it("two windows at the same revision accept one journal entry and never lose the state", async () => {
    const start = initial();
    await persistState(start);
    const command = () => ({
      type: "record_set" as const,
      exerciseId: start.workout!.exercises[0].id,
      setId: crypto.randomUUID(),
      reps: 8,
      weightKg: 0,
    });
    const first = operation(start, command());
    const second = operation(start, command());
    const results = await Promise.allSettled([
      journalCommand(first.next, first.item),
      journalCommand(second.next, second.item),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(await ownerCommands(start.key)).toHaveLength(1);
    expect((await offlineDb.states.get(start.key))!.workout!.recordedSets).toHaveLength(1);
  });
});
