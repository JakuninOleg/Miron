import { describe, expect, it } from "vitest";
import { resourcesSatisfy } from "../server/domain/catalog";
import type { BuilderInventory, BuilderResourceOption } from "./workout-builder";
import {
  asksForInventory,
  cardSelected,
  inventoryCards,
  relevantInventoryCards,
  standardGymResources,
  toggleInventoryCard,
} from "./workout-inventory";

const options: BuilderResourceOption[] = [
  ...new Set(inventoryCards.flatMap((card) => card.codes)),
  "leg_press_machine",
  "machine_integrated_support",
  "solid_doorframe",
].map((code) => ({
  code,
  name: code,
  kind: "equipment",
  requiresConfirmation:
    code === "verified_secure_bar_mounting" || code === "machine_integrated_support",
}));
const card = (id: string) => inventoryCards.find((item) => item.id === id)!;

describe("contextual inventory choices", () => {
  it("single/pair choices stay mutually exclusive and quantities gate actual exercise eligibility", () => {
    const yoga: BuilderInventory["resources"] = [
      { code: "yoga_block", quantity: 2, isStable: null },
    ];
    let selected = toggleInventoryCard(yoga, card("dumbbell-single"), options);
    expect(
      relevantInventoryCards("strength", "home", options, selected).map((item) => item.id),
    ).not.toContain("dumbbell-pair");
    const requirement = [{ code: "dumbbell", quantity: 2, requiresConfirmation: false }];
    expect(
      resourcesSatisfy(
        requirement,
        selected.map((item) => ({ ...item, confirmedAt: null })),
      ),
    ).toBe(false);
    selected = toggleInventoryCard(selected, card("dumbbell-single"), options);
    expect(
      relevantInventoryCards("strength", "home", options, selected).map((item) => item.id),
    ).toContain("dumbbell-pair");
    selected = toggleInventoryCard(selected, card("dumbbell-pair"), options);
    expect(cardSelected(card("dumbbell-single"), selected)).toBe(false);
    expect(
      resourcesSatisfy(
        requirement,
        selected.map((item) => ({ ...item, confirmedAt: null })),
      ),
    ).toBe(true);
    expect(selected).toContainEqual(yoga[0]);
    expect(selected.filter((item) => item.code === "dumbbell")).toHaveLength(1);
  });
  it("kettlebells use the same exclusive single/pair behavior", () => {
    const selected = toggleInventoryCard([], card("kettlebell-pair"), options);
    expect(selected).toEqual([{ code: "kettlebell", quantity: 2, isStable: null }]);
    expect(
      relevantInventoryCards("strength", "home", options, selected).map((item) => item.id),
    ).not.toContain("kettlebell-single");
  });
  it("yoga does not offer weights and calisthenics offers its own equipment", () => {
    const yoga = relevantInventoryCards("yoga", "home", options, []);
    expect(yoga.map((item) => item.id)).toEqual([
      "mat",
      "block",
      "yoga-strap",
      "bolster",
      "blanket",
    ]);
    const cali = relevantInventoryCards("calisthenics", "workout_park", options, []);
    expect(cali.map((item) => item.id)).toEqual(
      expect.arrayContaining(["vest", "belt", "backpack", "rings", "bars"]),
    );
    expect(cali.some((item) => item.art === "dumbbell" || item.art === "block")).toBe(false);
    expect(relevantInventoryCards("yoga", "home", [], [])).toEqual([]);
  });
  it("selecting a home bar does not silently confirm its mounting", () => {
    const selected = toggleInventoryCard([], card("pullup"), options);
    expect(selected).toContainEqual({
      code: "verified_secure_bar_mounting",
      quantity: 1,
      isStable: false,
    });
    expect(
      resourcesSatisfy(
        [{ code: "verified_secure_bar_mounting", quantity: 1, requiresConfirmation: true }],
        selected.map((item) => ({ ...item, confirmedAt: null })),
      ),
    ).toBe(false);
  });
  it("gym has standard weights/machines without home props; outdoor strength skips inventory", () => {
    expect(asksForInventory("gym", "strength")).toBe(false);
    expect(asksForInventory("outdoor", "strength")).toBe(false);
    expect(asksForInventory("home", "strength")).toBe(true);
    expect(asksForInventory("workout_park", "calisthenics")).toBe(true);
    const gym = standardGymResources(options);
    expect(gym).toEqual(
      expect.arrayContaining([
        { code: "dumbbell", quantity: 2, isStable: null },
        { code: "leg_press_machine", quantity: 1, isStable: null },
      ]),
    );
    expect(
      gym.some((item) => ["yoga_block", "weighted_vest", "solid_doorframe"].includes(item.code)),
    ).toBe(false);
  });
});
