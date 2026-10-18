import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { closeDb, getDb } from "../db";
import { profiles, user, trials } from "../db/schema";
import { applyNutritionCommand, getNutrition } from "./nutrition";
import { getProgress } from "./profile";
if (existsSync(".env.local")) process.loadEnvFile(".env.local");
describe.runIf(process.env.RUN_DB_TESTS === "true")("nutrition account data", () => {
  const alice = randomUUID(),
    bob = randomUUID();
  const date = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Moscow" }).format(new Date());
  let created = false;
  beforeAll(async () => {
    const url = new URL(process.env.DATABASE_URL ?? "");
    if (
      !["localhost", "127.0.0.1"].includes(url.hostname) ||
      url.port !== "55432" ||
      url.pathname !== "/miron"
    )
      throw new Error("Nutrition fixtures require local PostgreSQL:55432/miron.");
    await getDb()
      .insert(user)
      .values(
        [alice, bob].map((id) => ({
          id,
          name: "Nutrition fixture",
          email: `${id}@example.test`,
          emailVerified: true,
        })),
      );
    created = true;
    await getDb()
      .insert(trials)
      .values([alice, bob].map((userId) => ({ userId })));
    await getDb()
      .insert(profiles)
      .values(
        [alice, bob].map((id) => ({ userId: id, adultConfirmed: true, onboardingCompleted: true })),
      );
  });
  afterAll(async () => {
    if (created)
      await getDb()
        .delete(user)
        .where(inArray(user.id, [alice, bob]));
    await closeDb();
  });
  it("separates menu from eaten snapshots, replays once, handles unknown calories and isolates owners", async () => {
    const initial = await getNutrition(alice, date);
    expect(initial.day.entries).toEqual([]);
    const preferences = { ...initial.preferences, vegetarian: true, excludedFoods: ["oats"] };
    const pref = {
      type: "preferences",
      operationId: randomUUID(),
      expectedRevision: 0,
      preferences,
    };
    const [one, retry] = await Promise.all([
      applyNutritionCommand(alice, pref),
      applyNutritionCommand(alice, pref),
    ]);
    expect(retry).toEqual(one);
    await applyNutritionCommand(alice, {
      type: "suggest_menu",
      operationId: randomUUID(),
      expectedRevision: 0,
      date,
      generalFoodOnly: true,
    });
    let state = await getNutrition(alice, date);
    expect(state.day.entries).toEqual([]);
    expect(
      state.day.planned.every(
        (meal) => meal.dish.vegetarian && !meal.dish.foodIds.includes("porridge"),
      ),
    ).toBe(true);
    const meal = state.day.planned[0];
    const log = {
      type: "log_food",
      operationId: randomUUID(),
      expectedRevision: state.day.revision,
      date,
      selection: { source: "planned", id: meal.id },
      mode: "rough",
      grams: 300,
    };
    await Promise.all([applyNutritionCommand(alice, log), applyNutritionCommand(alice, log)]);
    state = await getNutrition(alice, date);
    expect(state.day.entries).toHaveLength(1);
    expect((await getNutrition(bob, date)).day.entries).toEqual([]);
    await expect(
      applyNutritionCommand(bob, { ...log, operationId: randomUUID(), expectedRevision: 0 }),
    ).rejects.toMatchObject({ code: "DISH_NOT_FOUND" });
    await expect(applyNutritionCommand(alice, { ...log, grams: 400 })).rejects.toMatchObject({
      code: "OPERATION_REUSED",
    });
    const dishOp = randomUUID();
    await applyNutritionCommand(alice, {
      type: "save_dish",
      operationId: dishOp,
      expectedRevision: state.revision,
      name: "Домашний суп",
      ingredients: "Свой рецепт",
      portionGrams: 300,
      per100g: null,
      vegetarian: true,
    });
    await applyNutritionCommand(alice, {
      type: "log_food",
      operationId: randomUUID(),
      expectedRevision: state.day.revision,
      date,
      selection: { source: "library", id: dishOp },
      mode: "rough",
      grams: 300,
    });
    state = await getNutrition(alice, date);
    expect(state.day.entries[1].nutrients).toBeNull();
    const savedEntries = state.day.entries;
    await applyNutritionCommand(alice, {
      type: "save_dish",
      operationId: randomUUID(),
      id: dishOp,
      expectedRevision: state.revision,
      name: "Суп с уточнённой этикеткой",
      ingredients: "Свой рецепт",
      portionGrams: 300,
      per100g: { kcal: 80, protein: 3, fat: 2, carbs: 12 },
      vegetarian: true,
    });
    state = await getNutrition(alice, date);
    expect(state.day.entries).toEqual(savedEntries);
    await applyNutritionCommand(alice, {
      type: "preferences",
      operationId: randomUUID(),
      expectedRevision: state.revision,
      preferences: { ...preferences, mode: "precise" },
    });
    state = await getNutrition(alice, date);
    expect(state.day.entries).toEqual(savedEntries);
    await applyNutritionCommand(alice, {
      type: "replace_meal",
      operationId: randomUUID(),
      date,
      expectedRevision: state.day.revision,
      mealId: meal.id,
      dishId: dishOp,
    });
    expect((await getNutrition(alice, date)).day.entries).toEqual(savedEntries);
    await expect(
      applyNutritionCommand(alice, { ...log, operationId: randomUUID(), expectedRevision: 0 }),
    ).rejects.toMatchObject({ code: "REVISION_CONFLICT" });
    expect((await getProgress(alice)).xp).toBe(0);
    await getDb().update(user).set({ status: "deleting" }).where(eq(user.id, bob));
    await expect(
      applyNutritionCommand(bob, { ...pref, operationId: randomUUID() }),
    ).rejects.toMatchObject({ code: "ACCOUNT_UNAVAILABLE" });
  });
});
