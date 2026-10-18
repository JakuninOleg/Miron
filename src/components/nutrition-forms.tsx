"use client";
import { useState } from "react";
import {
  FOOD_CATALOG,
  type Dish,
  type FoodEntry,
  type NutritionPreferences,
} from "@/shared/nutrition";
import styles from "./nutrition-screen.module.css";
export type NutritionMutation = (payload: object) => Promise<boolean>;

export function NutritionPreferencesForm({
  preferences,
  revision,
  busy,
  mutate,
}: {
  preferences: NutritionPreferences;
  revision: number;
  busy: boolean;
  mutate: NutritionMutation;
}) {
  const [draft, setDraft] = useState(preferences);
  function choose(id: string, value: "like" | "exclude" | "neutral") {
    setDraft((current) => ({
      ...current,
      likedFoods: [
        ...current.likedFoods.filter((key) => key !== id),
        ...(value === "like" ? [id] : []),
      ],
      excludedFoods: [
        ...current.excludedFoods.filter((key) => key !== id),
        ...(value === "exclude" ? [id] : []),
      ],
    }));
  }
  return (
    <form
      className={styles.form}
      onSubmit={(event) => {
        event.preventDefault();
        void mutate({ type: "preferences", expectedRevision: revision, preferences: draft });
      }}
    >
      <h2>Что тебе по вкусу?</h2>
      <p className={styles.muted}>
        Любимые и нелюбимые продукты. Медицинские сведения здесь не сохраняем.
      </p>
      <label className={styles.check}>
        <input
          type="checkbox"
          checked={draft.vegetarian}
          disabled={busy}
          onChange={(event) => setDraft({ ...draft, vegetarian: event.target.checked })}
        />
        Без мяса и рыбы
      </label>
      <div className={styles.grid}>
        {FOOD_CATALOG.filter((food) => !["oil", "porridge"].includes(food.id)).map((food) => (
          <label key={food.id}>
            {food.name}
            <select
              aria-label={`Предпочтение: ${food.name}`}
              disabled={busy}
              value={
                draft.likedFoods.includes(food.id)
                  ? "like"
                  : draft.excludedFoods.includes(food.id)
                    ? "exclude"
                    : "neutral"
              }
              onChange={(event) =>
                choose(food.id, event.target.value as "like" | "exclude" | "neutral")
              }
            >
              <option value="neutral">Обычно ем</option>
              <option value="like">Люблю</option>
              <option value="exclude">Не предлагать</option>
            </select>
          </label>
        ))}
      </div>
      <button className={styles.primary} disabled={busy}>
        Сохранить предпочтения
      </button>
    </form>
  );
}

export function DishForm({
  revision,
  busy,
  mutate,
  dish,
  onClose,
}: {
  revision: number;
  busy: boolean;
  mutate: NutritionMutation;
  dish?: Dish;
  onClose: () => void;
}) {
  const [name, setName] = useState(dish?.name ?? "");
  const [ingredients, setIngredients] = useState(dish?.ingredients ?? "");
  const [portion, setPortion] = useState(dish?.portionGrams ?? 250);
  const [values, setValues] = useState({
    kcal: dish?.per100g?.kcal.toString() ?? "",
    protein: dish?.per100g?.protein.toString() ?? "",
    fat: dish?.per100g?.fat.toString() ?? "",
    carbs: dish?.per100g?.carbs.toString() ?? "",
  });
  const [vegetarian, setVegetarian] = useState(dish?.vegetarian ?? false);
  const [known, setKnown] = useState(Boolean(dish?.per100g));
  async function submit() {
    if (
      await mutate({
        type: "save_dish",
        expectedRevision: revision,
        ...(dish ? { id: dish.id } : {}),
        name,
        ingredients,
        portionGrams: portion,
        per100g: known
          ? {
              kcal: Number(values.kcal),
              protein: Number(values.protein),
              fat: Number(values.fat),
              carbs: Number(values.carbs),
            }
          : null,
        vegetarian,
      })
    )
      onClose();
  }
  return (
    <form
      className={styles.form}
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      <h2>{dish ? "Изменить своё блюдо" : "Своё блюдо"}</h2>
      <p className={styles.muted}>
        Перенеси значения с упаковки или из своего расчёта рецепта. Мы не проверяем состав и
        аллергенные следы пользовательского блюда.
      </p>
      <label>
        Название блюда
        <input
          autoFocus
          required
          maxLength={80}
          value={name}
          disabled={busy}
          onChange={(event) => setName(event.target.value)}
        />
      </label>
      <label>
        Состав
        <textarea
          required
          maxLength={1000}
          value={ingredients}
          disabled={busy}
          onChange={(event) => setIngredients(event.target.value)}
        />
      </label>
      <label>
        Обычная порция, г
        <input
          type="number"
          required
          min={10}
          max={2000}
          value={portion}
          disabled={busy}
          onChange={(event) => setPortion(Number(event.target.value))}
        />
      </label>
      <label className={styles.check}>
        <input
          type="checkbox"
          checked={known}
          disabled={busy}
          onChange={(event) => setKnown(event.target.checked)}
        />
        Знаю пищевую ценность по этикетке или рецепту
      </label>
      {known ? (
        <>
          <p>Пищевая ценность на 100 г готового блюда</p>
          <div className={styles.grid}>
            {(
              [
                ["kcal", "Ккал"],
                ["protein", "Белки, г"],
                ["fat", "Жиры, г"],
                ["carbs", "Углеводы, г"],
              ] as const
            ).map(([key, label]) => (
              <label key={key}>
                {label}
                <input
                  type="number"
                  required
                  min={0}
                  max={key === "kcal" ? 1000 : 100}
                  step="0.1"
                  value={values[key]}
                  disabled={busy}
                  onChange={(event) => setValues({ ...values, [key]: event.target.value })}
                />
              </label>
            ))}
          </div>
        </>
      ) : (
        <p className={styles.muted}>
          Можно сохранить без калорий. Неизвестные значения не считаются нулём в дневной сумме.
        </p>
      )}
      <label className={styles.check}>
        <input
          type="checkbox"
          checked={vegetarian}
          disabled={busy}
          onChange={(event) => setVegetarian(event.target.checked)}
        />
        Без мяса и рыбы
      </label>
      <div className={styles.actions}>
        <button className={styles.primary} disabled={busy}>
          Сохранить блюдо
        </button>
        <button className={styles.secondary} type="button" disabled={busy} onClick={onClose}>
          Отмена
        </button>
      </div>
    </form>
  );
}

