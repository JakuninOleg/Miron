import { useEffect, useState } from "react";
import { Check, ChevronLeft, ChevronRight, Dumbbell, Plus, Search } from "lucide-react";
import type { CatalogContext, CatalogDirection } from "@/shared/catalog-taxonomy";
import type {
  BuilderBootstrap,
  BuilderCatalog,
  BuilderEquipmentFilter,
  BuilderExercise,
} from "@/shared/workout-builder";
import { BuilderRequestError, builderRequest } from "@/client/workout-builder-api";
import { equipmentFilters } from "./choices";
import styles from "./workout-builder.module.css";

export function ExerciseCatalog({
  ownerId,
  busy,
  place,
  direction,
  inventoryRevision,
  muscles,
  selected,
  onAdd,
  onUnauthorized,
}: {
  ownerId: string;
  busy: boolean;
  place: CatalogContext;
  direction: CatalogDirection;
  inventoryRevision: number;
  muscles: BuilderBootstrap["muscles"];
  selected: string[];
  onAdd: (exercise: BuilderExercise) => void;
  onUnauthorized: () => void;
}) {
  const [search, setSearch] = useState("");
  const [muscle, setMuscle] = useState("");
  const [equipment, setEquipment] = useState<BuilderEquipmentFilter>("all");
  const [page, setPage] = useState(1);
  const [catalog, setCatalog] = useState<BuilderCatalog | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(
      () => {
        setLoading(true);
        setError("");
        const params = new URLSearchParams({
          place,
          direction,
          search,
          equipment,
          page: String(page),
        });
        if (muscle) params.set("muscle", muscle);
        void builderRequest<BuilderCatalog>(
          `/catalog?${params}`,
          { signal: controller.signal },
          ownerId,
        )
          .then((value) => {
            if (!controller.signal.aborted) {
              setCatalog(value);
              setLoading(false);
            }
          })
          .catch((cause: unknown) => {
            if (controller.signal.aborted) return;
            setLoading(false);
            if (
              cause instanceof BuilderRequestError &&
              (cause.status === 401 || cause.status === 403 || cause.code === "OWNER_CHANGED")
            )
              onUnauthorized();
            else
              setError(cause instanceof Error ? cause.message : "Не удалось загрузить упражнения.");
          });
      },
      search ? 250 : 0,
    );
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [
    ownerId,
    place,
    direction,
    inventoryRevision,
    search,
    muscle,
    equipment,
    page,
    retry,
    onUnauthorized,
  ]);
  return (
    <section aria-label="Каталог упражнений">
      <div className={styles.filterBar}>
        <label className={styles.search}>
          <Search size={18} aria-hidden="true" />
          <input
            value={search}
            placeholder="Название упражнения"
            aria-label="Найти упражнение"
            maxLength={80}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(1);
            }}
          />
        </label>
        <select
          className={styles.select}
          value={muscle}
          aria-label="Мышечная группа"
          onChange={(event) => {
            setMuscle(event.target.value);
            setPage(1);
          }}
        >
          <option value="">Все мышечные группы</option>
          {muscles.map((item) => (
            <option key={item.code} value={item.code}>
              {item.name}
            </option>
          ))}
        </select>
      </div>
      <div className={styles.filterChips} role="group" aria-label="Тип оборудования">
        {equipmentFilters.map((item) => (
          <button
            type="button"
            key={item.id}
            aria-pressed={equipment === item.id}
            onClick={() => {
              setEquipment(item.id);
              setPage(1);
            }}
          >
            {item.name}
          </button>
        ))}
      </div>
      <div className={styles.catalogStatus} role="status">
        {loading
          ? "Ищем подходящие упражнения…"
          : error
            ? "Каталог не загрузился"
            : `${catalog?.total ?? 0} упражнений под твои условия`}
      </div>
      {error ? (
        <div className={styles.notice} role="alert">
          <p>{error}</p>
          <button
            type="button"
            className={styles.secondary}
            onClick={() => setRetry((value) => value + 1)}
          >
            Повторить загрузку
          </button>
        </div>
      ) : null}
      {!error && !loading ? (
        <div className={styles.exerciseGrid}>
          {catalog?.exercises.map((exercise) => {
            const added = selected.includes(exercise.revisionId);
            return (
              <article className={styles.exerciseCard} key={exercise.revisionId}>
                <div className={styles.exerciseTop}>
                  <span className={styles.exerciseIcon}>
                    <Dumbbell size={22} aria-hidden="true" />
                  </span>
                  <span className={styles.draftBadge}>
                    {exercise.status === "draft" ? "Черновик" : "Каталог"}
                  </span>
                </div>
                <h3>{exercise.name}</h3>
                <p className={styles.muted}>
                  {exercise.primaryMuscles.map((item) => item.name).join(" · ") || "Общее движение"}
                </p>
                <p className={styles.equipmentText}>
                  {exercise.equipment.map((item) => item.name).join(" · ") || "Без инвентаря"}
                </p>
                <div className={styles.exerciseMeta}>
                  <span>
                    {exercise.metric === "time" ? "На время" : "На повторы"}
                    {exercise.timing.perSide ? " · на сторону" : ""}
                  </span>
                  <span>
                    {exercise.difficulty === "beginner"
                      ? "Базовое"
                      : exercise.difficulty === "intermediate"
                        ? "Средний уровень"
                        : "Сложное"}
                  </span>
                </div>
                <details className={styles.technique}>
                  <summary>О движении</summary>
                  {exercise.instructions.map((line, index) => (
                    <p key={index}>{line}</p>
                  ))}
                  {exercise.secondaryMuscles.length ? (
                    <p>
                      Также работают:{" "}
                      {exercise.secondaryMuscles.map((item) => item.name).join(", ")}.
                    </p>
                  ) : null}
                </details>
                <button
                  type="button"
                  className={added ? styles.addedButton : styles.addButton}
                  disabled={busy || added || selected.length >= 40}
                  onClick={() => onAdd(exercise)}
                >
                  {added ? (
                    <Check size={17} aria-hidden="true" />
                  ) : (
                    <Plus size={17} aria-hidden="true" />
                  )}
                  {added ? "В тренировке" : "Добавить"}
                  <span className={styles.srOnly}> {exercise.name}</span>
                </button>
              </article>
            );
          })}
        </div>
      ) : null}
      {!loading && !error && catalog?.total === 0 ? (
        <div className={styles.empty}>
          <Dumbbell size={30} aria-hidden="true" />
          <h3>Пока нет совпадений</h3>
          <p>
            Попробуй убрать фильтр или проверить инвентарь. Показываем упражнения только для
            выбранного места и направления.
          </p>
          <button
            type="button"
            className={styles.secondary}
            onClick={() => {
              setSearch("");
              setMuscle("");
              setEquipment("all");
              setPage(1);
            }}
          >
            Сбросить фильтры
          </button>
        </div>
      ) : null}
      {!loading && !error && catalog && catalog.total > catalog.pageSize ? (
        <nav className={styles.pagination} aria-label="Страницы каталога">
          <button
            type="button"
            aria-label="Предыдущая страница"
            disabled={page === 1}
            onClick={() => setPage((value) => value - 1)}
          >
            <ChevronLeft size={20} />
          </button>
          <span>
            {page} / {Math.ceil(catalog.total / catalog.pageSize)}
          </span>
          <button
            type="button"
            aria-label="Следующая страница"
            disabled={page * catalog.pageSize >= catalog.total}
            onClick={() => setPage((value) => value + 1)}
          >
            <ChevronRight size={20} />
          </button>
        </nav>
      ) : null}
    </section>
  );
}
