import {
  ArrowRight,
  BookOpen,
  CalendarDays,
  ChevronRight,
  Footprints,
  RotateCcw,
} from "lucide-react";
import {
  DASHBOARD_ACHIEVEMENTS,
  WEEKDAY_LABELS,
  calendarWeek,
  dateKey,
} from "@/shared/dashboard-preview";
import Link from "next/link";
import type { Progress } from "@/shared/contracts";
import { isTerminalWorkout } from "@/shared/xp-policy";
import {
  dashboardAchievements,
  dashboardLevel,
  type AccountDashboardRuntime,
} from "./account-dashboard-runtime";
import styles from "./dashboard-preview.module.css";

export function AchievementIcon({ id }: { id: (typeof DASHBOARD_ACHIEVEMENTS)[number]["id"] }) {
  if (id === "first") return <Footprints aria-hidden="true" />;
  if (id === "rhythm") return <CalendarDays aria-hidden="true" />;
  return <RotateCcw aria-hidden="true" />;
}

export function JourneyArt() {
  return (
    <svg className={styles.journeyArt} viewBox="0 0 250 130" fill="none" aria-hidden="true">
      <circle cx="176" cy="29" r="21" fill="var(--dash-art-sun)" />
      <path
        d="M0 112 38 68 64 84 108 38 139 69 180 18 230 93 250 110V130H0Z"
        fill="var(--dash-art-mountain)"
      />
      <path
        d="m25 99 13-31 17 11 9 5 44-46 9 24 22 7 41-51 12 42 38 33"
        stroke="var(--dash-art-line)"
        strokeWidth="1.5"
      />
      <path
        d="M52 128c0-21 91-18 102-36 9-15-47-10-36-21 6-7 62-5 62-53"
        stroke="var(--dash-art-path)"
        strokeWidth="4"
        strokeLinecap="round"
      />
      <path
        d="M180 18V3m0 0 18 5-18 5"
        stroke="var(--dash-accent)"
        strokeWidth="2.5"
        strokeLinejoin="round"
      />
      <path d="m22 108 6-21 6 21H22Zm188 6 7-28 7 28h-14Z" fill="var(--dash-art-line)" />
      <path d="M28 108v11m189-5v10" stroke="var(--dash-art-line)" strokeWidth="2" />
      <path
        d="M65 33c4-9 14-9 18-3 4-4 12-1 13 4H63M3 49c6-6 14-6 20 0"
        stroke="var(--dash-art-line)"
        strokeWidth="2"
        opacity=".45"
      />
    </svg>
  );
}

export function CalendarCard({
  today,
  selected,
  onSelect,
  onOpen,
  accountRuntime,
}: {
  today: string;
  selected: string;
  onSelect: (day: string) => void;
  onOpen: () => void;
  accountRuntime?: AccountDashboardRuntime;
}) {
  const week = calendarWeek(today);
  return (
    <section className={`${styles.card} ${styles.calendarCard}`} aria-labelledby="upcoming-title">
      <div className={styles.sectionHeading}>
        <h2 id="upcoming-title">Ближайшие занятия</h2>
        <button
          type="button"
          className={styles.textAction}
          aria-label={accountRuntime ? "Открыть календарь" : "Добавить в календарь"}
          onClick={onOpen}
        >
          <span className={styles.fullCalendarLabel}>
            {accountRuntime ? "Календарь" : "Добавить в календарь"}
          </span>
          <span className={styles.compactCalendarLabel}>Календарь</span>
          <ArrowRight size={17} aria-hidden="true" />
        </button>
      </div>
      <div className={styles.week} role="group" aria-label="Дни этой недели">
        {week.map((date, index) => {
          const key = dateKey(date);
          const label = new Intl.DateTimeFormat("ru-RU", {
            weekday: "long",
            day: "numeric",
            month: "long",
            timeZone: "UTC",
          }).format(date);
          return (
            <button
              key={key}
              type="button"
              aria-label={label}
              aria-pressed={key === selected}
              aria-current={key === today ? "date" : undefined}
              onClick={() => onSelect(key)}
            >
              <span>{WEEKDAY_LABELS[index]}</span>
              <strong>{date.getUTCDate()}</strong>
            </button>
          );
        })}
      </div>
      <div className={styles.calendarEmpty}>
        <CalendarDays aria-hidden="true" />
        <div>
          {accountRuntime?.workout && !isTerminalWorkout(accountRuntime.workout.status) ? (
            <>
              <h3>{accountRuntime.workout.title}</h3>
              <p>
                {accountRuntime.workout.status === "active" ? "Занятие начато" : "Занятие готово"} ·
                около {accountRuntime.workout.estimatedMinutes} мин.
              </p>
              <Link href="/workout" className={styles.currentWorkoutLink}>
                {accountRuntime.workout.status === "active"
                  ? "Продолжить занятие"
                  : "Открыть занятие"}
                <ArrowRight size={17} aria-hidden="true" />
              </Link>
            </>
          ) : accountRuntime ? (
            <>
              <h3>Календарь скоро появится</h3>
              <p>Сейчас доступны разовые занятия и сохранённые программы.</p>
            </>
          ) : (
            <>
              <h3>{selected === today ? "Пока без расписания" : "На этот день занятий нет"}</h3>
              <p>Начни с разового занятия. Дни выберешь позже.</p>
            </>
          )}
        </div>
      </div>
    </section>
  );
}

