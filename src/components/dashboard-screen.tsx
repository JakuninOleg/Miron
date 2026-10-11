"use client";
import Image from "next/image";

import Link from "next/link";
import { useState } from "react";
import {
  ArrowUpRight,
  Check,
  Clock3,
  Download,
  Dumbbell,
  MessageCircle,
  Play,
  Send,
} from "lucide-react";
import { useMiron } from "@/client/use-miron";
import { isTerminalWorkout } from "@/shared/xp-policy";
import { useRouter } from "next/navigation";
import { PageHeading } from "./app-shell";
import { CompanionStage, CompanionSwitch, companionNames } from "./companion";
import type { Profile, Workout } from "@/shared/contracts";
import { DEMO_EXERCISES } from "@/shared/demo";

export const weekdays = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];
export function WeekStrip({ profile }: { profile: Profile }) {
  const today = (new Date().getDay() + 6) % 7;
  const planned = profile.trainingDays;
  return (
    <div className="week-strip">
      {weekdays.map((day, index) => (
        <div key={day} className={`week-day ${index === today ? "today" : ""}`}>
          <span>{day}</span>
          <span className={`day-circle ${planned.includes(index) ? "planned" : ""}`}>
            {planned.includes(index) ? (
              index === today ? (
                <Play size={12} fill="currentColor" />
              ) : (
                <span
                  style={{ height: 5, width: 5, borderRadius: "50%", background: "currentColor" }}
                />
              )
            ) : null}
          </span>
          <small>{index === today ? "Сегодня" : planned.includes(index) ? "План" : "Отдых"}</small>
        </div>
      ))}
    </div>
  );
}

export function WorkoutSummary({ workout, onStart }: { workout: Workout; onStart: () => void }) {
  return (
    <div className="workout-summary">
      <div className="workout-summary-header">
        <div>
          <h3>{workout.title}</h3>
          <p className="muted small" style={{ marginTop: 5 }}>
            {workout.subtitle}
          </p>
        </div>
        <Dumbbell size={25} className="rose" />
      </div>
      <div className="workout-meta">
        <span>
          <Clock3 size={14} />
          {workout.estimatedMinutes} минут
        </span>
        <span>
          <Dumbbell size={14} />
          {workout.exercises.length} упражнения
        </span>
      </div>
      <ol className="exercise-preview">
        {workout.exercises.slice(0, 3).map((exercise, index) => (
          <li key={exercise.id}>
            <span className="exercise-preview-number">{index + 1}</span>
            {exercise.name}
          </li>
        ))}
        {workout.exercises.length > 3 ? (
          <li className="muted small">И ещё {workout.exercises.length - 3} упражнения</li>
        ) : null}
      </ol>
      <div className="summary-actions">
        <button className="button" onClick={onStart}>
          <Play size={16} fill="currentColor" />
          {workout.status === "active" ? "Продолжить тренировку" : "Начать тренировку"}
        </button>
        <Link href="/programs" className="text-link">
          Посмотреть план
          <ArrowUpRight size={15} />
        </Link>
      </div>
    </div>
  );
}

