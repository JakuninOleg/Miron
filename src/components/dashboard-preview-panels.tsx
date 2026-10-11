"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  ArrowRight,
  BookOpen,
  Check,
  ChevronLeft,
  ChevronRight,
  Dumbbell,
  Mic,
  LogOut,
  RotateCcw,
  X,
} from "lucide-react";
import type { CompanionId } from "@/shared/contracts";
import { formatWorkoutEnergy } from "@/shared/workout-energy";
import {
  DASHBOARD_ACHIEVEMENTS,
  DASHBOARD_CHAPTERS,
  WEEKDAY_LABELS,
  calendarMonth,
  dateKey,
  shiftMonth,
  type DashboardIntent,
  type DashboardPanel,
} from "@/shared/dashboard-preview";
import { STORY_INTERESTS } from "@/shared/story-content";
import { AchievementIcon, JourneyArt } from "./dashboard-preview-cards";
import styles from "./dashboard-preview.module.css";
import { isTerminalWorkout } from "@/shared/xp-policy";
import {
  dashboardAchievements,
  dashboardLevel,
  type AccountDashboardRuntime,
} from "./account-dashboard-runtime";

const titles: Record<DashboardPanel, string> = {
  workouts: "Твои тренировки",
  calendar: "Твой календарь",
  path: "Твой путь",
  achievements: "Твои достижения",
  companions: "Твои напарники",
  profile: "Твоё пространство",
  voice: "Голосовые сообщения",
};

export function DashboardPanels({
  panel,
  companion,
  today,
  interests,
  onClose,
  onSelectCompanion,
  onOpenCompanions,
  onPrepare,
  onReplay,
  accountRuntime,
}: {
  panel: DashboardPanel;
  companion: CompanionId;
  today: string;
  interests: string[];
  onClose: () => void;
  onSelectCompanion: (id: CompanionId) => void;
  onOpenCompanions: () => void;
  onPrepare: (intent: DashboardIntent) => void;
  onReplay: () => void;
  accountRuntime?: AccountDashboardRuntime;
}) {
  let content: ReactNode;
  if (panel === "calendar")
    content = (
      <MonthCalendar
        today={today}
        onPrepare={() => onPrepare("workout")}
        accountRuntime={accountRuntime}
      />
    );
  else if (panel === "companions")
    content = (
      <CompanionPanel
        companion={companion}
        onSelect={onSelectCompanion}
        accountRuntime={accountRuntime}
      />
    );
  else if (panel === "achievements")
    content = <AchievementsPanel accountRuntime={accountRuntime} />;
  else if (panel === "path")
    content = <PathPanel companion={companion} accountRuntime={accountRuntime} />;
  else if (panel === "profile" && accountRuntime)
    content = (
      <AccountProfilePanel
        runtime={accountRuntime}
        interests={interests}
        onOpenCompanions={onOpenCompanions}
        onReplay={onReplay}
      />
    );
  else if (panel === "profile")
    content = (
      <>
        <p className={styles.panelLead}>Твой темп. Твоя история.</p>
        <div className={styles.profileSummary}>
          <span className={styles.profileCircle}>А</span>
          <div>
            <h3>Артём</h3>
            <p>Пример профиля · дизайн-прототип</p>
          </div>
        </div>
        <button type="button" className={styles.panelSecondary} onClick={onOpenCompanions}>
          Напарники · сейчас {companion === "max" ? "Макс" : "Лика"}
          <ArrowRight size={18} aria-hidden="true" />
        </button>
        <h3 className={styles.panelSubheading}>Тебе интересно</h3>
        <div className={styles.interestTags}>
          {interests.length ? (
            STORY_INTERESTS.filter((item) => interests.includes(item.id)).map((item) => (
              <span key={item.id}>{item.label}</span>
            ))
          ) : (
            <p>Пока знакомимся — интересы можно обсудить позже.</p>
          )}
        </div>
        <div className={styles.panelNote}>
          <h3>7 дней полного MIRON</h3>
          <p>
            Пробная неделя начинается при регистрации. Затем — один абонемент 299 ₽ в месяц. В этом
            прототипе регистрация и пробная неделя не запускаются.
          </p>
        </div>
        <button type="button" className={styles.panelSecondary} onClick={onReplay}>
          <RotateCcw size={19} aria-hidden="true" />
          Пройти знакомство заново
        </button>
      </>
    );
  else if (panel === "voice")
    content = (
      <>
        <span className={styles.panelEmptyIcon}>
          <Mic aria-hidden="true" />
        </span>
        <p className={styles.panelLead}>Скажи своими словами.</p>
        <p className={styles.panelBody}>
          Голосовые сообщения пока не подключены. Сейчас можно написать напарнику — запись и доступ
          к микрофону не запускаются.
        </p>
        <button type="button" className={styles.primaryAction} onClick={onClose}>
          Понятно
          <ArrowRight size={20} aria-hidden="true" />
        </button>
      </>
    );
  else if (accountRuntime) content = <AccountWorkoutsPanel runtime={accountRuntime} />;
  else
    content = (
      <>
        <span className={styles.panelEmptyIcon}>
          <Dumbbell aria-hidden="true" />
        </span>
        <p className={styles.panelLead}>Первое занятие начинается с тебя.</p>
        <p className={styles.panelBody}>
          Собери тренировку из каталога и сохрани в личную библиотеку. Название, упражнения, подходы
          и отдых можно менять.
        </p>
        <div className={styles.panelNote}>
          Для первого занятия программа на неделю не нужна. Начни с того, что подходит тебе сегодня.
        </div>
        <button type="button" className={styles.primaryAction} onClick={() => onPrepare("workout")}>
          Собрать с напарником
          <ArrowRight size={20} aria-hidden="true" />
        </button>
        <Link
          className={styles.panelSecondary}
          href={`/workout-builder?from=story&theme=${companion === "lika" ? "rose" : "dark"}`}
        >
          Собрать самому
          <Dumbbell size={20} aria-hidden="true" />
        </Link>
      </>
    );
  return (
    <PreviewDialog title={titles[panel]} onClose={onClose}>
      {accountRuntime?.error ? (
        <p className={styles.panelNote} role="status">
          {accountRuntime.error}
        </p>
      ) : null}
      {content}
    </PreviewDialog>
  );
}

