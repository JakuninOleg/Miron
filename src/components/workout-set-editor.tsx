"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight } from "lucide-react";
import type { SetCorrectionCommand, Workout } from "@/shared/contracts";
import { correctWorkoutSet, lastRecordedSet } from "@/shared/workout-edits";
import styles from "./workout-set-editor.module.css";

export function WorkoutSetEditor({
  workout,
  setId,
  onCommit,
  onClose,
  isOnline,
  offlineAllowed = true,
}: {
  workout: Workout;
  setId: string;
  onCommit: (command: SetCorrectionCommand) => Promise<void>;
  onClose: () => void;
  isOnline: boolean;
  offlineAllowed?: boolean;
}) {
  const saved = workout.recordedSets.find((set) => set.id === setId);
  const exercise = workout.exercises.find((item) => item.id === saved?.exerciseId);
  const [revision] = useState(workout.revision);
  const [reps, setReps] = useState(saved?.reps ?? saved?.durationSeconds ?? 1);
  const [weight, setWeight] = useState(saved?.weightKg ?? 0);
  const [withDrop, setWithDrop] = useState(Boolean(saved?.drop));
  const [dropReps, setDropReps] = useState(saved?.drop?.reps ?? 8);
  const [dropWeight, setDropWeight] = useState(saved?.drop?.weightKg ?? 0);
  const [confirmUndo, setConfirmUndo] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const title = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    title.current?.focus();
  }, []);
  if (!saved || !exercise)
    return (
      <section className={`card ${styles.editor}`}>
        <p role="alert">Запись больше недоступна.</p>
        <button type="button" onClick={onClose}>
          К тренировке
        </button>
      </section>
    );
  const timed = exercise.metric === "time";
  const command: SetCorrectionCommand = timed
    ? { type: "correct_timed_set", setId, durationSeconds: reps }
    : {
        type: "correct_set",
        setId,
        reps,
        weightKg: weight,
        ...(withDrop ? { drop: { reps: dropReps, weightKg: dropWeight } } : {}),
      };
  let invalid = "";
  try {
    correctWorkoutSet(workout, command);
  } catch (cause) {
    invalid = cause instanceof Error ? cause.message : "Проверь запись.";
  }
  const stale = revision !== workout.revision;
  const canUndo =
    workout.status === "active" && !exercise.skipped && lastRecordedSet(workout)?.id === saved.id;
  async function submit(value: SetCorrectionCommand) {
    if (busy || stale || (!isOnline && !offlineAllowed)) return;
    setBusy(true);
    setError("");
    try {
      await onCommit(value);
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Не удалось сохранить исправление.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className={`card ${styles.editor}`} aria-label="Исправление подхода">
      <button className="text-link" type="button" onClick={onClose} disabled={busy}>
        <ArrowLeft size={18} aria-hidden="true" /> К тренировке
      </button>
      <h1 ref={title} tabIndex={-1}>
        Исправить подход
      </h1>
      <h2>{exercise.name}</h2>
      <p>Меняем фактическую запись. Принятый план и XP остаются прежними.</p>
      <div className={styles.comparison}>
        <div>
          <span>Было</span>
          <strong>
            {timed ? `${saved.durationSeconds} сек` : `${saved.weightKg} кг × ${saved.reps}`}
          </strong>
          {exercise.dropSet ? (
            <p>
              {saved.drop
                ? `Дропсет: ${saved.drop.weightKg} кг × ${saved.drop.reps}`
                : "Без дропсета"}
            </p>
          ) : null}
        </div>
        <ArrowRight size={22} aria-hidden="true" />
        <div>
          <span>Будет</span>
          <strong>{timed ? `${reps} сек` : `${weight} кг × ${reps}`}</strong>
          {exercise.dropSet ? (
            <p>{withDrop ? `Дропсет: ${dropWeight} кг × ${dropReps}` : "Без дропсета"}</p>
          ) : null}
        </div>
      </div>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (!invalid) void submit(command);
        }}
      >
        <fieldset className={styles.fields} disabled={busy || stale}>
          <label>
            {timed ? "Выполнено секунд" : "Повторения"}
            <input
              type="number"
              min={1}
              max={timed ? 86400 : 1000}
              step={1}
              required
              value={reps}
              onChange={(event) => setReps(Number(event.target.value))}
            />
          </label>
          {!timed ? (
            <label>
              Вес, кг
              <input
                type="number"
                min={0}
                max={1000}
                step="0.001"
                required
                value={weight}
                onChange={(event) => setWeight(Number(event.target.value))}
              />
            </label>
          ) : null}
          {exercise.dropSet && !timed ? (
            <div>
              <label>
                <input
                  type="checkbox"
                  checked={withDrop}
                  onChange={(event) => setWithDrop(event.target.checked)}
                />{" "}
                Дропсет был выполнен
              </label>
              {withDrop ? (
                <div className={styles.fields}>
                  <label>
                    Повторы со снижением
                    <input
                      type="number"
                      min={1}
                      max={100}
                      value={dropReps}
                      onChange={(event) => setDropReps(Number(event.target.value))}
                    />
                  </label>
                  <label>
                    Сниженный вес, кг
                    <input
                      type="number"
                      min={0.001}
                      step="0.001"
                      value={dropWeight}
                      onChange={(event) => setDropWeight(Number(event.target.value))}
                    />
                  </label>
                </div>
              ) : null}
            </div>
          ) : null}
        </fieldset>
        {invalid ? (
          <p className="field-help" role="status">
            {invalid}
          </p>
        ) : null}
        {stale ? (
          <p role="alert">Запись изменилась. Вернись к тренировке и открой исправление заново.</p>
        ) : null}
        {error ? <p role="alert">{error}</p> : null}
        {!isOnline ? (
          <p role="status">
            {offlineAllowed
              ? "Исправление сохранится на этом устройстве и будет отправлено при подключении."
              : "Для исправления истории подключись к интернету."}
          </p>
        ) : null}
        <button
          type="submit"
          className="button full"
          disabled={busy || stale || Boolean(invalid) || (!isOnline && !offlineAllowed)}
        >
          {busy ? "Сохраняем…" : "Сохранить исправление"}
        </button>
      </form>
      {canUndo ? (
        <div className={styles.undo}>
          {confirmUndo ? (
            <>
              <p>
                Отменить последнюю запись? Занятие останется активным, подход можно будет записать
                заново.
              </p>
              <button
                className="button secondary"
                type="button"
                disabled={busy || stale}
                onClick={() => void submit({ type: "undo_set", setId })}
              >
                Да, отменить запись
              </button>
              <button className="text-link" type="button" onClick={() => setConfirmUndo(false)}>
                Оставить
              </button>
            </>
          ) : (
            <button
              className="text-link"
              type="button"
              disabled={busy || stale}
              onClick={() => setConfirmUndo(true)}
            >
              Отменить последнюю запись
            </button>
          )}
        </div>
      ) : null}
    </section>
  );
}
