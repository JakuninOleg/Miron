"use client";

import { useId } from "react";
import { useMiron } from "@/client/use-miron";
import type { Workout } from "@/shared/contracts";
import { ENERGY_ACTIVITIES, formatWorkoutEnergy } from "@/shared/workout-energy";
import styles from "./workout-energy-card.module.css";

export function WorkoutEnergyCard({ workout }: { workout: Workout }) {
  const { profile, pendingCount, isDemo } = useMiron();
  const id = useId();
  const estimate = workout.energyEstimate;
  if (profile.showWorkoutEnergy === false || !estimate) return null;
  return (
    <section className={styles.card} aria-labelledby={`${id}-title`}>
      <div className={styles.heading}>
        <h2 id={`${id}-title`}>Примерный расход</h2>
        <strong className={styles.value}>{formatWorkoutEnergy(estimate)}</strong>
      </div>
      <p className={styles.help}>По выполненным подходам, обычному темпу и отдыху.</p>
      {estimate.weightSource === "reference" ? (
        <p className={styles.help}>
          Ориентир для веса {estimate.bodyWeightKg} кг: твой вес пока неизвестен.
        </p>
      ) : (
        <p className={styles.help}>Учтён твой примерный вес: {estimate.bodyWeightKg} кг.</p>
      )}
      {!isDemo && pendingCount > 0 ? (
        <p className={styles.help} role="status">
          Оценка на устройстве · ждёт синхронизации.
        </p>
      ) : null}
      <details className={styles.method}>
        <summary>Как считается</summary>
        <p className={styles.help}>
          {ENERGY_ACTIVITIES[estimate.activity].label}. Длительность оценивается по подходам и
          повторам; долгие паузы не добавляются. Это ориентир дополнительного расхода сверх покоя, а
          не измерение. Справочный коэффициент MET из Compendium 2024 рассчитан на возраст 19–59
          лет.
        </p>
        <p className={styles.help}>
          Уточнения нагрузки меняют только оценку калорий. XP и лимит еды от неё не зависят.
          Показатель можно скрыть в настройках.
        </p>
        <a className="text-link" href={estimate.sourceUrl} target="_blank" rel="noreferrer">
          Источник коэффициентов
        </a>
      </details>
    </section>
  );
}
