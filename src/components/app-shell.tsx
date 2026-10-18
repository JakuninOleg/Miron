"use client";
import Image from "next/image";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  CalendarDays,
  ChartNoAxesColumnIncreasing,
  Home,
  MessageCircle,
  Settings,
  WifiOff,
  Utensils,
} from "lucide-react";
import { useMiron } from "@/client/use-miron";
import { ProductAccessNotice } from "./product-access-notice";
import { useEffect, useState, type ReactNode } from "react";

const navigation = [
  { href: "/dashboard", label: "Сегодня", icon: Home },
  { href: "/programs", label: "Программа", icon: CalendarDays },
  { href: "/calendar", label: "Календарь", icon: CalendarDays },
  { href: "/nutrition", label: "Питание", icon: Utensils },
  { href: "/progress", label: "Прогресс", icon: ChartNoAxesColumnIncreasing },
  { href: "/chat", label: "Напарник", icon: MessageCircle },
  { href: "/settings", label: "Профиль", icon: Settings },
];

export function Brand() {
  return (
    <span className="brand">
      <Image
        unoptimized
        width={500}
        height={69}
        className="brand-wordmark"
        src="/brand/wordmark.webp"
        alt="MIRON"
        priority
      />
    </span>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { profile, isDemo, isOnline, error, isReady, pendingCount, syncPending } = useMiron();
  const [keyboardNavigation, setKeyboardNavigation] = useState(false);
  useEffect(() => {
    const keyboard = (event: KeyboardEvent) => {
      if (event.key === "Tab") setKeyboardNavigation(true);
    };
    const pointer = () => setKeyboardNavigation(false);
    window.addEventListener("keydown", keyboard);
    window.addEventListener("pointerdown", pointer);
    return () => {
      window.removeEventListener("keydown", keyboard);
      window.removeEventListener("pointerdown", pointer);
    };
  }, []);
  if ((pathname === "/dashboard" || pathname === "/onboarding") && !isDemo) return children;
  if (!isReady) return <div className="loading-state">Готовим MIRON…</div>;
  return (
    <div
      className="app-shell"
      data-theme={profile?.theme ?? "dark"}
      data-keyboard={keyboardNavigation}
    >
      <a className="skip-link" href="#main">
        К содержимому
      </a>
      <aside className="sidebar">
        <Link href="/dashboard" className="brand-link" aria-label="MIRON, сегодня">
          <Brand />
        </Link>
        <nav aria-label="Основная навигация">
          {navigation.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className={`nav-link ${pathname === href ? "active" : ""}`}
              aria-current={pathname === href ? "page" : undefined}
            >
              <Icon size={21} />
              <span>{label}</span>
            </Link>
          ))}
        </nav>
        <div className="sidebar-note">
          Больше, чем тренировки.
          <br />
          <em>Рядом.</em>
          <span className="note-stroke" />
        </div>
        <div className="sidebar-foot">Твой темп. Твой путь.</div>
      </aside>
      <div className="app-body">
        <header className="mobile-header">
          <Link href="/dashboard" aria-label="MIRON">
            <Brand />
          </Link>
          <Link className="avatar-chip" href="/settings" aria-label="Профиль">
            {profile?.name?.slice(0, 1) || "М"}
          </Link>
        </header>
        {isDemo ? (
          <div className="demo-banner">
            Деморежим <span>Можно пройти тренировку и познакомиться с напарником.</span>
            <Link href="/sign-up">Создать аккаунт</Link>
          </div>
        ) : null}
        {!isOnline ? (
          <div className="offline-banner">
            <WifiOff size={16} /> Ты офлайн. Результаты сохраняются на устройстве.
          </div>
        ) : null}
        {pendingCount > 0 ? (
          <div className="offline-banner">
            {isOnline ? "Синхронизируем" : "Ждут подключения"}: {pendingCount}{" "}
            {pendingCount === 1 ? "действие" : "действия"}. Записи сохранены на устройстве.
            {isOnline ? (
              <button
                className="text-link"
                style={{ background: "none", border: 0, fontSize: 12 }}
                onClick={() => void syncPending().catch(() => undefined)}
              >
                Повторить синхронизацию
              </button>
            ) : null}
          </div>
        ) : null}
        {error ? (
          <div className="global-error" role="status">
            {error}
            {pendingCount > 0 ? (
              <Link href="/workout/recovery" className="text-link">
                Разобрать синхронизацию
              </Link>
            ) : null}
          </div>
        ) : null}
        <main id="main" className="main-content">
          {!isDemo ? <ProductAccessNotice /> : null}
          {children}
        </main>
      </div>
      <nav className="bottom-nav" aria-label="Навигация на телефоне">
        {navigation
          .filter(({ href }) => href !== "/calendar" && href !== "/settings")
          .map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className={pathname === href ? "active" : ""}
              aria-current={pathname === href ? "page" : undefined}
            >
              <Icon size={21} />
              <span>{label}</span>
            </Link>
          ))}
      </nav>
    </div>
  );
}

export function PageHeading({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <header className="page-heading">
      <div>
        <h1>{title}</h1>
        {description ? <p>{description}</p> : null}
      </div>
      {action}
    </header>
  );
}
