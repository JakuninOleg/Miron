import { createHash } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "../db";
import { builderCommands, nutritionDays, nutritionProfiles, profiles, user } from "../db/schema";
import {
  DEFAULT_NUTRITION,
  FOOD_CATALOG,
  POPULAR_DISHES,
  dishNutrients,
  menuIdeas,
  type Dish,
  type NutritionState,
} from "../../shared/nutrition";
import { validCalendarDate } from "../../shared/calendar";
import { DomainError } from "./errors";
import { assertProductAccess } from "./access";
const revision = z.number().int().min(0).max(1_000_000);
const dateInput = z.string().refine(validCalendarDate);
const foodIds = z
  .array(z.string().refine((id) => FOOD_CATALOG.some((food) => food.id === id)))
  .max(16)
  .refine((ids) => new Set(ids).size === ids.length);
export const nutritionPreferencesInput = z
  .strictObject({
    mode: z.enum(["rough", "precise", "hidden"]),
    likedFoods: foodIds,
    excludedFoods: foodIds,
    vegetarian: z.boolean(),
  })
  .refine((value) => !value.likedFoods.some((id) => value.excludedFoods.includes(id)));
const dishId = z.string().min(1).max(80);
const nutrients = z.strictObject({
  kcal: z.number().finite().min(0).max(1000),
  protein: z.number().finite().min(0).max(100),
  fat: z.number().finite().min(0).max(100),
  carbs: z.number().finite().min(0).max(100),
});
const profileCommand = { operationId: z.uuid(), expectedRevision: revision };
const dayCommand = { ...profileCommand, date: dateInput };
export const nutritionCommandInput = z.discriminatedUnion("type", [
  z.strictObject({
    ...profileCommand,
    type: z.literal("preferences"),
    preferences: nutritionPreferencesInput,
  }),
  z.strictObject({
    ...profileCommand,
    type: z.literal("save_dish"),
    id: z.uuid().optional(),
    name: z.string().trim().min(1).max(80),
    ingredients: z.string().trim().min(1).max(1000),
    portionGrams: z.number().int().min(10).max(2000),
    per100g: nutrients.nullable(),
    vegetarian: z.boolean(),
  }),
  z.strictObject({ ...profileCommand, type: z.literal("delete_dish"), id: z.uuid() }),
  z.strictObject({
    ...dayCommand,
    type: z.literal("suggest_menu"),
    generalFoodOnly: z.literal(true),
  }),
  z.strictObject({
    ...dayCommand,
    type: z.literal("replace_meal"),
    mealId: z.string().max(80),
    dishId,
  }),
  z.strictObject({
    ...dayCommand,
    type: z.literal("add_meal"),
    label: z.enum(["Завтрак", "Обед", "Ужин", "Перекус"]),
    dishId,
  }),
  z.strictObject({ ...dayCommand, type: z.literal("remove_meal"), mealId: z.string().max(80) }),
  z.strictObject({
    ...dayCommand,
    type: z.literal("log_food"),
    selection: z.strictObject({ source: z.enum(["planned", "library"]), id: dishId }),
    grams: z.number().int().min(1).max(5000),
    mode: z.enum(["rough", "precise"]),
  }),
  z.strictObject({
    ...dayCommand,
    type: z.literal("edit_entry"),
    entryId: z.uuid(),
    grams: z.number().int().min(1).max(5000),
    mode: z.enum(["rough", "precise"]),
  }),
  z.strictObject({ ...dayCommand, type: z.literal("remove_entry"), entryId: z.uuid() }),
]);
type Reader = Pick<ReturnType<typeof getDb>, "select">;
export async function getNutrition(
  owner: string,
  date: string,
  reader: Reader = getDb(),
): Promise<NutritionState> {
  dateInput.parse(date);
  const [profile] = await reader
    .select()
    .from(nutritionProfiles)
    .where(eq(nutritionProfiles.userId, owner));
  const [day] = await reader
    .select()
    .from(nutritionDays)
    .where(and(eq(nutritionDays.userId, owner), eq(nutritionDays.date, date)));
  return {
    revision: profile?.revision ?? 0,
    preferences: profile?.preferences ?? DEFAULT_NUTRITION,
    dishes: profile?.dishes ?? [],
    day: {
      date,
      revision: day?.revision ?? 0,
      planned: day?.planned ?? [],
      entries: day?.entries ?? [],
    },
  };
}
export async function applyNutritionCommand(owner: string, raw: unknown) {
  const input = nutritionCommandInput.parse(raw);
  const hash = createHash("sha256")
    .update(JSON.stringify({ action: "nutrition", input }))
    .digest("hex");
  return getDb().transaction(async (tx) => {
    const [principal] = await tx
      .select({ status: user.status })
      .from(user)
      .where(eq(user.id, owner))
      .for("update");
    if (principal?.status !== "active")
      throw new DomainError("ACCOUNT_UNAVAILABLE", 403, "Аккаунт недоступен.");
    const [replay] = await tx
      .select()
      .from(builderCommands)
      .where(
        and(eq(builderCommands.userId, owner), eq(builderCommands.operationId, input.operationId)),
      );
    if (replay) {
      if (replay.payloadHash !== hash)
        throw new DomainError(
          "OPERATION_REUSED",
          409,
          "Запрос уже использован для другого действия.",
        );
      return replay.result;
    }
    const [account] = await tx.select().from(profiles).where(eq(profiles.userId, owner));
    if (["save_dish", "suggest_menu", "replace_meal", "add_meal", "log_food"].includes(input.type))
      await assertProductAccess(owner, tx);
    if (!account?.adultConfirmed || !account.onboardingCompleted)
      throw new DomainError("ONBOARDING_REQUIRED", 409, "Сначала заверши знакомство.");
    const state = await getNutrition(
      owner,
      "date" in input ? input.date : new Date().toISOString().slice(0, 10),
      tx,
    );
    const library = [...POPULAR_DISHES, ...state.dishes];
    const findDish = (id: string) => {
      const dish = library.find((item) => item.id === id);
      if (!dish)
        throw new DomainError("DISH_NOT_FOUND", 404, "Блюдо не найдено в твоей библиотеке.");
      return dish;
    };
    let receipt: { revision: number; date?: string };
    if (
      input.type === "preferences" ||
      input.type === "save_dish" ||
      input.type === "delete_dish"
    ) {
      if (state.revision !== input.expectedRevision)
        throw new DomainError(
          "REVISION_CONFLICT",
          409,
          "Настройки питания изменились. Обнови страницу.",
        );
      let dishes = state.dishes;
      if (input.type === "save_dish") {
        if (input.id && !dishes.some((dish) => dish.id === input.id))
          throw new DomainError("DISH_NOT_FOUND", 404, "Блюдо не найдено.");
        if (!input.id && dishes.length >= 50)
          throw new DomainError("DISH_LIMIT", 409, "В библиотеке уже 50 своих блюд.");
        const saved: Dish = {
          id: input.id ?? input.operationId,
          name: input.name,
          ingredients: input.ingredients,
          portionGrams: input.portionGrams,
          per100g: input.per100g,
          vegetarian: input.vegetarian,
          source: "user_label",
          meal: "main",
          foodIds: [],
          allergens: null,
        };
        dishes = input.id
          ? dishes.map((dish) => (dish.id === input.id ? saved : dish))
          : [...dishes, saved];
      }
      if (input.type === "delete_dish") {
        if (!dishes.some((dish) => dish.id === input.id))
          throw new DomainError("DISH_NOT_FOUND", 404, "Блюдо не найдено.");
        dishes = dishes.filter((dish) => dish.id !== input.id);
      }
      const preferences = input.type === "preferences" ? input.preferences : state.preferences;
      const next = { revision: state.revision + 1, preferences, dishes, updatedAt: new Date() };
      await tx
        .insert(nutritionProfiles)
        .values({ userId: owner, ...next })
        .onConflictDoUpdate({ target: nutritionProfiles.userId, set: next });
      receipt = { revision: next.revision };
    } else {
      if (state.day.revision !== input.expectedRevision)
        throw new DomainError("REVISION_CONFLICT", 409, "День уже изменился. Обнови записи.");
      let planned = state.day.planned;
      let entries = state.day.entries;
      if (input.type === "suggest_menu") {
        planned = menuIdeas(state.preferences, input.date).map((meal, index) => ({
          ...meal,
          id: `${input.operationId}-${index}`,
        }));
        if (!planned.length)
          throw new DomainError(
            "MENU_UNAVAILABLE",
            409,
            "Не хватает блюд под эти предпочтения. Добавь подходящие вручную или измени исключения.",
          );
      }
      if (input.type === "add_meal") {
        if (planned.length >= 8)
          throw new DomainError(
            "MEAL_LIMIT",
            409,
            "В этом дне уже восемь запланированных приёмов пищи.",
          );
        planned = [
          ...planned,
          { id: input.operationId, label: input.label, dish: findDish(input.dishId) },
        ];
      }
      if (input.type === "replace_meal" || input.type === "remove_meal") {
        if (!planned.some((meal) => meal.id === input.mealId))
          throw new DomainError("MEAL_NOT_FOUND", 404, "Приём пищи не найден.");
        planned =
          input.type === "remove_meal"
            ? planned.filter((meal) => meal.id !== input.mealId)
            : planned.map((meal) =>
                meal.id === input.mealId ? { ...meal, dish: findDish(input.dishId) } : meal,
              );
      }
      if (input.type === "log_food") {
        const todayParts = new Intl.DateTimeFormat("en-CA", {
          timeZone: account.timezone,
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
        }).formatToParts(new Date());
        const today = ["year", "month", "day"]
          .map((part) => todayParts.find((value) => value.type === part)?.value)
          .join("-");
        if (input.date > today)
          throw new DomainError(
            "FUTURE_FOOD",
            400,
            "Съеденное записываем за сегодня или прошлые дни.",
          );
        if (entries.length >= 40)
          throw new DomainError("FOOD_DAY_LIMIT", 409, "В этом дне уже 40 записей.");
        const selected = input.selection;
        const dish =
          selected.source === "planned"
            ? planned.find((meal) => meal.id === selected.id)?.dish
            : findDish(selected.id);
        if (!dish) throw new DomainError("DISH_NOT_FOUND", 404, "Блюдо не найдено.");
        entries = [
          ...entries,
          {
            id: input.operationId,
            ...(selected.source === "planned" ? { plannedMealId: selected.id } : {}),
            dish,
            grams: input.grams,
            mode: input.mode,
            nutrients: dishNutrients(dish, input.grams),
            loggedAt: new Date().toISOString(),
          },
        ];
      }
      if (input.type === "edit_entry" || input.type === "remove_entry") {
        if (!entries.some((entry) => entry.id === input.entryId))
          throw new DomainError("FOOD_ENTRY_NOT_FOUND", 404, "Запись не найдена.");
        entries =
          input.type === "remove_entry"
            ? entries.filter((entry) => entry.id !== input.entryId)
            : entries.map((entry) =>
                entry.id === input.entryId
                  ? {
                      ...entry,
                      grams: input.grams,
                      mode: input.mode,
                      nutrients: dishNutrients(entry.dish, input.grams),
                    }
                  : entry,
              );
      }
      const next = { revision: state.day.revision + 1, planned, entries, updatedAt: new Date() };
      await tx
        .insert(nutritionDays)
        .values({ userId: owner, date: input.date, ...next })
        .onConflictDoUpdate({ target: [nutritionDays.userId, nutritionDays.date], set: next });
      receipt = { revision: next.revision, date: input.date };
    }
    await tx.insert(builderCommands).values({
      userId: owner,
      operationId: input.operationId,
      payloadHash: hash,
      result: receipt,
    });
    return receipt;
  });
}
