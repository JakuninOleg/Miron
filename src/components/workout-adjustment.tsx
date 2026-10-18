"use client";
import { useEffect, useRef, useState } from "react";
import { useMiron } from "@/client/use-miron";
import type { Workout } from "@/shared/contracts";
import { lighterWorkout } from "@/shared/workout-adjustment";
import styles from "./workout-set-editor.module.css";

export function WorkoutAdjustment({ workout, onClose }: { workout: Workout; onClose: () => void }) {
  const { lightenRemaining, isOnline } = useMiron();
  const [revision] = useState(workout.revision);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const heading = useRef<HTMLHeadingElement>(null);
  const confirming = useRef(false);
  useEffect(() => {
    heading.current?.focus();
  }, []);
  let next: Workout | null = null;
  let unavailable = "";
  try {
    next = lighterWorkout(workout);
  } catch (cause) {
    unavailable = cause instanceof Error ? cause.message : "Нет доступных изменений.";
  }
  const changes =
    next?.exercises.filter((exercise, index) => exercise.sets !== workout.exercises[index].sets) ??
    [];
  const stale = workout.revision !== revision;
  async function confirm() {
    if (confirming.current || stale || !changes.length) return;
    confirming.current = true;
    setBusy(true);
    setError("");
    try {
      await lightenRemaining(workout.id, revision);
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Не удалось сохранить изменения.");
    } finally {
      confirming.current = false;
      setBusy(false);
    }
  }
  return (
    <section className={`card ${styles.editor}`} aria-labelledby="adjustment-title">
      <h2 id="adjustment-title" tabIndex={-1} ref={heading}>
        Сделаем оставшееся полегче
      </h2>
      <p>
        Уберём по одному подходу только в ещё не начатых упражнениях основной части. Записанные
        результаты, разминка, заминка и веса останутся прежними.
      </p>
      {unavailable ? (
        <p role="status">{unavailable}</p>
      ) : (
        <ul className={styles.changes}>
          {changes.map((exercise) => (
            <li key={exercise.id}>
              {exercise.name}: {workout.exercises.find((item) => item.id === exercise.id)?.sets} →{" "}
              {exercise.sets} подхода
            </li>
          ))}
        </ul>
      )}
      {!isOnline ? (
        <p>Изменение сохранится в журнале устройства. Сервер подтвердит его после подключения.</p>
      ) : null}
      {stale ? (
        <p role="status">Тренировка изменилась. Закрой сравнение и открой его заново.</p>
      ) : null}
      {error ? <p role="alert">{error}</p> : null}
      <div className="workout-outcome-actions">
        <button
          type="button"
          className="button"
          disabled={busy || stale || !changes.length}
          onClick={() => void confirm()}
        >
          {busy ? "Сохраняем…" : "Принять изменения"}
        </button>
        <button type="button" className="button secondary" disabled={busy} onClick={onClose}>
          Оставить как есть
        </button>
      </div>
    </section>
  );
}
