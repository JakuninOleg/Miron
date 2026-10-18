"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { ProductAccessNotice } from "./product-access-notice";
import {
  CalendarDays,
  ChartNoAxesColumnIncreasing,
  Dumbbell,
  Home,
  Settings,
  UserRound,
  Utensils,
} from "lucide-react";
import type { CompanionId } from "@/shared/contracts";
import {
  DASHBOARD_INTENTS,
  type DashboardIntent,
  type DashboardPanel,
} from "@/shared/dashboard-preview";
import { DashboardChat } from "./dashboard-preview-chat";
import { DashboardPanels } from "./dashboard-preview-panels";
import { DashboardLevel, DashboardScene, DashboardWeek } from "./dashboard-home-summary";
import { DashboardProgressView } from "./dashboard-progress-view";
import type { AccountDashboardRuntime } from "./account-dashboard-runtime";
import legacy from "./dashboard-preview.module.css";
import styles from "./dashboard-home.module.css";

const navigation = [
  { id: "home", label: "Сегодня", icon: Home },
  { id: "workouts", label: "Тренировки", icon: Dumbbell },
  { id: "calendar", label: "Календарь", icon: CalendarDays },
  { id: "path", label: "Прогресс", icon: ChartNoAxesColumnIncreasing },
] as const;
const mobileNavigation = [
  navigation[0],
  navigation[1],
  navigation[3],
  { id: "profile", label: "Профиль", icon: UserRound },
] as const;

function DashboardWordmark() {
  return (
    <Image
      className={styles.wordmark}
      src="/brand/wordmark.webp"
      alt="MIRON"
      width={500}
      height={69}
      sizes="190px"
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
  const router = useRouter();
  const [panel, setPanel] = useState<DashboardPanel | null>(null);
  const [drafts, setDrafts] = useState<Record<CompanionId, string>>({ max: "", lika: "" });
  const [intents, setIntents] = useState<Record<CompanionId, DashboardIntent | null>>({
    max: null,
    lika: null,
  });
  const progressOpen = panel === "path" || panel === "achievements";
  const dateLabel = new Intl.DateTimeFormat("ru-RU", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  }).format(new Date(`${today}T12:00:00Z`));
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
  function navigate(id: "home" | DashboardPanel) {
    if (id === "calendar" && accountRuntime) {
      router.push("/calendar");
      return;
    }
    setPanel(id === "home" ? null : id);
    if (id === "home" || id === "path" || id === "achievements") {
      requestAnimationFrame(() =>
        document.getElementById("dashboard-page-title")?.focus({ preventScroll: true }),
      );
      window.scrollTo({ top: 0, behavior: "instant" });
    }
  }
  function active(id: string) {
    return id === "home" ? panel === null : id === "path" ? progressOpen : panel === id;
  }
  return (
    <div
      className={`${legacy.shell} ${styles.shell}`}
      data-view="companion-home"
      data-theme={accountRuntime?.profile.theme ?? (companion === "max" ? "dark" : "rose")}
      data-persona={companion}
      data-account={accountRuntime ? "true" : undefined}
    >
      <a href="#dashboard-main" className={legacy.skipLink}>
        К содержимому
      </a>
      <aside className={styles.sidebar}>
        <button
          type="button"
          className={styles.brandButton}
          aria-label="MIRON, главная"
          onClick={() => navigate("home")}
        >
          <DashboardWordmark />
        </button>
        <nav className={styles.desktopNavigation} aria-label="Основная навигация">
          {navigation.map(({ id, label, icon: Icon }) => (
            <button
              type="button"
              key={id}
              data-active={active(id)}
              aria-current={active(id) ? "page" : undefined}
              onClick={() => navigate(id)}
            >
              <Icon size={23} aria-hidden="true" />
              <span>{label}</span>
            </button>
          ))}
          {accountRuntime ? (
            <Link href="/nutrition">
              <Utensils size={23} aria-hidden="true" />
              <span>Питание</span>
            </Link>
          ) : null}
        </nav>
        <div className={styles.sidebarBottom}>
          <p>
            Больше,
            <br />
            чем тренировки.
            <br />
            <span>Рядом.</span>
          </p>
          <button type="button" onClick={() => navigate("profile")}>
            <UserRound size={23} aria-hidden="true" />
            Профиль
          </button>
          {accountRuntime ? (
            <Link href="/settings">
              <Settings size={23} aria-hidden="true" />
              Настройки
            </Link>
          ) : null}
        </div>
      </aside>
      <main id="dashboard-main" className={styles.main} data-persona={companion}>
        {accountRuntime ? <ProductAccessNotice /> : null}
        <header className={styles.topbar} data-dashboard-chrome>
          <button
            type="button"
            className={styles.mobileBrand}
            aria-label="MIRON, главная"
            onClick={() => navigate("home")}
          >
            <DashboardWordmark />
          </button>
          <div className={styles.greeting}>
            <h1 id="dashboard-page-title" tabIndex={-1}>
              {progressOpen
                ? "Твой прогресс"
                : `Привет${accountRuntime ? (accountRuntime.profile.name ? `, ${accountRuntime.profile.name}` : "") : ", Артём"}`}
            </h1>
            <p>{progressOpen ? "Твой темп. Твоя история." : dateLabel}</p>
          </div>
          {!progressOpen ? (
            <DashboardLevel progress={accountRuntime?.progress} onOpen={() => navigate("path")} />
          ) : null}
          <button
            type="button"
            className={styles.profileButton}
            aria-label="Открыть профиль"
            onClick={() => navigate("profile")}
          >
            <UserRound size={23} aria-hidden="true" />
          </button>
        </header>
        {accountRuntime ? (
          <div className={legacy.accountStatus} data-dashboard-chrome>
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
          <p className={styles.previewLabel} data-dashboard-chrome>
            Дизайн-прототип · пример нового профиля
          </p>
        )}
        {progressOpen ? (
          <DashboardProgressView
            progress={accountRuntime?.progress}
            onBack={() => navigate("home")}
          />
        ) : (
          <>
            <div className={styles.workbench}>
              <DashboardChat
                companion={companion}
                intent={intents[companion]}
                text={drafts[companion]}
                onTextChange={(text) =>
                  setDrafts((previous) => ({ ...previous, [companion]: text }))
                }
                onPrepare={prepare}
                onWorkouts={() => navigate("workouts")}
                accountRuntime={accountRuntime}
              />
              <DashboardScene companion={companion} />
            </div>
            <DashboardWeek
              today={today}
              progress={accountRuntime?.progress}
              timezone={accountRuntime?.profile.timezone}
              onOpen={() => navigate("calendar")}
            />
          </>
        )}
        <footer className={styles.pageFooter} data-dashboard-chrome>
          Свой темп. Своя история.
        </footer>
      </main>
      <nav
        className={styles.mobileNavigation}
        aria-label="Навигация на телефоне"
        data-dashboard-chrome
      >
        {mobileNavigation.map(({ id, label, icon: Icon }) => (
          <button
            type="button"
            key={id}
            data-active={active(id)}
            aria-current={active(id) ? "page" : undefined}
            onClick={() => navigate(id)}
          >
            <Icon size={23} aria-hidden="true" />
            <span>{label}</span>
          </button>
        ))}
        {accountRuntime ? (
          <Link href="/nutrition">
            <Utensils size={23} aria-hidden="true" />
            <span>Питание</span>
          </Link>
        ) : null}
      </nav>
      {panel && !progressOpen ? (
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