function PreviewDialog({
  title,
  children,
  onClose,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    const dialog = dialogRef.current;
    const previous = document.activeElement;
    dialog?.showModal();
    titleRef.current?.focus({ preventScroll: true });
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      dialog?.close();
      document.body.style.overflow = previousOverflow;
      if (previous instanceof HTMLElement && previous.isConnected)
        previous.focus({ preventScroll: true });
    };
  }, []);
  return (
    <dialog
      ref={dialogRef}
      className={styles.dialog}
      aria-labelledby="dashboard-panel-title"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className={styles.dialogContent}>
        <header className={styles.dialogHeader}>
          <h2 ref={titleRef} tabIndex={-1} id="dashboard-panel-title">
            {title}
          </h2>
          <button
            type="button"
            className={styles.closeButton}
            onClick={onClose}
            aria-label="Закрыть панель"
          >
            <X size={23} aria-hidden="true" />
          </button>
        </header>
        <div className={styles.dialogBody}>{children}</div>
      </div>
    </dialog>
  );
}

function MonthCalendar({
  today,
  onPrepare,
  accountRuntime,
}: {
  today: string;
  onPrepare: () => void;
  accountRuntime?: AccountDashboardRuntime;
}) {
  const [month, setMonth] = useState(today.slice(0, 7));
  const [selected, setSelected] = useState(today);
  const monthName = new Intl.DateTimeFormat("ru-RU", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${month}-01T12:00:00Z`));
  const selectedLabel = new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  }).format(new Date(`${selected}T12:00:00Z`));
  return (
    <>
      <p className={styles.panelBody}>
        {accountRuntime
          ? "Календарь занятий скоро появится. Пока здесь можно посмотреть даты; выбор дня не сохраняет расписание."
          : "Занятия в удобные дни. Точное время выбирать не обязательно."}
      </p>
      <div className={styles.monthHeading}>
        <button
          type="button"
          aria-label="Предыдущий месяц"
          onClick={() => setMonth(shiftMonth(month, -1))}
        >
          <ChevronLeft size={21} aria-hidden="true" />
        </button>
        <h3>{monthName}</h3>
        <button
          type="button"
          aria-label="Следующий месяц"
          onClick={() => setMonth(shiftMonth(month, 1))}
        >
          <ChevronRight size={21} aria-hidden="true" />
        </button>
      </div>
      <div className={styles.monthGrid} role="group" aria-label="Выбор дня">
        {WEEKDAY_LABELS.map((day) => (
          <span className={styles.monthWeekday} key={day}>
            {day}
          </span>
        ))}
        {calendarMonth(month).map((date, index) =>
          date ? (
            <button
              type="button"
              key={dateKey(date)}
              aria-label={new Intl.DateTimeFormat("ru-RU", {
                day: "numeric",
                month: "long",
                timeZone: "UTC",
              }).format(date)}
              aria-pressed={selected === dateKey(date)}
              aria-current={today === dateKey(date) ? "date" : undefined}
              onClick={() => setSelected(dateKey(date))}
            >
              {date.getUTCDate()}
            </button>
          ) : (
            <span key={`empty-${index}`} />
          ),
        )}
      </div>
      <div className={styles.panelNote}>
        <h3>
          {accountRuntime ? "Планирование занятий готовится" : `${selectedLabel}: пока без занятий`}
        </h3>
        <p>
          {accountRuntime
            ? "Подбор и самостоятельный конструктор уже доступны. Сохранённую программу можно открыть и выбрать занятие."
            : "Сначала обсудим и подтвердим тренировку. Потом её можно будет добавить сюда. Выбор дня сам по себе ничего не планирует."}
        </p>
      </div>
      {accountRuntime ? (
        <Link className={styles.primaryAction} href="/workout-builder?from=dashboard&mode=single">
          Подобрать занятие
          <ArrowRight size={20} aria-hidden="true" />
        </Link>
      ) : (
        <button type="button" className={styles.primaryAction} onClick={onPrepare}>
          Обсудить занятие
          <ArrowRight size={20} aria-hidden="true" />
        </button>
      )}
    </>
  );
}

function CompanionPanel({
  companion,
  onSelect,
  accountRuntime,
}: {
  companion: CompanionId;
  onSelect: (id: CompanionId) => void;
  accountRuntime?: AccountDashboardRuntime;
}) {
  return (
    <>
      <p className={styles.panelLead}>Одна команда. Два характера.</p>
      <p className={styles.panelBody}>
        {accountRuntime
          ? "Смена напарника не сбрасывает тренировки, уровень и достижения. Твой путь продолжается с того же места."
          : "Тренировки, уровень и достижения у вас общие. У каждого напарника — свой разговор и своя история общения с тобой."}
      </p>
      <div className={styles.coachChoices}>
        {(["max", "lika"] as const).map((id) => (
          <button
            key={id}
            type="button"
            data-coach={id}
            aria-pressed={companion === id}
            disabled={
              accountRuntime &&
              (accountRuntime.companionLocked ||
                accountRuntime.companionBusy ||
                !accountRuntime.isOnline)
            }
            onClick={() => onSelect(id)}
          >
            <div className={styles.choicePortrait}>
              <Image
                src={`/story-choose/${id}-v1.webp`}
                alt=""
                width={1024}
                height={1536}
                sizes="(max-width: 600px) 40vw, 220px"
              />
            </div>
            <div className={styles.choiceCopy}>
              <strong>{id === "max" ? "Макс" : "Лика"}</strong>
              <span>
                {id === "max"
                  ? "Прямой. Энергичный. На твоей стороне."
                  : "Внимательная. Спокойная. С характером."}
              </span>
            </div>
          </button>
        ))}
      </div>
      <p className={styles.panelBody}>
        {accountRuntime?.companionLocked
          ? "Напарник закреплён за текущим занятием. Сначала заверши или останови его на экране тренировки."
          : accountRuntime?.companionBusy
            ? "Сохраняем выбор напарника…"
            : accountRuntime && !accountRuntime.isOnline
              ? "Для смены напарника подключись к интернету."
              : "Переключайся, когда захочется. Твой путь продолжается с того же места."}
      </p>
    </>
  );
}

function AchievementsPanel({ accountRuntime }: { accountRuntime?: AccountDashboardRuntime }) {
  const achievements = accountRuntime
    ? dashboardAchievements(accountRuntime.progress)
    : DASHBOARD_ACHIEVEMENTS;
  return (
    <>
      <p className={styles.panelLead}>Маленькие события. Твоя история.</p>
      <p className={styles.panelBody}>
        {accountRuntime
          ? "Достижения появляются после подтверждения полностью выполненных занятий. Пауза не стирает полученные награды."
          : "Пока иконки серые. Когда условие выполнено, достижение станет цветным и останется с тобой."}
      </p>
      <div className={styles.achievementRules}>
        {achievements.map((item) => (
          <article key={item.id} data-earned={"earned" in item && item.earned ? "true" : undefined}>
            <span className={styles.achievementIcon}>
              <AchievementIcon id={item.id} />
            </span>
            <div>
              <h3>{item.title}</h3>
              <p>
                {"earned" in item ? (item.earned ? "Получено" : item.description) : item.condition}
              </p>
            </div>
          </article>
        ))}
      </div>
      <div className={styles.panelNote}>
        Без замков, гонки и исчезающих наград. Пауза не стирает то, что уже получилось.
      </div>
    </>
  );
}

function PathPanel({
  companion,
  accountRuntime,
}: {
  companion: CompanionId;
  accountRuntime?: AccountDashboardRuntime;
}) {
  const { level, levelXp } = dashboardLevel(accountRuntime?.progress.xp ?? 0);
  return (
    <>
      <div className={styles.pathIntroduction}>
        <div>
          <p className={styles.panelLead}>
            {accountRuntime && accountRuntime.progress.completedWorkouts > 0
              ? "Твой путь продолжается."
              : "Всё только начинается."}
          </p>
          <p className={styles.panelBody}>
            Уровень {level} · {levelXp} / 500 XP
          </p>
          {accountRuntime ? (
            <p className={styles.panelBody}>
              Всего: {accountRuntime.progress.xp} XP · полностью выполнено занятий:{" "}
              {accountRuntime.progress.completedWorkouts}
            </p>
          ) : null}
        </div>
        <JourneyArt />
      </div>
      <div className={styles.timelineStart}>
        <Check size={20} aria-hidden="true" />
        <div>
          <h3>Знакомство состоялось</h3>
          <p>
            {accountRuntime
              ? `Сейчас с тобой ${companion === "max" ? "Макс" : "Лика"}. Сохранённые результаты остаются с тобой при смене напарника.`
              : `Начинаешь с ${companion === "max" ? "Максом" : "Ликой"}. Напарника всегда можно поменять.`}
          </p>
        </div>
      </div>
      {accountRuntime ? (
        <AccountHistory runtime={accountRuntime} />
      ) : (
        <>
          <h3 className={styles.panelSubheading}>Главы твоей истории</h3>
          <ol className={styles.chapterList}>
            {DASHBOARD_CHAPTERS.map((chapter, index) => (
              <li key={chapter}>
                <BookOpen size={19} aria-hidden="true" />
                <div>
                  <strong>{chapter}</strong>
                  {index === 0 ? <p>После первого занятия</p> : null}
                </div>
              </li>
            ))}
          </ol>
        </>
      )}
      <div className={styles.panelNote}>
        <h3>Уровни продолжаются</h3>
        <p>
          Каждые 500 подтверждённых XP — новый уровень. Основное занятие: 50 XP за полное или 25 за
          частичное. Короткое поддерживающее: 20 или 10 XP. За день — до 50 XP; второе занятие может
          добавить разницу.
        </p>
      </div>
    </>
  );
}

function AccountProfilePanel({
  runtime,
  interests,
  onOpenCompanions,
  onReplay,
}: {
  runtime: AccountDashboardRuntime;
  interests: string[];
  onOpenCompanions: () => void;
  onReplay: () => void;
}) {
  const trialEnd = new Date(runtime.trial.endsAt);
  const trialEndLabel = Number.isFinite(trialEnd.getTime())
    ? new Intl.DateTimeFormat("ru-RU", {
        day: "numeric",
        month: "long",
        hour: "2-digit",
        minute: "2-digit",
        timeZone: "Europe/Moscow",
      }).format(trialEnd)
    : null;
  return (
    <>
      <p className={styles.panelLead}>Твой темп. Твоя история.</p>
      <div className={styles.profileSummary}>
        <span className={styles.profileCircle}>
          {runtime.profile.name.slice(0, 1).toLocaleUpperCase("ru-RU") || "М"}
        </span>
        <div>
          <h3>{runtime.profile.name || "Твой профиль"}</h3>
          <p>Участник MIRON</p>
        </div>
      </div>
      <button type="button" className={styles.panelSecondary} onClick={onOpenCompanions}>
        Напарники · сейчас {runtime.profile.companion === "max" ? "Макс" : "Лика"}
        <ArrowRight size={18} aria-hidden="true" />
      </button>
      <h3 className={styles.panelSubheading}>Тебе интересно</h3>
      <div className={styles.interestTags}>
        {interests.length ? (
          STORY_INTERESTS.filter((item) => interests.includes(item.id)).map((item) => (
            <span key={item.id}>{item.label}</span>
          ))
        ) : (
          <p>Интересы пока не выбраны.</p>
        )}
      </div>
      <div className={styles.panelNote}>
        <h3>{runtime.trialActive ? "Твой пробный период" : "Пробный период завершён"}</h3>
        {trialEndLabel ? (
          <p>
            {runtime.trialActive ? "До" : "Завершился"} {trialEndLabel} МСК.
          </p>
        ) : (
          <p>Не удалось прочитать дату пробного периода.</p>
        )}
        <p>
          Ответов использовано: {runtime.trial.repliesUsed} из {runtime.trial.replyLimit}. Свободный
          диалог пока не подключён.
        </p>
      </div>
      <Link href="/settings" className={styles.panelSecondary}>
        Настройки профиля и темы
        <ArrowRight size={18} aria-hidden="true" />
      </Link>
      {runtime.allowReplay ? (
        <button type="button" className={styles.panelSecondary} onClick={onReplay}>
          <RotateCcw size={19} aria-hidden="true" />
          Пройти знакомство заново
        </button>
      ) : null}
      <button
        type="button"
        className={styles.panelSecondary}
        disabled={runtime.logoutBusy}
        onClick={() => void runtime.onLogout().catch(() => undefined)}
      >
        <LogOut size={19} aria-hidden="true" />
        {runtime.logoutBusy ? "Выходим…" : "Выйти из аккаунта"}
      </button>
    </>
  );
}

function AccountWorkoutsPanel({ runtime }: { runtime: AccountDashboardRuntime }) {
  const current =
    runtime.workout && !isTerminalWorkout(runtime.workout.status) ? runtime.workout : null;
  return (
    <>
      <span className={styles.panelEmptyIcon}>
        <Dumbbell aria-hidden="true" />
      </span>
      <p className={styles.panelLead}>Занятие под твои условия.</p>
      <p className={styles.panelBody}>
        Подбери готовый черновик или собери свой из каталога. Упражнения, подходы и отдых можно
        менять.
      </p>
      {current ? (
        <div className={styles.panelNote}>
          <h3>{current.title}</h3>
          <p>Текущее занятие · около {current.estimatedMinutes} мин.</p>
          <Link className={styles.currentWorkoutLink} href="/workout">
            {current.status === "active" ? "Продолжить занятие" : "Открыть занятие"}
            <ArrowRight size={17} aria-hidden="true" />
          </Link>
        </div>
      ) : null}
      <Link className={styles.primaryAction} href="/workout-builder?from=dashboard&mode=single">
        Подобрать разовое занятие
        <ArrowRight size={20} aria-hidden="true" />
      </Link>
      <Link className={styles.panelSecondary} href="/workout-builder?from=dashboard&mode=program">
        Программа и сохранённые занятия
        <ArrowRight size={20} aria-hidden="true" />
      </Link>
      <Link className={styles.panelSecondary} href="/workout-builder?from=dashboard">
        Собрать самому
        <Dumbbell size={20} aria-hidden="true" />
      </Link>
      <p className={styles.panelBody}>
        Библиотека тренировок и каталог содержат черновики. Выбирай знакомые движения и посильную
        нагрузку.
      </p>
    </>
  );
}

function AccountHistory({ runtime }: { runtime: AccountDashboardRuntime }) {
  return (
    <>
      <h3 className={styles.panelSubheading}>История занятий</h3>
      {runtime.progress.history.length ? (
        <ol className={styles.accountHistory}>
          {runtime.progress.history.slice(0, 10).map((item) => (
            <li key={item.id}>
              <div>
                <h3>{item.title}</h3>
                <p>
                  {new Intl.DateTimeFormat("ru-RU", {
                    day: "numeric",
                    month: "long",
                    timeZone: "Europe/Moscow",
                  }).format(new Date(item.completedAt))}{" "}
                  · {item.sets} подходов
                  {runtime.profile.showWorkoutEnergy !== false && item.energyEstimate
                    ? ` · ${formatWorkoutEnergy(item.energyEstimate)} от занятия`
                    : ""}
                </p>
                <p>
                  {item.status === "aborted"
                    ? "Отменено без результатов"
                    : item.status === "partial"
                      ? "Завершено частично"
                      : "План выполнен"}
                </p>
              </div>
              <span>+{item.xp} XP</span>
            </li>
          ))}
        </ol>
      ) : (
        <p className={styles.panelBody}>
          Первое сохранённое занятие станет первым шагом в твоей истории.
        </p>
      )}
      {runtime.pendingCount > 0 ? (
        <p className={styles.panelBody}>
          Есть результаты на устройстве, которые ждут подтверждения сервера.
        </p>
      ) : null}
    </>
  );
}