export function JourneyCard({ onOpen, progress }: { onOpen: () => void; progress?: Progress }) {
  const { level, levelXp } = dashboardLevel(progress?.xp ?? 0);
  return (
    <section className={`${styles.card} ${styles.pathCard}`} aria-labelledby="path-title">
      <h2 id="path-title">Твой путь</h2>
      <div className={styles.levelRow}>
        <span className={styles.levelCircle} aria-label={`Уровень ${level}`}>
          {level}
        </span>
        <div className={styles.levelDetails}>
          <span>Уровень {level}</span>
          <strong>
            {levelXp} <span>/ 500 XP</span>
          </strong>
        </div>
        <JourneyArt />
      </div>
      <div
        className={styles.xpTrack}
        role="progressbar"
        aria-label={`Опыт до уровня ${level + 1}`}
        aria-valuemin={0}
        aria-valuemax={500}
        aria-valuenow={levelXp}
      >
        {levelXp > 0 ? (
          <span className={styles.xpFill} style={{ width: `${levelXp / 5}%` }} />
        ) : null}
      </div>
      <button type="button" className={styles.chapter} onClick={onOpen}>
        <BookOpen size={25} aria-hidden="true" />
        <span>
          <strong>Начало положено</strong>
          <small>
            {progress
              ? progress.completedWorkouts > 0
                ? `Полностью выполнено занятий: ${progress.completedWorkouts}`
                : "После первого занятия"
              : "После первого занятия"}
          </small>
        </span>
        <ChevronRight size={21} aria-hidden="true" />
      </button>
    </section>
  );
}

export function AchievementsCard({
  onOpen,
  progress,
}: {
  onOpen: () => void;
  progress?: Progress;
}) {
  const achievements = progress ? dashboardAchievements(progress) : DASHBOARD_ACHIEVEMENTS;
  return (
    <section
      className={`${styles.card} ${styles.achievementsCard}`}
      aria-labelledby="achievements-title"
    >
      <div className={styles.sectionHeading}>
        <h2 id="achievements-title">Достижения</h2>
        <button type="button" className={styles.textAction} onClick={onOpen}>
          Как получить
          <ArrowRight size={17} aria-hidden="true" />
        </button>
      </div>
      <div className={styles.achievements}>
        {achievements.map((item) => (
          <button
            type="button"
            key={item.id}
            className={styles.achievement}
            data-earned={"earned" in item && item.earned ? "true" : undefined}
            aria-label={`${item.title}: ${"earned" in item && item.earned ? "получено" : "как получить"}`}
            onClick={onOpen}
          >
            <span className={styles.achievementIcon}>
              <AchievementIcon id={item.id} />
            </span>
            <strong>{item.title}</strong>
            <small>{"earned" in item && item.earned ? "Получено" : item.description}</small>
          </button>
        ))}
      </div>
    </section>
  );
}
