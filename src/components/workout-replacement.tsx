"use client";
import { useEffect, useRef, useState } from "react";
import { useMiron } from "@/client/use-miron";
import type { Workout } from "@/shared/contracts";
import type { WorkoutAlternatives } from "@/shared/workout-replacement";
import styles from "./workout-set-editor.module.css";
export function WorkoutReplacement({
  workout,
  exerciseId,
  onClose,
}: {
  workout: Workout;
  exerciseId: string;
  onClose: () => void;
}) {
  const { ownerId, isOnline, replaceExercise, logout } = useMiron();
  const [loaded, setLoaded] = useState<WorkoutAlternatives | null>(null);
  const [choice, setChoice] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const confirming = useRef(false);
  useEffect(() => {
    heading.current?.focus();
  }, []);
  useEffect(() => {
    if (!ownerId || !isOnline) return;
    const controller = new AbortController();
    void fetch(`/api/workouts/${workout.id}/alternatives?exerciseId=${exerciseId}`, {
      signal: controller.signal,
      cache: "no-store",
      headers: { "x-miron-owner": ownerId },
    })
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok) {
          if (response.status === 401 || body?.error?.code === "OWNER_CHANGED") await logout();
          throw new Error(body?.error?.message ?? "Не удалось прочитать варианты.");
        }
        if (!controller.signal.aborted) setLoaded(body as WorkoutAlternatives);
      })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted)
          setError(cause instanceof Error ? cause.message : "Не удалось загрузить замены.");
      });
    return () => controller.abort();
  }, [ownerId, isOnline, workout.id, exerciseId, logout]);
  const selected = loaded?.candidates.find((item) => item.revisionId === choice);
  const before = workout.exercises.find((exercise) => exercise.id === exerciseId);
  const stale = loaded !== null && loaded.revision !== workout.revision;
  async function confirm() {
    if (!loaded || !selected || stale || confirming.current || !isOnline) return;
    confirming.current = true;
    setBusy(true);
    setError("");
    try {
      await replaceExercise(exerciseId, selected.revisionId, {
        id: workout.id,
        revision: loaded.revision,
      });
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Замена не подтверждена.");
    } finally {
      confirming.current = false;
      setBusy(false);
    }
  }
  return (
    <section className={`card ${styles.editor}`}>
      <h1 ref={heading} tabIndex={-1}>
        Заменить упражнение
      </h1>
      <p>
        Подбираем доступный вариант с тем же движением и основными мышцами. Сложность не повышаем.
        Уже записанные подходы остаются прежними.
      </p>
      {!isOnline ? <p role="status">Для проверки новых упражнений нужен интернет.</p> : null}
      {loaded && !loaded.candidates.length ? (
        <p role="status">
          Среди доступных упражнений нет подходящей замены. Можно пропустить упражнение или
          закончить занятие раньше, сохранив сделанное.
        </p>
      ) : null}
      {loaded?.candidates.length ? (
        <fieldset className={`${styles.fields} ${styles.choices}`}>
          <legend>Доступные варианты</legend>
          {loaded.candidates.map((candidate) => (
            <label key={candidate.revisionId}>
              <span>
                <input
                  type="radio"
                  name="replacement"
                  value={candidate.revisionId}
                  checked={choice === candidate.revisionId}
                  disabled={busy}
                  onChange={() => setChoice(candidate.revisionId)}
                />{" "}
                {candidate.name}
              </span>
              <small>
                {candidate.primaryMuscles.map((muscle) => muscle.name).join(", ")} ·{" "}
                {candidate.equipment.map((item) => item.name).join(", ") || "Свой вес"}
              </small>
            </label>
          ))}
        </fieldset>
      ) : null}
      {selected && before ? (
        <div className={styles.comparison}>
          <div>
            <span>Было</span>
            <strong>{before.name}</strong>
          </div>
          <div>
            <span>Будет</span>
            <strong>{selected.name}</strong>
            <p>
              {before.sets} ×{" "}
              {before.metric === "time"
                ? `${before.targetDurationSeconds} сек`
                : `${before.targetReps} повторов`}
              . Рабочий вес выбери заново.
            </p>
          </div>
        </div>
      ) : null}
      {stale ? <p role="status">Занятие уже изменилось. Обнови тренировку перед заменой.</p> : null}
      {error ? <p role="alert">{error}</p> : null}
      {error || stale ? (
        <button type="button" className="button secondary" onClick={() => window.location.reload()}>
          Обновить тренировку
        </button>
      ) : null}
      <div className="workout-outcome-actions">
        <button
          type="button"
          className="button"
          disabled={busy || !isOnline || stale || !selected}
          onClick={() => void confirm()}
        >
          Принять замену
        </button>
        <button type="button" className="button secondary" disabled={busy} onClick={onClose}>
          Оставить упражнение
        </button>
      </div>
    </section>
  );
}
