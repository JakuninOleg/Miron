"use client";
import Link from "next/link";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Apple, ArrowLeft, Plus, Utensils } from "lucide-react";
import { useMiron } from "@/client/use-miron";
import { builderRequest, BuilderRequestError } from "@/client/workout-builder-api";
import {
  POPULAR_DISHES,
  NUTRITION_SOURCE,
  dishNutrients,
  type Dish,
  type FoodEntry,
  type NutritionState,
} from "@/shared/nutrition";
import { DishForm, FoodLogForm, NutritionPreferencesForm } from "./nutrition-forms";
import styles from "./nutrition-screen.module.css";

function DishArt({ dish }: { dish: Dish }) {
  const index = POPULAR_DISHES.findIndex((item) => item.id === dish.id);
  const row = Math.floor(index / 3);
  const tile = [404, 386, 414][row] ?? 414;
  const x = (index % 3) * 419 + (414 - tile) / 2;
  const y = [0, 410, 818][row] ?? 0;
  return index >= 0 ? (
    <div
      aria-hidden="true"
      className={styles.photo}
      style={{
        backgroundSize: `${(1254 / tile) * 100}%`,
        backgroundPosition: `${(x / (1254 - tile)) * 100}% ${(y / (1254 - tile)) * 100}%`,
      }}
    />
  ) : (
    <div aria-hidden="true" className={styles.placeholder}>
      <Utensils />
    </div>
  );
}
function NutritionContent({ ownerId }: { ownerId: string }) {
  const { profile, isOnline } = useMiron();
  const [date, setDate] = useState(() =>
    new Intl.DateTimeFormat("en-CA", { timeZone: profile.timezone }).format(new Date()),
  );
  const [loaded, setLoaded] = useState<{ date: string; state: NutritionState } | null>(null);
  const [reload, setReload] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [tab, setTab] = useState<"day" | "library">("day");
  const [restrictions, setRestrictions] = useState<"unknown" | "general" | "medical">("unknown");
  const [dishForm, setDishForm] = useState<Dish | "new" | null>(null);
  const [logging, setLogging] = useState<{
    dish: Dish;
    source?: { source: "planned" | "library"; id: string };
    entry?: FoodEntry;
  } | null>(null);
  const [replacing, setReplacing] = useState<string | null>(null);
  const pending = useRef<{ signature: string; input: object } | null>(null);
  const saving = useRef(false);
  const currentDate = useRef(date);
  const mounted = useRef(true);
  useLayoutEffect(() => {
    currentDate.current = date;
  }, [date]);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const state = loaded?.date === date ? loaded.state : null;
  useEffect(() => {
    const controller = new AbortController();
    void builderRequest<NutritionState>(
      `/nutrition?date=${date}`,
      { signal: controller.signal },
      ownerId,
    )
      .then((value) => {
        if (!controller.signal.aborted) {
          setLoaded({ date, state: value });
          setError("");
        }
      })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted)
          setError(cause instanceof Error ? cause.message : "Не удалось загрузить питание.");
      });
    return () => controller.abort();
  }, [ownerId, date, reload]);
  async function mutate(payload: object): Promise<boolean> {
    if (!isOnline || saving.current) return false;
    saving.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    const signature = JSON.stringify({ ownerId, payload });
    if (pending.current?.signature !== signature)
      pending.current = { signature, input: { ...payload, operationId: crypto.randomUUID() } };
    try {
      await builderRequest(
        "/nutrition",
        { method: "POST", body: JSON.stringify(pending.current.input) },
        ownerId,
      );
      const current = await builderRequest<NutritionState>(
        `/nutrition?date=${date}`,
        undefined,
        ownerId,
      );
      if (!mounted.current || currentDate.current !== date) return false;
      setLoaded({ date, state: current });
      pending.current = null;
      setNotice("Сохранено в аккаунте.");
      return true;
    } catch (cause) {
      if (!mounted.current || currentDate.current !== date) return false;
      setError(cause instanceof Error ? cause.message : "Не удалось сохранить питание.");
      if (cause instanceof BuilderRequestError && cause.code === "REVISION_CONFLICT") {
        setLoaded(null);
        setLogging(null);
        setDishForm(null);
        setReload((value) => value + 1);
      }
      return false;
    } finally {
      saving.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  const mode = state?.preferences.mode ?? "rough";
  const library = [...POPULAR_DISHES, ...(state?.dishes ?? [])];
  const sum =
    state?.day.entries.reduce((total, entry) => total + (entry.nutrients?.kcal ?? 0), 0) ?? 0;
  const unknown = state?.day.entries.filter((entry) => !entry.nutrients).length ?? 0;
  function calories(dish: Dish, grams = dish.portionGrams) {
    const value = dishNutrients(dish, grams);
    return value
      ? `≈ ${Math.round(value.kcal / (mode === "rough" ? 20 : 1)) * (mode === "rough" ? 20 : 1)} ккал`
      : "Пищевая ценность неизвестна";
  }
  function editor(dishId: string, entryId?: string) {
    return logging?.dish.id === dishId && (logging.entry?.id ?? "") === (entryId ?? "") && state ? (
      <FoodLogForm
        key={`${state.day.revision}:${dishId}:${entryId}`}
        {...logging}
        date={date}
        revision={state.day.revision}
        mode={mode}
        busy={busy || !isOnline}
        mutate={mutate}
        onClose={() => setLogging(null)}
      />
    ) : null;
  }
  return (
    <section className={styles.page}>
      <header className={styles.header}>
        <div>
          <h1>Еда без крайностей</h1>
          <p>Привычные блюда. В твоём ритме.</p>
        </div>
        <Link className={styles.secondary} href="/dashboard">
          <ArrowLeft size={17} /> Сегодня
        </Link>
      </header>
      <div className={styles.tabs} role="group" aria-label="Раздел питания">
        <button type="button" aria-pressed={tab === "day"} onClick={() => setTab("day")}>
          Мой день
        </button>
        <button type="button" aria-pressed={tab === "library"} onClick={() => setTab("library")}>
          Библиотека блюд
        </button>
      </div>
      <div className={styles.toolbar}>
        <label>
          День питания
          <input
            aria-label="День питания"
            type="date"
            min="2020-01-01"
            max="2100-12-31"
            required
            value={date}
            disabled={busy}
            onChange={(event) => {
              if (saving.current) return;
              if (event.target.value) {
                currentDate.current = event.target.value;
                setDate(event.target.value);
                setLogging(null);
                setNotice("");
              }
            }}
          />
        </label>
        {state ? (
          <label>
            Подсчёт
            <select
              aria-label="Подсчёт"
              value={mode}
              disabled={busy || !isOnline}
              onChange={(event) =>
                void mutate({
                  type: "preferences",
                  expectedRevision: state.revision,
                  preferences: { ...state.preferences, mode: event.target.value },
                })
              }
            >
              <option value="rough">Без заморочек · по порциям</option>
              <option value="precise">Дотошный · по граммам</option>
              <option value="hidden">Не показывать калории</option>
            </select>
          </label>
        ) : null}
      </div>
      {!isOnline ? (
        <p className={styles.note} role="status">
          Питание пока сохраняется только при подключении к интернету. Голос и AI офлайн недоступны.
          Записи тренировки хранятся в отдельном журнале устройства.
        </p>
      ) : null}
      {error ? (
        <div role="alert" className={styles.note}>
          <p>{error}</p>
          <button
            type="button"
            className={styles.secondary}
            onClick={() => setReload((value) => value + 1)}
          >
            Обновить питание
          </button>
        </div>
      ) : null}
      {notice ? <p role="status">{notice}</p> : null}
      {!state ? (
        <p role="status">Загружаем твой день…</p>
      ) : tab === "library" ? (
        <section className={styles.section}>
          <div className={styles.toolbar}>
            <h2>Блюда на каждый день</h2>
            <button
              type="button"
              className={styles.secondary}
              disabled={busy || !isOnline}
              onClick={() => setDishForm("new")}
            >
              <Plus size={17} /> Своё блюдо
            </button>
          </div>
          {dishForm ? (
            <DishForm
              key={`${state.revision}:${typeof dishForm === "string" ? "new" : dishForm.id}`}
              revision={state.revision}
              dish={typeof dishForm === "string" ? undefined : dishForm}
              busy={busy || !isOnline}
              mutate={mutate}
              onClose={() => setDishForm(null)}
            />
          ) : null}
          <div className={styles.catalog}>
            {library.map((dish) => (
              <article key={dish.id} className={styles.row}>
                <DishArt dish={dish} />
                <div className={styles.copy}>
                  <h3>{dish.name}</h3>
                  {mode !== "hidden" ? <p>{calories(dish)}</p> : null}
                  <small>Обычная порция: около {dish.portionGrams} г</small>
                  <details>
                    <summary>Состав и источник</summary>
                    <p>{dish.ingredients}</p>
                    <p className={styles.muted}>
                      {dish.source === "user_label"
                        ? "Твои данные. Состав и аллергены не проверены."
                        : "Расчёт по CoFID 2021. Значения продуктов усреднённые, иллюстрация — пример сервировки."}
                    </p>
                  </details>
                  <div className={styles.actions}>
                    <button
                      type="button"
                      className={styles.primary}
                      disabled={busy || !isOnline}
                      onClick={() =>
                        setLogging({ dish, source: { source: "library", id: dish.id } })
                      }
                    >
                      Съел
                    </button>
                    <button
                      type="button"
                      className={styles.secondary}
                      disabled={busy || !isOnline}
                      onClick={() =>
                        void mutate({
                          type: "add_meal",
                          expectedRevision: state.day.revision,
                          date,
                          label: "Перекус",
                          dishId: dish.id,
                        })
                      }
                    >
                      В план
                    </button>
                    {dish.source === "user_label" ? (
                      <>
                        <button
                          type="button"
                          className={styles.secondary}
                          disabled={busy || !isOnline}
                          onClick={() => setDishForm(dish)}
                        >
                          Изменить
                        </button>
                        <button
                          type="button"
                          className={styles.secondary}
                          disabled={busy || !isOnline}
                          onClick={() =>
                            void mutate({
                              type: "delete_dish",
                              id: dish.id,
                              expectedRevision: state.revision,
                            })
                          }
                        >
                          Убрать из библиотеки
                        </button>
                      </>
                    ) : null}
                  </div>
                  {editor(dish.id)}
                </div>
              </article>
            ))}
          </div>
        </section>
      ) : (
        <div className={styles.layout}>
          <section className={styles.section}>
            <h2>В планах</h2>
            <p className={styles.muted}>
              Идеи приёмов пищи, а не назначенный рацион. План не считается съеденным.
            </p>
            <details>
              <summary>Предложить идеи меню</summary>
              <div className={styles.form}>
                <label>
                  Есть аллергии или лечебные ограничения?
                  <select
                    aria-label="Ограничения перед идеями меню"
                    value={restrictions}
                    onChange={(event) => setRestrictions(event.target.value as typeof restrictions)}
                  >
                    <option value="unknown">Выбери ответ</option>
                    <option value="general">Нет, нужны общие идеи обычной еды</option>
                    <option value="medical">Есть или не уверен</option>
                  </select>
                </label>
                {restrictions === "medical" ? (
                  <p>
                    Автоподбор по медицинским ограничениям пока недоступен. Проверяй точный состав и
                    следы аллергенов на упаковке; подбирай блюда по рекомендациям своего
                    специалиста. Этот ответ не сохраняем.
                  </p>
                ) : (
                  <p className={styles.muted}>
                    Учтём обычные предпочтения ниже. Состав, соусы и возможные следы аллергенов
                    всегда проверяй по продуктам.
                  </p>
                )}
                <button
                  type="button"
                  className={styles.secondary}
                  disabled={busy || !isOnline || restrictions !== "general"}
                  onClick={() =>
                    void mutate({
                      type: "suggest_menu",
                      date,
                      expectedRevision: state.day.revision,
                      generalFoodOnly: true,
                    })
                  }
                >
                  Заменить план идеями на день
                </button>
              </div>
            </details>
            {!state.day.planned.length ? (
              <p className={styles.note}>
                Добавь знакомое блюдо из библиотеки или начни с общих идей. Порции можно менять.
              </p>
            ) : (
              state.day.planned.map((meal) => (
                <article className={styles.row} key={meal.id}>
                  <DishArt dish={meal.dish} />
                  <div className={styles.copy}>
                    <small>{meal.label}</small>
                    <h3>{meal.dish.name}</h3>
                    {mode !== "hidden" ? <p>{calories(meal.dish)}</p> : null}
                    <details>
                      <summary>Состав</summary>
                      <p>{meal.dish.ingredients}</p>
                    </details>
                    {state.day.entries.some(
                      (entry) => entry.plannedMealId === meal.id && entry.dish.id === meal.dish.id,
                    ) ? (
                      <small>Уже есть запись в съеденном</small>
                    ) : null}
                    <div className={styles.actions}>
                      <button
                        type="button"
                        className={styles.primary}
                        disabled={busy || !isOnline}
                        onClick={() =>
                          setLogging({
                            dish: meal.dish,
                            source: { source: "planned", id: meal.id },
                          })
                        }
                      >
                        Съел
                      </button>
                      <button
                        type="button"
                        className={styles.secondary}
                        disabled={busy || !isOnline}
                        onClick={() => setReplacing(replacing === meal.id ? null : meal.id)}
                      >
                        Заменить
                      </button>
                      <button
                        type="button"
                        className={styles.secondary}
                        disabled={busy || !isOnline}
                        onClick={() =>
                          void mutate({
                            type: "remove_meal",
                            mealId: meal.id,
                            date,
                            expectedRevision: state.day.revision,
                          })
                        }
                      >
                        Убрать из плана
                      </button>
                    </div>
                    {replacing === meal.id ? (
                      <label className={styles.form}>
                        Другое блюдо
                        <select
                          aria-label="Другое блюдо"
                          value=""
                          disabled={busy || !isOnline}
                          onChange={(event) => {
                            if (event.target.value)
                              void mutate({
                                type: "replace_meal",
                                mealId: meal.id,
                                dishId: event.target.value,
                                date,
                                expectedRevision: state.day.revision,
                              }).then((ok) => {
                                if (ok) setReplacing(null);
                              });
                          }}
                        >
                          <option value="">Выбрать из библиотеки</option>
                          {library.map((dish) => (
                            <option key={dish.id} value={dish.id}>
                              {dish.name}
                            </option>
                          ))}
                        </select>
                      </label>
                    ) : null}
                    {logging?.source?.source === "planned" && logging.source.id === meal.id
                      ? editor(meal.dish.id)
                      : null}
                  </div>
                </article>
              ))
            )}
          </section>
          <aside>
            <section className={styles.section}>
              <h2>Записано за день</h2>
              {unknown ? (
                <p className={styles.muted}>
                  Без оценки калорий: {unknown}. Они не включены в сумму.
                </p>
              ) : null}
              {mode !== "hidden" ? (
                <p className={styles.summary}>
                  ≈ {Math.round(sum / (mode === "rough" ? 20 : 1)) * (mode === "rough" ? 20 : 1)}{" "}
                  ккал
                </p>
              ) : null}
              <p className={styles.muted}>
                Только записанная еда, не весь рацион. Расход от тренировки не увеличивает эту сумму
                и не создаёт лимит.
              </p>
              {state.day.entries.map((entry) => (
                <article key={entry.id} className={styles.row}>
                  <DishArt dish={entry.dish} />
                  <div className={styles.copy}>
                    <h3>{entry.dish.name}</h3>
                    <small>
                      {entry.mode === "rough"
                        ? `≈ ${Math.round((entry.grams / entry.dish.portionGrams) * 100) / 100} порции`
                        : `${entry.grams} г`}{" "}
                      {mode !== "hidden" ? `· ${calories(entry.dish, entry.grams)}` : ""}
                    </small>
                    <div className={styles.actions}>
                      <button
                        type="button"
                        className={styles.secondary}
                        disabled={busy || !isOnline}
                        onClick={() => setLogging({ dish: entry.dish, entry })}
                      >
                        Уточнить
                      </button>
                      <button
                        type="button"
                        className={styles.secondary}
                        disabled={busy || !isOnline}
                        onClick={() =>
                          void mutate({
                            type: "remove_entry",
                            entryId: entry.id,
                            date,
                            expectedRevision: state.day.revision,
                          })
                        }
                      >
                        Удалить запись
                      </button>
                    </div>
                    {editor(entry.dish.id, entry.id)}
                  </div>
                </article>
              ))}
              {!state.day.entries.length ? (
                <p className={styles.note}>
                  Пока ничего не записано. Это нормально — дневник необязательный.
                </p>
              ) : null}
              <button className={styles.secondary} type="button" onClick={() => setTab("library")}>
                <Plus size={17} /> Записать другое блюдо
              </button>
            </section>
            <section className={styles.section}>
              <details>
                <summary>Твои предпочтения</summary>
                <NutritionPreferencesForm
                  key={state.revision}
                  preferences={state.preferences}
                  revision={state.revision}
                  busy={busy || !isOnline}
                  mutate={mutate}
                />
              </details>
              <p className={styles.note}>
                <Apple size={19} aria-hidden="true" /> Место для любимой еды тоже есть. Без штрафов
                за пропуск записи и без «отработки» еды тренировкой.
              </p>
              <a
                className={styles.secondary}
                href={NUTRITION_SOURCE}
                target="_blank"
                rel="noreferrer"
              >
                Источник пищевой ценности · CoFID
              </a>
            </section>
          </aside>
        </div>
      )}
    </section>
  );
}
export function NutritionScreen() {
  const { ownerId, isReady } = useMiron();
  if (!isReady) return <p role="status">Загружаем питание…</p>;
  if (!ownerId) return <Link href="/sign-in">Войти в аккаунт</Link>;
  return <NutritionContent key={ownerId} ownerId={ownerId} />;
}
