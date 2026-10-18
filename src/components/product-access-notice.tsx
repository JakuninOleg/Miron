"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useMiron } from "@/client/use-miron";
import type { ProductAccess } from "@/shared/access";
import styles from "./product-access-notice.module.css";

export function ProductAccessNotice() {
  const { ownerId } = useMiron();
  return ownerId ? <AccessNotice key={ownerId} owner={ownerId} /> : null;
}
function AccessNotice({ owner }: { owner: string }) {
  const [access, setAccess] = useState<ProductAccess | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let generation = 0;
    async function refresh() {
      const requestId = ++generation;
      if (timer) clearTimeout(timer);
      try {
        const response = await fetch("/api/account/access", {
          headers: { "x-miron-owner": owner },
          cache: "no-store",
          signal: controller.signal,
        });
        if (!response.ok) throw new Error("access");
        const value = (await response.json()) as ProductAccess;
        if (controller.signal.aborted || requestId !== generation) return;
        setAccess(value);
        setUnavailable(false);
        if (value.mode === "trial")
          timer = setTimeout(
            () => void refresh(),
            Math.max(
              1000,
              Math.min(2147483647, Date.parse(value.endsAt) - Date.parse(value.serverNow) + 100),
            ),
          );
      } catch {
        if (!controller.signal.aborted && requestId === generation) setUnavailable(true);
      }
    }
    void refresh();
    const onFocus = () => void refresh();
    window.addEventListener("focus", onFocus);
    window.addEventListener("online", onFocus);
    return () => {
      controller.abort();
      if (timer) clearTimeout(timer);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("online", onFocus);
    };
  }, [owner]);
  if (unavailable)
    return (
      <p className={styles.notice} role="status">
        Статус доступа сейчас не проверен. <Link href="/settings/account">Данные и доступ</Link>
      </p>
    );
  if (!access) return null;
  if (access.mode === "trial")
    return (
      <p className={styles.trial}>
        Пробный доступ до{" "}
        {new Intl.DateTimeFormat("ru-RU", {
          day: "numeric",
          month: "long",
          hour: "2-digit",
          minute: "2-digit",
          timeZone: "Europe/Moscow",
        }).format(new Date(access.endsAt))}{" "}
        мск. <Link href="/settings/account">Условия доступа</Link>
      </p>
    );
  return (
    <section className={styles.notice} aria-label="Архив аккаунта">
      <strong>Твой путь на паузе</strong>
      <p>
        Пробные 7 дней закончились. История, прогресс и твои данные сохранены. Уже начатое занятие
        можно закончить и синхронизировать.
      </p>
      <p>Оплата в этой бета-версии пока не подключена.</p>
      <div>
        <Link href="/progress">Посмотреть прогресс</Link>
        <Link href="/settings/account">Экспорт и данные аккаунта</Link>
      </div>
    </section>
  );
}
