import { describe, expect, it } from "vitest";
import {
  accountStoryStorageKey,
  parseAccountStoryDraft,
  parseStoryPreview,
  serializeAccountStoryDraft,
} from "./story-preview";
import type { CompleteOnboardingInput } from "@/shared/onboarding";

describe("story preview persistence boundary", () => {
  it("recovers from malformed browser preferences", () => {
    expect(parseStoryPreview("{broken").completed).toBe(false);
    expect(parseStoryPreview("null").step).toBe(0);
  });
  it("bounds steps, filters choices and cannot finish without a coach", () => {
    expect(
      parseStoryPreview(
        JSON.stringify({
          step: 10000,
          interests: ["strength", "strength", "injected", 4],
          completed: true,
          companion: "other",
        }),
      ),
    ).toEqual({
      step: 4,
      interests: ["strength"],
      locations: [],
      companion: null,
      completed: false,
    });
  });
  it("preserves only preview fields, never imports account/training state", () => {
    expect(
      parseStoryPreview(
        JSON.stringify({
          step: 6,
          flowVersion: 3,
          companion: "lika",
          interests: ["yoga"],
          completed: true,
          xp: 5000,
          ownerId: "someone",
          token: "ignored",
        }),
      ),
    ).toEqual({ step: 6, companion: "lika", interests: ["yoga"], locations: [], completed: true });
  });
  it.each([
    [4, 4],
    [5, 4],
    [6, 5],
    [7, 6],
  ])("migrates legacy step %i to %i after removing the location scene", (oldStep, newStep) => {
    expect(parseStoryPreview(JSON.stringify({ step: oldStep, companion: "max" })).step).toBe(
      newStep,
    );
  });
  it.each([4, 5, 6])("does not shift current flow step %i on reload", (step) => {
    expect(
      parseStoryPreview(JSON.stringify({ step, companion: "lika", flowVersion: 3 })).step,
    ).toBe(step);
  });
});

describe("account onboarding staging boundary", () => {
  const alice = "11111111-1111-4111-8111-111111111111";
  const bob = "22222222-2222-4222-8222-222222222222";
  const preferences = { companion: "max" as const, interests: ["strength"] };
  const state = {
    step: 6,
    companion: "lika" as const,
    interests: ["yoga"],
    locations: [],
    completed: true,
  };

  it("uses separate keys and rejects another owner's staged selections", () => {
    expect(accountStoryStorageKey(alice)).not.toBe(accountStoryStorageKey(bob));
    expect(accountStoryStorageKey(alice)).not.toBe("miron:story-preview:v2");
    const raw = serializeAccountStoryDraft(alice, state, null);
    expect(parseAccountStoryDraft(raw, bob, preferences)).toEqual({
      state: {
        step: 0,
        companion: "max",
        interests: ["strength"],
        locations: [],
        completed: false,
      },
      pendingCompletion: null,
    });
    expect(parseAccountStoryDraft(JSON.stringify(state), alice, preferences).state.step).toBe(0);
  });

  it("restores only staged choices and never trusts a browser completion flag", () => {
    const raw = JSON.stringify({
      ...JSON.parse(serializeAccountStoryDraft(alice, state, null)),
      completed: true,
      progress: { xp: 8000 },
      trial: { repliesUsed: 0 },
    });
    expect(parseAccountStoryDraft(raw, alice, preferences)).toEqual({
      state: { ...state, completed: false },
      pendingCompletion: null,
    });
  });

  it("resumes an uncertain submission with the same operation ID and exact choices", () => {
    const pendingCompletion: CompleteOnboardingInput = {
      operationId: "33333333-3333-4333-8333-333333333333",
      companion: "lika",
      interests: ["yoga", "explore"],
      adultConfirmed: true,
    };
    const raw = serializeAccountStoryDraft(
      alice,
      { ...state, step: 2, companion: "max" },
      pendingCompletion,
    );
    const restored = parseAccountStoryDraft(raw, alice, preferences);
    expect(restored.pendingCompletion).toEqual(pendingCompletion);
    expect(restored.state).toMatchObject({
      step: 6,
      companion: "lika",
      interests: ["yoga", "explore"],
      completed: false,
    });
  });

  it.each([
    { operationId: "invalid" },
    { adultConfirmed: false },
    { companion: "other" },
    { interests: ["yoga", "unknown"] },
    { interests: ["yoga", "yoga"] },
  ])("rejects a malformed pending payload %j", (change) => {
    const raw = JSON.stringify({
      ...JSON.parse(serializeAccountStoryDraft(alice, state, null)),
      pendingCompletion: {
        operationId: "33333333-3333-4333-8333-333333333333",
        companion: "lika",
        interests: ["yoga"],
        adultConfirmed: true,
        ...change,
      },
    });
    expect(parseAccountStoryDraft(raw, alice, preferences).pendingCompletion).toBeNull();
  });
});
