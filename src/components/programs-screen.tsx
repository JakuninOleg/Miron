"use client";

import Link from "next/link";
import { useState } from "react";
import { Check, Download, Dumbbell, Search, SlidersHorizontal } from "lucide-react";
import { useMiron } from "@/client/use-miron";
import { DEMO_EXERCISES } from "@/shared/demo";
import { PageHeading } from "./app-shell";
import { WeekStrip } from "./dashboard-screen";
import { equipmentOptions, locationNames } from "./onboarding-screen";

export function ProgramsScreen() {
  const { profile, workout, isReady, downloadWorkout, isDemo } = useMiron();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [status, setStatus] = useState("");
  if (!isReady || !profile) return <div className="loading-state">Загружаем программу…</div>;
  const exercises = workout?.exercises ?? (isDemo ? DEMO_EXERCISES : []);
  const visible = exercises.filter(
    (exercise) =>
      exercise.name.toLowerCase().includes(search.toLowerCase()) &&
      (filter === "all" ||
        (filter === "bodyweight"
          ? exercise.equipment.length === 0
          : exercise.equipment.length > 0)),
  );
  return (
    <>
      <PageHeading
        title="Моя программа"
        description="План, который вписывается в твой день."
        action={
          <div className="settings-actions">
            <Link href="/workout-builder" className="button small-button">
              Собрать самому
            </Link>
            <Link href="/onboarding" className="button secondary small-button">
              <SlidersHorizontal size={15} />
              Мои условия
            </Link>
          </div>
        }
      />
      <div className="program-grid">
        <section className="card">
          <div className="section-heading">
            <h2>{workout?.title ?? "Твоя первая программа"}</h2>
            <Dumbbell size={22} className="rose" />
          </div>
          <p className="program-description">
            {workout
              ? `${workout.subtitle}. ${workout.estimatedMinutes} минут, ${locationNames[profile.location].toLowerCase()}.`
              : "Мы сохранили твои условия. Первая программа появится после публикации проверенных упражнений."}
          </p>
          {workout ? (
            <>
              <ul className="program-list">
                {workout.exercises.map((exercise, index) => (
                  <li key={exercise.id}>
                    <span className="exercise-order">{String(index + 1).padStart(2, "0")}</span>
                    <div>
                      <h3>{exercise.name}</h3>
                      <p className="muted">
                        {exercise.sets} подхода × {exercise.targetReps}{" "}
                        {exercise.metric === "time" ? "сек" : "повторений"} · отдых{" "}
                        {exercise.restSeconds} сек
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
              <div className="settings-actions" style={{ marginTop: 24 }}>
                <Link href="/workout" className="button">
                  Открыть тренировку
                </Link>
                <button
                  className="button secondary"
                  onClick={async () => {
                    try {
                      await downloadWorkout();
                      setStatus("Занятие сохранено на этом устройстве.");
                    } catch (cause) {
                      setStatus(cause instanceof Error ? cause.message : "Загрузка не удалась.");
                    }
                  }}
                >
                  <Download size={16} />
                  Для офлайна
                </button>
              </div>
              {status ? (
                <p className="field-help" role="status" style={{ marginTop: 14 }}>
                  {status}
                </p>
              ) : null}
            </>
          ) : (
            <Link className="button secondary" href="/onboarding">
              Изменить условия
            </Link>
          )}
        </section>
        <div className="settings-section">
          <section className="card week-card">
            <div className="section-heading">
              <h2>Твой ритм</h2>
              <span className="tag">{profile.daysPerWeek} занятия</span>
            </div>
            <WeekStrip profile={profile} />
            <p className="field-help" style={{ marginTop: 17 }}>
              Ориентир на занятие: {profile.reminderTime}. Отдых — часть плана.
            </p>
          </section>
          <section className="card">
            <h3>Твои условия</h3>
            <p className="program-description">
              {locationNames[profile.location]} · до {profile.durationMinutes} минут
            </p>
            <div className="exercise-tags">
              {profile.equipment.length ? (
                profile.equipment
                  .filter((item) => item.code !== "floor" && item.code !== "clear_space")
                  .map((item) => (
                    <span className="tag" key={item.code}>
                      <Check size={10} style={{ display: "inline", marginRight: 5 }} />
                      {equipmentOptions.find((value) => value.code === item.code)?.name ??
                        item.code}{" "}
                      × {item.quantity}
                    </span>
                  ))
              ) : (
                <span className="tag">Без инвентаря</span>
              )}
            </div>
          </section>
        </div>
      </div>
      <section className="catalog-section">
        <div className="section-heading">
          <h2>{isDemo ? "Каталог упражнений" : "Упражнения в твоём плане"}</h2>
          <span className="muted small">{exercises.length}</span>
        </div>
        {isDemo ? (
          <p className="field-help">
            Демонстрационный каталог. Техника и допуски ещё проходят проверку специалистом.
          </p>
        ) : null}
        <div className="catalog-tools">
          <div style={{ position: "relative", flex: 1 }}>
            <Search
              size={17}
              className="muted"
              style={{ position: "absolute", left: 14, top: 15 }}
            />
            <input
              className="input"
              style={{ paddingLeft: 40 }}
              placeholder="Найти упражнение"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              aria-label="Поиск упражнений"
            />
          </div>
          <select
            className="input"
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
            aria-label="Фильтр по инвентарю"
          >
            <option value="all">Все упражнения</option>
            <option value="bodyweight">Без инвентаря</option>
            <option value="equipment">С инвентарём</option>
          </select>
        </div>
        <div className="catalog-grid">
          {visible.map((exercise) => (
            <article className="card exercise-card" key={exercise.id}>
              <Dumbbell className="catalog-icon" size={25} />
              <h3>{exercise.name}</h3>
              <p>{exercise.description}</p>
              <div className="exercise-tags">
                <span className="tag">
                  {exercise.metric === "time" ? "На время" : "Повторения"}
                </span>
                <span className="tag">
                  {exercise.equipment.length ? "С инвентарём" : "Свой вес"}
                </span>
              </div>
              <details>
                <summary>Как выполнять</summary>
                <p>{exercise.instructions.join(" ")}</p>
              </details>
            </article>
          ))}
        </div>
        {!visible.length ? (
          <div className="card empty-state">
            <Search size={28} />
            <h3>{exercises.length ? "Ничего не нашлось" : "Каталог готовится"}</h3>
            <p>
              {exercises.length
                ? "Попробуй другое название или убери фильтр."
                : "Здесь будут упражнения из твоей опубликованной программы."}
            </p>
          </div>
        ) : null}
      </section>
    </>
  );
}