export function FoodLogForm({
  dish,
  entry,
  source,
  date,
  revision,
  mode,
  busy,
  mutate,
  onClose,
}: {
  dish: Dish;
  entry?: FoodEntry;
  source?: { source: "planned" | "library"; id: string };
  date: string;
  revision: number;
  mode: NutritionPreferences["mode"];
  busy: boolean;
  mutate: NutritionMutation;
  onClose: () => void;
}) {
  const effectiveMode = mode === "hidden" ? "rough" : mode;
  const [grams, setGrams] = useState(entry?.grams ?? dish.portionGrams);
  const [portions, setPortions] = useState((entry?.grams ?? dish.portionGrams) / dish.portionGrams);
  const [error, setError] = useState("");
  async function submit() {
    const amount = effectiveMode === "rough" ? Math.round(portions * dish.portionGrams) : grams;
    if (!Number.isInteger(amount) || amount < 1 || amount > 5000) {
      setError(
        "За одну запись можно указать от 1 до 5000 г. Для большой порции уточни количество.",
      );
      return;
    }
    const payload = entry
      ? { type: "edit_entry", entryId: entry.id, grams: amount, mode: effectiveMode }
      : { type: "log_food", selection: source, grams: amount, mode: effectiveMode };
    if (await mutate({ ...payload, date, expectedRevision: revision })) onClose();
  }
  return (
    <form
      className={styles.form}
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      <h3>{entry ? "Уточнить запись" : "Записать съеденное"}</h3>
      {effectiveMode === "rough" ? (
        <label>
          Примерно порций
          <select
            aria-label="Примерно порций"
            value={portions}
            disabled={busy}
            onChange={(event) => setPortions(Number(event.target.value))}
          >
            {[...new Set([0.25, 0.5, 0.75, 1, 1.5, 2, 3, 4, portions])]
              .filter(
                (value) => value * dish.portionGrams >= 1 && value * dish.portionGrams <= 5000,
              )
              .sort((a, b) => a - b)
              .map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
          </select>
          <small>
            Одна порция в рецепте — около {dish.portionGrams} г. Это ориентир для оценки.
          </small>
        </label>
      ) : (
        <label>
          Сколько съедено, г
          <input
            autoFocus
            aria-label="Сколько съедено, г"
            type="number"
            required
            min={1}
            max={5000}
            value={grams}
            disabled={busy}
            onChange={(event) => setGrams(Number(event.target.value))}
          />
        </label>
      )}
      <div className={styles.actions}>
        <button className={styles.primary} disabled={busy}>
          {entry ? "Сохранить уточнение" : "Записать еду"}
        </button>
        <button type="button" className={styles.secondary} disabled={busy} onClick={onClose}>
          Отмена
        </button>
      </div>
      {error ? <p role="alert">{error}</p> : null}
    </form>
  );
}
