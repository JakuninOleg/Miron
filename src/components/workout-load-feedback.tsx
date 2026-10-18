"use client";

import { useState } from "react";
import { useMiron } from "@/client/use-miron";
import type { Workout } from "@/shared/contracts";
import {
  canRateWorkout,
  WORKOUT_LOAD_FEEDBACK,
  type WorkoutLoadFeedback,
} from "@/shared/workout-feedback";
import styles from "./workout-load-feedback.module.css";

export function WorkoutLoadFeedbackCard({ workout }: { workout: Workout }) {
  const { rateWorkout, pendingCount } = useMiron();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  if (!canRateWorkout(workout)) return null;
  return (
    <section className={styles.card} aria-labelledby="workout-load-question" aria-busy={saving}>
      <h2 id="workout-load-question">Как тебе нагрузка?</h2>
      <div className={styles.options} role="group" aria-label="Оценка нагрузки">
        {(Object.entries(WORKOUT_LOAD_FEEDBACK) as [WorkoutLoadFeedback, string][]).map(
          ([value, label]) => (
            <button
              type="button"
              key={value}
              aria-pressed={workout.loadFeedback === value}
              disabled={saving}
              onClick={async () => {
                setSaving(true);
                setError("");
                try {
                  await rateWorkout(value);
                } catch (cause) {
                  setError(
                    cause instanceof Error
                      ? cause.message
                      : "Оценка не сохранена. Попробуй ещё раз.",
                  );
                } finally {
                  setSaving(false);
                }
              }}
            >
              {label}
            </button>
          ),
        )}
      </div>
      <p className="field-help" role="status">
        {workout.loadFeedback
          ? pendingCount > 0
            ? "Оценка записана на устройстве. Отправим при синхронизации."
            : workout.energyActivity === "strength" || workout.energyActivity === "calisthenics"
              ? "Оценка сохранена. Учтём при новом силовом подборе; XP от ответа не зависит."
              : "Оценка сохранена в истории занятия. XP от ответа не зависит."
          : "Можно ответить одним нажатием или продолжить без оценки. XP от ответа не зависит."}
      </p>
      {error ? (
        <p className="error-text" role="alert">
          {error}
        </p>
      ) : null}
    </section>
  );
}
