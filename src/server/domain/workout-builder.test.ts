import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { builderCatalogInput, builderInventoryInput, customWorkoutInput } from "./workout-builder";

describe("manual workout input boundary", () => {
  const valid = () => ({
    operationId: randomUUID(),
    id: randomUUID(),
    expectedRevision: 0,
    name: "Мой вечер",
    place: "home",
    direction: "strength",
    inventoryRevision: 1,
    steps: [{ revisionId: randomUUID(), sets: 3, target: 12, restSeconds: 60 }],
  });
  it("rejects forged authority and bounds template/step parameters", () => {
    expect(customWorkoutInput.safeParse(valid()).success).toBe(true);
    for (const value of [
      { name: " " },
      { name: "x".repeat(81) },
      { awardedXp: 50 },
      { ownerId: randomUUID() },
      { estimate: { maxSeconds: 1 } },
      { steps: [] },
      { steps: Array.from({ length: 41 }, () => valid().steps[0]) },
    ])
      expect(customWorkoutInput.safeParse({ ...valid(), ...value }).success).toBe(false);
    for (const field of [
      { sets: 0 },
      { sets: 11 },
      { target: 0 },
      { target: 601 },
      { restSeconds: 601 },
      { weightKg: 100 },
    ]) {
      const input = valid();
      expect(
        customWorkoutInput.safeParse({ ...input, steps: [{ ...input.steps[0], ...field }] })
          .success,
      ).toBe(false);
    }
  });
  it("distinguishes explicitly confirmed empty inventory and rejects ambiguous duplicates", () => {
    const base = { operationId: randomUUID(), expectedRevision: 0, place: "home", resources: [] };
    expect(builderInventoryInput.safeParse(base).success).toBe(true);
    const resource = { code: "dumbbell", quantity: 2, isStable: null };
    expect(
      builderInventoryInput.safeParse({ ...base, resources: [resource, resource] }).success,
    ).toBe(false);
    expect(
      builderInventoryInput.safeParse({ ...base, resources: [{ ...resource, quantity: 0 }] })
        .success,
    ).toBe(false);
    expect(builderInventoryInput.safeParse({ ...base, place: "other" }).success).toBe(false);
  });
  it("bounds catalog pagination/search and allows only real muscle/filter keys", () => {
    const base = { place: "home", direction: "strength" };
    expect(
      builderCatalogInput.parse({ ...base, page: "2", muscle: "quads", equipment: "free_weights" })
        .page,
    ).toBe(2);
    for (const addition of [
      { page: 0 },
      { page: 101 },
      { search: "x".repeat(101) },
      { muscle: "unknown" },
      { equipment: "unknown" },
      { ownerId: randomUUID() },
    ])
      expect(builderCatalogInput.safeParse({ ...base, ...addition }).success).toBe(false);
  });
});
