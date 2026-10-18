"use client";

import { ArrowLeft, Award, CalendarCheck, Flame, Footprints } from "lucide-react";
import Link from "next/link";
import type { Progress } from "@/shared/contracts";
import { formatWorkoutEnergy } from "@/shared/workout-energy";
import { dashboardAchievements, dashboardLevel } from "./account-dashboard-runtime";
import styles from "./dashboard-home.module.css";
import { ProgressSections } from "./progress-sections";

const emptyProgress: Progress = { xp: 0, completedWorkouts: 0, history: [] };
const icons = { first: Footprints, rhythm: CalendarCheck, return: Flame };

export function DashboardProgressView({
  progress = emptyProgress,
  onBack,
}: {
  progress?: Progress;
  onBack: () => void;
}) {
  const { level, levelXp } = dashboardLevel(progress.xp);
  return (
    <section className={styles.progressPage} aria-label="Прогресс и достижения">
      <button type="button" className={styles.backLink} onClick={onBack}>
        <ArrowLeft size={19} aria-hidden="true" /> К разговору
      </button>
      <ProgressSections activityDays={progress.journey?.activityDays}>
        <div className={styles.progressOverview}>
          <div>
            <Award size={32} aria-hidden="true" />
            <h2>Уровень {level}</h2>
            <p>
              {progress.completedWorkouts
                ? "Каждое занятие — часть твоей истории."
                : "Начало твоей истории. Всё впереди."}
            </p>
          </div>
          <div className={styles.progressMeter}>
            <strong>
              {levelXp} <span>/ 500 XP</span>
            </strong>
            <div
              className={styles.xpTrack}
              role="progressbar"
              aria-label={`Опыт до уровня ${level + 1}`}
              aria-valuemin={0}
              aria-valuemax={500}
              aria-valuenow={levelXp}
            >
              <span style={{ width: `${levelXp / 5}%` }} />
            </div>
            <p>
              {500 - levelXp} XP до следующего уровня · {progress.xp} XP всего
            </p>
          </div>
        </div>
        <section className={styles.progressSection} aria-labelledby="dashboard-achievements-title">
          <div className={styles.progressSectionHeading}>
            <h2 id="dashboard-achievements-title">Твои достижения</h2>
            <span>{dashboardAchievements(progress).filter((item) => item.earned).length} из 3</span>
          </div>
          <div className={styles.achievements}>
            {dashboardAchievements(progress).map((achievement) => {
              const Icon = icons[achievement.id];
              return (
                <article
                  key={achievement.id}
                  className={styles.achievement}
                  data-earned={achievement.earned}
                >
                  <span className={styles.achievementIcon}>
                    <Icon size={30} aria-hidden="true" />
                  </span>
                  <div>
                    <h3>{achievement.title}</h3>
                    <p>{achievement.description}</p>
                    <small>
                      {achievement.earned
                        ? "Получено"
                        : `${Math.min(progress.completedWorkouts, achievement.goal)} / ${achievement.goal}`}
                    </small>
                  </div>
                </article>
              );
            })}
          </div>
        </section>
        <section className={styles.progressSection} aria-labelledby="dashboard-history-title">
          <div className={styles.progressSectionHeading}>
            <h2 id="dashboard-history-title">История занятий</h2>
            <span>{progress.completedWorkouts} завершено</span>
          </div>
          {progress.history.length ? (
            <ol className={styles.workoutHistory}>
              {progress.history.map((item) => (
                <li key={item.id}>
                  <div>
                    <h3>{item.title}</h3>
                    <Link href={`/workout/${item.id}`}>Записанные подходы</Link>
                    {item.status === "completed" || item.status === "partial" ? (
                      <Link href={`/workout-builder/start?source=history&id=${item.id}`}>
                        Повторить тренировку
                      </Link>
                    ) : null}
                    <p>
                      {new Intl.DateTimeFormat("ru-RU", {
                        day: "numeric",
                        month: "long",
                        year: "numeric",
                        timeZone: "Europe/Moscow",
                      }).format(new Date(item.completedAt))}{" "}
                      · {item.sets} подходов{item.status === "partial" ? " · часть занятия" : ""}
                      {item.energyEstimate ? ` · ${formatWorkoutEnergy(item.energyEstimate)}` : ""}
                    </p>
                  </div>
                  <strong>+{item.xp} XP</strong>
                </li>
              ))}
            </ol>
          ) : (
            <div className={styles.progressEmpty}>
              <Footprints size={28} aria-hidden="true" />
              <h3>Первое занятие ещё впереди</h3>
              <p>Здесь появятся сохранённые результаты и полученный опыт.</p>
            </div>
          )}
        </section>
        <details className={styles.xpExplanation}>
          <summary>Как начисляется опыт?</summary>
          <p>
            За полное основное занятие — 50 XP, за частичное — 25. За короткое поддерживающее
            занятие — 20 или 10 XP. За день можно получить до 50 XP. Оценка нагрузки на опыт не
            влияет.
          </p>
          <p>Опыт и достижения принадлежат тебе и сохраняются при смене напарника.</p>
        </details>
      </ProgressSections>
    </section>
  );
}
