"use client";

import Image from "next/image";
import { useState } from "react";
import { CalendarDays, Dumbbell, Home, Route, UserRound, UsersRound } from "lucide-react";
import "@fontsource/neucha/cyrillic-400.css";
import "@fontsource/neucha/latin-400.css";
import type { CompanionId } from "@/shared/contracts";
import {
  DASHBOARD_INTENTS,
  type DashboardIntent,
  type DashboardPanel,
} from "@/shared/dashboard-preview";
import { AchievementsCard, CalendarCard, JourneyCard } from "./dashboard-preview-cards";
import { DashboardChat } from "./dashboard-preview-chat";
import { DashboardPanels } from "./dashboard-preview-panels";
import type { AccountDashboardRuntime } from "./account-dashboard-runtime";
import styles from "./dashboard-preview.module.css";

const navigation = [
  { id: "home", label: "Главная", icon: Home },
  { id: "workouts", label: "Тренировки", icon: Dumbbell },
  { id: "calendar", label: "Календарь", icon: CalendarDays },
  { id: "path", label: "Твой путь", icon: Route },
  { id: "companions", label: "Напарники", icon: UsersRound },
] as const;

function DashboardWordmark() {
  return (
    <Image
      className={styles.wordmark}
      src="/brand/wordmark.webp"
      alt="MIRON"
      width={500}
      height={69}
      sizes="170px"
      loading="eager"
    />
  );
}

