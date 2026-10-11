"use client";

import Link from "next/link";
import { formatWorkoutEnergy } from "@/shared/workout-energy";
import { useState } from "react";
import {
  Award,
  ChartNoAxesColumnIncreasing,
  Dumbbell,
  Flame,
  Footprints,
  Trophy,
} from "lucide-react";
import { useMiron } from "@/client/use-miron";
import { PageHeading } from "./app-shell";

export function ProgressScreen() {
  const { profile, progress, isReady } = useMiron();
  const [today] = useState(() => Date.now());
  if (!isReady) return <div className="loading-state">Загружаем прогресс…</div>;
  const level = Math.floor(progress.xp / 500) + 1;
  const weekCounts = Array.from({ length: 6 }, (_, index) => {
    const end = today - (5 - index) * 7 * 86400000;
    const start = end - 7 * 86400000;
    return progress.history.filter((item) => {
      const time = new Date(item.completedAt).getTime();
      return item.status !== "aborted" && time > start && time <= end;
    }).length;
  });
  const maxCount = Math.max(1, ...weekCounts);
  const achievements = [
    { name: "Первый шаг", description: "Завершить своё первое занятие", goal: 1, icon: Footprints },
    { name: "Снова в деле", description: "Завершить три занятия", goal: 3, icon: Flame },
    { name: "Своя привычка", description: "Десять завершённых занятий", goal: 10, icon: Trophy },
  ];
  return (
    <>
      <PageHeading title="Твой прогресс" description="Здесь остаётся каждый сделанный шаг." />
      <div className="metric-row">
        <section className="card metric-card">
          <Dumbbell size={22} className="rose" />
          <div className="metric-value">{progress.completedWorkouts}</div>
          <div className="metric-label">Полностью выполнено занятий</div>
        </section>
        <section className="card metric-card">
          <Award size={22} className="rose" />
          <div className="metric-value">{level}</div>
          <div className="metric-label">Уровень твоего пути</div>
        </section>
        <section className="card metric-card">
          <Flame size={22} className="rose" />
          <div className="metric-value">{progress.xp}</div>
          <div className="metric-label">Опыт за занятия</div>
        </section>
      </div>
      <div className="progress-grid">
        <div className="settings-section">
          <section className="card chart-card">
            <div className="section-heading">
              <h2>Регулярность</h2>
              <span className="muted small">За 6 недель</span>
            </div>
            {progress.history.some((item) => item.status !== "aborted") ? (
              <div
                className="chart-bars"
                aria-label={`Занятий по неделям: ${weekCounts.join(", ")}`}
              >
                {weekCounts.map((count, index) => (
                  <div
                    className="chart-bar"
                    key={index}
                    style={{
                      height: `${Math.max(2, (count / maxCount) * 100)}%`,
                      background: count ? "var(--orange)" : "var(--line)",
                    }}
                  >
                    <span>{index === 5 ? "Эта неделя" : `${6 - index} нед. назад`}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="empty-state" style={{ padding: "25px 10px" }}>
                <ChartNoAxesColumnIncreasing size={30} />
                <p>
                  После первой тренировки здесь появится твой ритм. Начни с комфортного занятия.
                </p>
                <Link href="/programs" className="text-link">
                  Перейти к программе
                </Link>
              </div>
            )}
          </section>
          <section className="card">
            <div className="section-heading">
              <h2>История занятий</h2>
            </div>
            {progress.history.length ? (
              <div className="history-list">
                {progress.history.map((item) => (
                  <article className="history-item" key={item.id}>
                    <div>
                      <h3>{item.title}</h3>
                      <p>
                        {new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long" }).format(
                          new Date(item.completedAt),
                        )}{" "}
                        · {item.sets} подходов
                        {profile.showWorkoutEnergy !== false && item.energyEstimate
                          ? ` · ${formatWorkoutEnergy(item.energyEstimate)} от занятия`
                          : ""}
                      </p>
                      <p className="small muted">
                        {item.status === "partial"
                          ? "Закончено раньше · результаты сохранены"
                          : item.status === "aborted"
                            ? "Отменено без результатов"
                            : "План выполнен"}
                        {item.rewardKind === "support" ? " · короткий комплекс" : ""}
                      </p>
                    </div>
                    <span className="xp-badge">+{item.xp} XP</span>
                  </article>
                ))}
              </div>
            ) : (
              <p className="muted" style={{ padding: "8px 0 15px" }}>
                Пока без истории. Первое занятие станет первым шагом.
              </p>
            )}
          </section>
        </div>
        <section className="card">
          <div className="section-heading">
            <h2>Достижения</h2>
            <Trophy size={21} className="rose" />
          </div>
          {achievements.map(({ name, description, goal, icon: Icon }) => (
            <div
              className={`achievement ${progress.completedWorkouts >= goal ? "" : "locked"}`}
              key={name}
            >
              <div className="achievement-icon">
                <Icon size={21} />
              </div>
              <div>
                <h3>{name}</h3>
                <p>{progress.completedWorkouts >= goal ? "Получено" : description}</p>
              </div>
            </div>
          ))}
          <p className="field-help" style={{ marginTop: 23 }}>
            Уровень отражает твои занятия в MIRON. Это не оценка физической формы.
          </p>
        </section>
      </div>
    </>
  );
}
