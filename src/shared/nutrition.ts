import foods from "./data/cofid-foods.json";
export const NUTRITION_SOURCE =
  "https://www.gov.uk/government/publications/composition-of-foods-integrated-dataset-cofid";
export const FOOD_CATALOG = foods;
export interface Nutrients {
  kcal: number;
  protein: number;
  fat: number;
  carbs: number;
}
export interface Dish {
  id: string;
  name: string;
  ingredients: string;
  foodIds: string[];
  allergens: string[] | null;
  portionGrams: number;
  per100g: Nutrients | null;
  source: "cofid-recipe-v1" | "user_label";
  meal: "breakfast" | "main" | "snack";
  vegetarian: boolean;
}
function recipe(id: string, name: string, meal: Dish["meal"], parts: [string, number][]): Dish {
  const weight = parts.reduce((sum, part) => sum + part[1], 0);
  const per100g: Nutrients = { kcal: 0, protein: 0, fat: 0, carbs: 0 };
  for (const [key, grams] of parts) {
    const food = foods.find((item) => item.id === key);
    if (!food) throw new Error(`Unknown recipe food: ${key}`);
    for (const nutrient of Object.keys(per100g) as (keyof Nutrients)[])
      per100g[nutrient] += (food.per100g[nutrient] * grams) / weight;
  }
  return {
    id,
    name,
    meal,
    portionGrams: weight,
    per100g,
    source: "cofid-recipe-v1",
    foodIds: parts.map(([key]) => key),
    ingredients: parts
      .map(([key, grams]) => `${foods.find((item) => item.id === key)!.name} — ${grams} г`)
      .join("; "),
    allergens: [
      ...new Set(parts.flatMap(([key]) => foods.find((item) => item.id === key)!.allergens)),
    ],
    vegetarian: !parts.some(([key]) => ["chicken", "salmon"].includes(key)),
  };
}
export const POPULAR_DISHES: Dish[] = [
  recipe("porridge-banana", "Каша с бананом", "breakfast", [
    ["porridge", 250],
    ["banana", 100],
  ]),
  recipe("egg-toast", "Тост с яйцом и томатами", "breakfast", [
    ["bread", 60],
    ["egg", 100],
    ["tomato", 100],
  ]),
  recipe("yogurt-banana", "Йогурт с бананом", "snack", [
    ["yogurt", 150],
    ["banana", 100],
  ]),
  recipe("chicken-rice", "Рис с курицей и овощами", "main", [
    ["rice", 160],
    ["chicken", 120],
    ["tomato", 100],
    ["cucumber", 100],
    ["oil", 5],
  ]),
  recipe("salmon-potato", "Лосось с картофелем", "main", [
    ["salmon", 120],
    ["potato", 180],
    ["cucumber", 100],
  ]),
  recipe("pasta-tomato", "Паста с томатами", "main", [
    ["pasta", 200],
    ["tomato", 150],
    ["oil", 10],
  ]),
  recipe("lentil-bowl", "Чечевица с овощами", "main", [
    ["lentils", 200],
    ["tomato", 100],
    ["cucumber", 100],
    ["oil", 10],
  ]),
  recipe("tofu-rice", "Рис с тофу", "main", [
    ["tofu", 150],
    ["rice", 160],
    ["tomato", 100],
    ["oil", 5],
  ]),
  recipe("potato-egg", "Картофель с яйцом и салатом", "main", [
    ["potato", 200],
    ["egg", 100],
    ["cucumber", 100],
    ["oil", 5],
  ]),
];
export interface NutritionPreferences {
  mode: "rough" | "precise" | "hidden";
  likedFoods: string[];
  excludedFoods: string[];
  vegetarian: boolean;
}
export const DEFAULT_NUTRITION: NutritionPreferences = {
  mode: "rough",
  likedFoods: [],
  excludedFoods: [],
  vegetarian: false,
};
export interface MealPlanItem {
  id: string;
  label: string;
  dish: Dish;
}
export interface FoodEntry {
  plannedMealId?: string;
  id: string;
  dish: Dish;
  grams: number;
  mode: "rough" | "precise";
  nutrients: Nutrients | null;
  loggedAt: string;
}
export interface NutritionState {
  revision: number;
  preferences: NutritionPreferences;
  dishes: Dish[];
  day: { date: string; revision: number; planned: MealPlanItem[]; entries: FoodEntry[] };
}
export function dishNutrients(dish: Dish, grams: number): Nutrients | null {
  if (!dish.per100g) return null;
  const amount = (value: number) => Math.round(value * grams) / 100;
  return {
    kcal: amount(dish.per100g.kcal),
    protein: amount(dish.per100g.protein),
    fat: amount(dish.per100g.fat),
    carbs: amount(dish.per100g.carbs),
  };
}
export function menuIdeas(preferences: NutritionPreferences, date: string): MealPlanItem[] {
  const family = (id: string) => (id === "porridge" ? "oats" : id);
  const eligible = POPULAR_DISHES.filter(
    (dish) =>
      (!preferences.vegetarian || dish.vegetarian) &&
      !dish.foodIds.some((id) => preferences.excludedFoods.map(family).includes(family(id))),
  );
  const seed = Math.floor(Date.parse(`${date}T12:00Z`) / 86400000);
  const sorted = eligible.toSorted(
    (a, b) =>
      b.foodIds.filter((id) => preferences.likedFoods.includes(id)).length -
      a.foodIds.filter((id) => preferences.likedFoods.includes(id)).length,
  );
  const breakfast = sorted.filter((dish) => dish.meal === "breakfast");
  const main = sorted.filter((dish) => dish.meal === "main");
  return [
    breakfast[seed % Math.max(1, breakfast.length)],
    main[seed % Math.max(1, main.length)],
    main[(seed + 1) % Math.max(1, main.length)],
  ]
    .flatMap((dish, index) =>
      dish ? [{ id: `meal-${index}`, label: ["Завтрак", "Обед", "Ужин"][index], dish }] : [],
    )
    .filter(
      (item, index, all) => all.findIndex((other) => other.dish.id === item.dish.id) === index,
    );
}