export function DashboardPreview({
  companion,
  interests,
  today,
  onSelectCompanion,
  onReplay,
  accountRuntime,
}: {
  companion: CompanionId;
  interests: string[];
  today: string;
  onSelectCompanion: (id: CompanionId) => void;
  onReplay: () => void;
  accountRuntime?: AccountDashboardRuntime;
}) {
  const [panel, setPanel] = useState<DashboardPanel | null>(null);
  const [selectedDay, setSelectedDay] = useState(today);
  const [drafts, setDrafts] = useState<Record<CompanionId, string>>({ max: "", lika: "" });
  const [intents, setIntents] = useState<Record<CompanionId, DashboardIntent | null>>({
    max: null,
    lika: null,
  });
  function prepare(id: DashboardIntent) {
    setPanel(null);
    setIntents((previous) => ({ ...previous, [companion]: id }));
    setDrafts((previous) => {
      const text = previous[companion];
      const isSuggested = Object.values(DASHBOARD_INTENTS).some((item) => item.text === text);
      return {
        ...previous,
        [companion]: text.trim() && !isSuggested ? text : DASHBOARD_INTENTS[id].text,
      };
    });
    requestAnimationFrame(() => document.getElementById("dashboard-message")?.focus());
  }
  function goHome() {
    setPanel(null);
    window.scrollTo({
      top: 0,
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "instant"
        : "smooth",
    });
  }
  return (
    <div
      className={styles.shell}
      data-theme={accountRuntime?.profile.theme ?? (companion === "max" ? "dark" : "rose")}
      data-persona={companion}
      data-account={accountRuntime ? "true" : undefined}
    >
      <a href="#dashboard-main" className={styles.skipLink}>
        К содержимому
      </a>
      <aside className={styles.sidebar}>
        <button
          type="button"
          className={styles.brandButton}
          aria-label="MIRON, главная"
          onClick={goHome}
        >
          <DashboardWordmark />
        </button>
        <nav className={styles.desktopNavigation} aria-label="Основная навигация">
          {navigation.map(({ id, label, icon: Icon }) => (
            <button
              type="button"
              key={id}
              data-active={id === "home" && panel === null}
              aria-current={id === "home" && panel === null ? "page" : undefined}
              onClick={() => (id === "home" ? goHome() : setPanel(id))}
            >
              <Icon size={23} aria-hidden="true" />
              <span>{label}</span>
            </button>
          ))}
        </nav>
        <div className={styles.sidebarBottom}>
          <button type="button" className={styles.profileLink} onClick={() => setPanel("profile")}>
            <UserRound size={23} aria-hidden="true" />
            Профиль
          </button>
          <p className={styles.sidebarMotto}>
            Больше,
            <br />
            чем тренировки.
            <span aria-hidden="true" />
          </p>
        </div>
      </aside>
      <main id="dashboard-main" className={styles.main} data-persona={companion}>
        <header className={styles.topbar}>
          <button
            type="button"
            className={styles.mobileBrand}
            aria-label="MIRON, главная"
            onClick={goHome}
          >
            <DashboardWordmark />
          </button>
          <div className={styles.greeting}>
            <h1>
              <span>
                {companion === "max" ? "Здорово" : "Привет"}
                {accountRuntime
                  ? accountRuntime.profile.name
                    ? `, ${accountRuntime.profile.name}`
                    : ""
                  : ", Артём"}
                !
              </span>
            </h1>
            <p>Твой темп. Твоя история.</p>
          </div>
          <button
            type="button"
            className={styles.profileButton}
            aria-label="Открыть профиль"
            onClick={() => setPanel("profile")}
          >
            <UserRound size={23} aria-hidden="true" />
          </button>
        </header>
        {accountRuntime ? (
          <div className={styles.accountStatus}>
            {!accountRuntime.isOnline ? (
              <p role="status">Ты офлайн. Сохранённые результаты доступны на устройстве.</p>
            ) : null}
            {accountRuntime.pendingCount > 0 ? (
              <p role="status">
                Ожидают синхронизации: {accountRuntime.pendingCount}. Записи сохранены на
                устройстве.
                {accountRuntime.isOnline ? (
                  <button
                    type="button"
                    onClick={() => void accountRuntime.onSync().catch(() => undefined)}
                  >
                    Повторить синхронизацию
                  </button>
                ) : null}
              </p>
            ) : null}
            {accountRuntime.error ? <p role="status">{accountRuntime.error}</p> : null}
          </div>
        ) : (
          <p className={styles.previewLabel}>
            Дизайн-прототип <span>· пример нового профиля</span>
          </p>
        )}
        <div className={styles.dashboardGrid}>
          <DashboardChat
            companion={companion}
            intent={intents[companion]}
            text={drafts[companion]}
            onTextChange={(text) => setDrafts((previous) => ({ ...previous, [companion]: text }))}
            onPrepare={prepare}
            onVoice={() => setPanel("voice")}
            accountRuntime={accountRuntime}
          />
          <div className={styles.supportingCards}>
            <CalendarCard
              today={today}
              selected={selectedDay}
              onSelect={setSelectedDay}
              onOpen={() => setPanel("calendar")}
              accountRuntime={accountRuntime}
            />
            <JourneyCard onOpen={() => setPanel("path")} progress={accountRuntime?.progress} />
            <AchievementsCard
              onOpen={() => setPanel("achievements")}
              progress={accountRuntime?.progress}
            />
          </div>
        </div>
        <footer className={styles.pageFooter}>Свой темп. Своя история.</footer>
      </main>
      <nav className={styles.mobileNavigation} aria-label="Навигация на телефоне">
        {(
          [
            { id: "home", label: "Главная", icon: Home },
            { id: "workouts", label: "Тренировки", icon: Dumbbell },
            { id: "path", label: "Путь", icon: Route },
            { id: "profile", label: "Профиль", icon: UserRound },
          ] as const
        ).map(({ id, label, icon: Icon }) => (
          <button
            type="button"
            key={id}
            data-active={id === "home" && !panel}
            aria-current={id === "home" && !panel ? "page" : undefined}
            onClick={() => (id === "home" ? goHome() : setPanel(id))}
          >
            <Icon size={23} aria-hidden="true" />
            <span>{label}</span>
          </button>
        ))}
      </nav>
      {panel ? (
        <DashboardPanels
          key={panel}
          panel={panel}
          companion={companion}
          interests={interests}
          today={today}
          onClose={() => setPanel(null)}
          onSelectCompanion={onSelectCompanion}
          onOpenCompanions={() => setPanel("companions")}
          onPrepare={prepare}
          onReplay={onReplay}
          accountRuntime={accountRuntime}
        />
      ) : null}
    </div>
  );
}
