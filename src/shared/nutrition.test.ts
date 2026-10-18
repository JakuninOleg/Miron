import { describe, expect, it } from "vitest";
import {
  DEFAULT_NUTRITION,
  FOOD_CATALOG,
  POPULAR_DISHES,
  dishNutrients,
  menuIdeas,
} from "./nutrition";
describe("nutrition estimates", () => {
  it("calculates a recipe from pinned food codes and keeps missing information unknown", () => {
    const porridge = POPULAR_DISHES.find((dish) => dish.id === "porridge-banana")!;
    expect(dishNutrients(porridge, 350)?.kcal).toBeCloseTo(47 * 2.5 + 81);
    expect(dishNutrients({ ...porridge, per100g: null }, 350)).toBeNull();
    expect(new Set(FOOD_CATALOG.map((food) => food.code)).size).toBe(FOOD_CATALOG.length);
    expect(
      POPULAR_DISHES.every((dish) =>
        dish.foodIds.every((id) => FOOD_CATALOG.some((food) => food.id === id)),
      ),
    ).toBe(true);
  });
  it("varies general meal ideas and excludes related preparations, not only exact IDs", () => {
    const preferences = {
      ...DEFAULT_NUTRITION,
      vegetarian: true,
      excludedFoods: ["oats", "pasta"],
    };
    for (let day = 1; day <= 14; day++) {
      const ideas = menuIdeas(preferences, `2026-10-${String(day).padStart(2, "0")}`);
      expect(
        ideas.every(
          (meal) =>
            meal.dish.vegetarian &&
            !meal.dish.foodIds.some((id) => ["porridge", "oats", "pasta"].includes(id)),
        ),
      ).toBe(true);
    }
    const days = new Set(
      [1, 2, 3, 4].map((day) =>
        JSON.stringify(menuIdeas(DEFAULT_NUTRITION, `2026-10-0${day}`).map((meal) => meal.dish.id)),
      ),
    );
    expect(days.size).toBeGreaterThan(1);
  });
});
