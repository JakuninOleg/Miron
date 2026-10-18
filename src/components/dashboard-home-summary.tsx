import Image from "next/image";
import { Check, ChevronRight } from "lucide-react";
import type { CompanionId, Progress } from "@/shared/contracts";
import { calendarWeek, dateKey, WEEKDAY_LABELS } from "@/shared/dashboard-preview";
import { dashboardLevel } from "./account-dashboard-runtime";
import styles from "./dashboard-home.module.css";

export function DashboardLevel({ progress, onOpen }: { progress?: Progress; onOpen: () => void }) {
  const { level, levelXp } = dashboardLevel(progress?.xp ?? 0);
  return (
    <button
      type="button"
      className={styles.levelLink}
      onClick={onOpen}
      aria-label={`Уровень ${level}. Открыть прогресс`}
      data-dashboard-chrome
    >
      <strong>Уровень {level}</strong>
      <span className={styles.levelNumbers}>
        {levelXp} <span>/ 500 XP</span>
      </span>
      <span
        className={styles.xpTrack}
        role="progressbar"
        aria-label={`Опыт до уровня ${level + 1}`}
        aria-valuemin={0}
        aria-valuemax={500}
        aria-valuenow={levelXp}
      >
        <span style={{ width: `${levelXp / 5}%` }} />
      </span>
      <ChevronRight size={22} aria-hidden="true" />
    </button>
  );
}

export function DashboardScene({ companion }: { companion: CompanionId }) {
  return (
    <div className={styles.desktopScene} aria-hidden="true" data-testid="dashboard-desktop-mascot">
      <picture>
        <source
          media="(max-width: 850px)"
          srcSet={`/visuals/soft-3d/dashboard/${companion}-mobile-v1.webp`}
        />
        <Image
          src={`/visuals/soft-3d/dashboard/${companion}-desktop-v1.webp`}
          alt=""
          fill
          sizes="(max-width: 850px) 1px, (max-width: 1200px) 35vw, 42vw"
          loading="eager"
          unoptimized
        />
      </picture>
    </div>
  );
}

/** These marks describe confirmed past activity, never an invented future schedule. */
export function DashboardWeek({
  today,
  progress,
  timezone,
  onOpen,
}: {
  today: string;
  progress?: Progress;
  timezone?: string;
  onOpen: () => void;
}) {
  const week = calendarWeek(today);
  const completed = new Set<string>();
  const dayFormatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone || "Europe/Moscow",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  for (const item of progress?.history ?? []) {
    if (item.status === "aborted" || !Number.isFinite(Date.parse(item.completedAt))) continue;
    // The calendar follows the person's timezone; XP rewardDay is a separate accounting day.
    const parts = dayFormatter.formatToParts(new Date(item.completedAt));
    const key = `${parts.find((part) => part.type === "year")?.value}-${parts.find((part) => part.type === "month")?.value}-${parts.find((part) => part.type === "day")?.value}`;
    completed.add(key);
  }
  const daysThisWeek = week.filter((date) => completed.has(dateKey(date))).length;
  return (
    <section
      className={styles.weekCard}
      aria-labelledby="dashboard-week-title"
      data-dashboard-chrome
    >
      <div className={styles.weekHeading}>
        <h2 id="dashboard-week-title">Твоя неделя</h2>
        <button type="button" onClick={onOpen} aria-label="Открыть календарь">
          Календарь <ChevronRight size={17} aria-hidden="true" />
        </button>
      </div>
      <div className={styles.weekDays}>
        {week.map((date, index) => {
          const key = dateKey(date);
          const done = completed.has(key);
          const label = new Intl.DateTimeFormat("ru-RU", {
            day: "numeric",
            month: "long",
            timeZone: "UTC",
          }).format(date);
          return (
            <div
              key={key}
              className={styles.weekDay}
              data-today={key === today}
              data-done={done}
              aria-label={`${label}${key === today ? ", сегодня" : ""}${done ? ", занятие сохранено" : ""}`}
            >
              <span>{WEEKDAY_LABELS[index]}</span>
              <small>{date.getUTCDate()}</small>
              <span className={styles.dayMark}>
                {done ? <Check size={18} aria-hidden="true" /> : null}
              </span>
              <span className={styles.dayCaption}>
                {done ? "Занятие" : key === today ? "Сегодня" : ""}
              </span>
            </div>
          );
        })}
      </div>
      <p className={styles.weekNote}>
        {daysThisWeek
          ? `Дней с занятиями на этой неделе: ${daysThisWeek}`
          : "Начни с одного занятия. Найдём твой ритм."}
      </p>
    </section>
  );
}