export function DashboardScreen() {
  const {
    profile,
    progress,
    workout,
    isReady,
    isDemo,
    switchCompanion,
    startWorkout,
    sendMessage,
    downloadWorkout,
  } = useMiron();
  const router = useRouter();
  const [text, setText] = useState("");
  const [downloaded, setDownloaded] = useState(false);
  const [localError, setLocalError] = useState("");
  if (!isReady || !profile) return <div className="loading-state">Готовим твой день…</div>;
  async function begin() {
    try {
      await startWorkout();
      router.push("/workout");
    } catch (cause) {
      setLocalError(cause instanceof Error ? cause.message : "Не удалось начать тренировку.");
    }
  }
  async function ask(message: string) {
    if (!message.trim()) return;
    router.push("/chat");
    await sendMessage(message.trim());
  }
  async function download() {
    try {
      await downloadWorkout();
      setDownloaded(true);
    } catch (cause) {
      setLocalError(cause instanceof Error ? cause.message : "Не удалось загрузить тренировку.");
    }
  }
  const date = new Intl.DateTimeFormat("ru-RU", {
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(new Date());
  const displayWorkout: Workout | null =
    workout ??
    (isDemo
      ? {
          id: "demo-preview",
          title: "Первый шаг",
          subtitle: "Демонстрационное занятие · Всё тело",
          estimatedMinutes: profile.durationMinutes,
          exercises: profile.equipment.some((item) => item.code === "dumbbell")
            ? DEMO_EXERCISES
            : DEMO_EXERCISES.slice(0, 3),
          currentIndex: 0,
          status: "ready",
          revision: 0,
          recordedSets: [],
          startedAt: null,
          completedAt: null,
        }
      : null);
  return (
    <>
      <PageHeading
        title={`Привет${profile.name ? `, ${profile.name}` : ""}`}
        description={date.charAt(0).toUpperCase() + date.slice(1)}
        action={
          <div className="top-controls">
            <CompanionSwitch companion={profile.companion} onChange={switchCompanion} />
          </div>
        }
      />
      {localError ? (
        <p className="error-text" role="alert" style={{ marginBottom: 16 }}>
          {localError}
        </p>
      ) : null}
      <div className="dashboard-top">
        <section className="card conversation-card">
          <div className="section-heading">
            <h2>Твой день в MIRON</h2>
            <MessageCircle size={19} className="muted" />
          </div>
          <div className="greeting-line">
            <span className="status-dot" />
            {companionNames[profile.companion]} рядом
          </div>
          <div className="conversation-row">
            <Image
              unoptimized
              width={768}
              height={1152}
              className="mini-avatar"
              src={`/characters/${profile.companion}-avatar.webp`}
              alt=""
            />
            <p className="chat-bubble">
              {profile.companion === "max"
                ? "Погнали? Сегодня работаем в твоём темпе. Начнём с короткого занятия."
                : "Есть немного времени для себя? Давай начнём спокойно, шаг за шагом."}
            </p>
          </div>
          {displayWorkout && !isTerminalWorkout(displayWorkout.status) ? (
            <WorkoutSummary workout={displayWorkout} onStart={begin} />
          ) : (
            <div className="workout-summary">
              <h3>
                {workout && isTerminalWorkout(workout.status)
                  ? "Занятие сохранено"
                  : "План начинается с тебя"}
              </h3>
              <p className="program-description">
                {workout && isTerminalWorkout(workout.status)
                  ? "Занятие сохранено. Сейчас можно отдохнуть и посмотреть свой прогресс."
                  : isDemo
                    ? "Укажи условия, и познакомимся с демонстрационной тренировкой."
                    : "Опубликованные программы пока готовятся. Твои условия сохранены; напарник и настройки уже доступны."}
              </p>
              <Link
                href={workout && isTerminalWorkout(workout.status) ? "/progress" : "/onboarding"}
                className="button"
              >
                {workout && isTerminalWorkout(workout.status)
                  ? "Посмотреть прогресс"
                  : "Мои условия"}
                <ArrowUpRight size={16} />
              </Link>
            </div>
          )}
          {isDemo && workout && isTerminalWorkout(workout.status) ? (
            <button className="button full" style={{ marginTop: 16 }} onClick={begin}>
              <Play size={16} fill="currentColor" />
              {workout ? "Новое демо-занятие" : "Начать демо-занятие"}
            </button>
          ) : null}
          <form
            className="quick-chat"
            onSubmit={(event) => {
              event.preventDefault();
              void ask(text);
            }}
          >
            <label className="sr-only" htmlFor="quick-message">
              Сообщение напарнику
            </label>
            <input
              className="input"
              id="quick-message"
              placeholder="Напиши напарнику…"
              value={text}
              onChange={(event) => setText(event.target.value)}
              maxLength={1000}
            />
            <button
              className="icon-button"
              aria-label="Отправить сообщение"
              disabled={!text.trim()}
            >
              <Send size={19} />
            </button>
          </form>
          <div className="quick-prompts">
            <button
              className="quick-prompt"
              onClick={() => void ask("Сегодня мало времени. Что можно успеть?")}
            >
              Сегодня мало времени
            </button>
            <button
              className="quick-prompt"
              onClick={() => void ask("Как подготовиться к тренировке?")}
            >
              Как подготовиться?
            </button>
            {workout ? (
              <button className="quick-prompt" onClick={download}>
                {downloaded ? (
                  <Check size={11} style={{ display: "inline", marginRight: 4 }} />
                ) : (
                  <Download size={11} style={{ display: "inline", marginRight: 4 }} />
                )}
                {downloaded ? "Сохранено на устройстве" : "Загрузить занятие"}
              </button>
            ) : null}
          </div>
        </section>
        <CompanionStage companion={profile.companion} progress={progress} />
      </div>
      <div className="dashboard-bottom">
        <section className="card week-card">
          <div className="section-heading">
            <h2>Твоя неделя</h2>
            <Link href="/programs" className="text-link small">
              План
              <ArrowUpRight size={14} />
            </Link>
          </div>
          <WeekStrip profile={profile} />
        </section>
        <aside className="quote-note">
          <p>
            {progress.completedWorkouts > 0
              ? "Ты уже начал. Каждый следующий шаг делает привычку крепче."
              : "Не нужно менять всю жизнь за один день. Начни с одного занятия."}
          </p>
          <span className="hand-note">В твоём темпе.</span>
        </aside>
      </div>
    </>
  );
}
