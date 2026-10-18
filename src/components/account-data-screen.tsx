"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useMiron } from "@/client/use-miron";
import type { ProductAccess } from "@/shared/access";
import { PageHeading } from "./app-shell";
import styles from "./calendar-screen.module.css";
export function AccountDataScreen() {
  const { ownerId, isReady } = useMiron();
  if (!isReady) return <p role="status">Загружаем аккаунт…</p>;
  if (!ownerId) return <Link href="/sign-in">Войти в аккаунт</Link>;
  return <AccountDataContent key={ownerId} ownerId={ownerId} />;
}
function AccountDataContent({ ownerId }: { ownerId: string }) {
  const { isOnline, pendingCount, exportAccount, deleteAccount, logout } = useMiron();
  const [access, setAccess] = useState<ProductAccess | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const [password, setPassword] = useState("");
  const [understood, setUnderstood] = useState(false);
  const operating = useRef(false);
  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/account/access", {
      signal: controller.signal,
      cache: "no-store",
      headers: { "x-miron-owner": ownerId },
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("Не удалось проверить доступ.");
        const value = (await response.json()) as ProductAccess;
        if (!controller.signal.aborted) setAccess(value);
      })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted)
          setError(cause instanceof Error ? cause.message : "Не удалось прочитать аккаунт.");
      });
    return () => controller.abort();
  }, [ownerId]);
  async function act(action: () => Promise<void>, message: string) {
    if (operating.current) return;
    operating.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await action();
      setNotice(message);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Не удалось выполнить действие.");
    } finally {
      operating.current = false;
      setBusy(false);
    }
  }
  const date = access
    ? new Intl.DateTimeFormat("ru-RU", {
        timeZone: "Europe/Moscow",
        day: "numeric",
        month: "long",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      }).format(new Date(access.endsAt))
    : "";
  return (
    <section className={styles.page}>
      <PageHeading
        title="Данные и доступ"
        description="История и настройки принадлежат тебе. Экспорт и удаление доступны и после пробного периода."
      />
      <Link className="text-link" href="/settings">
        К профилю
      </Link>
      {error ? <p role="alert">{error}</p> : null}
      {notice ? <p role="status">{notice}</p> : null}
      <section className={styles.entry}>
        <h2>{access?.mode === "archive" ? "Твой архив" : "Пробный доступ"}</h2>
        {access ? (
          <>
            <p>Пробный период: до {date}, время Москвы. Он начался при регистрации.</p>
            <p>
              {access.mode === "trial"
                ? `Доступных AI-ответов: ${access.remainingReplies}.`
                : "История, чаты, прогресс и данные аккаунта доступны для чтения. Новые занятия и AI требуют действующего доступа."}
            </p>
            <p>
              Платежи ещё не подключены. Списаний и автоматических продлений нет. Оформление, отмена
              продления и возврат появятся после подключения оплаты.
            </p>
          </>
        ) : (
          <p role="status">Проверяем доступ на сервере…</p>
        )}
      </section>
      <section className={styles.entry}>
        <h2>Экспорт данных</h2>
        <p>
          Тренировки и подходы за всю сохранённую историю, свои программы, чаты, питание, календарь
          и настройки. В файл добавится неподтверждённый журнал этого браузера. Ключи сессий, пароли
          и токены провайдеров не выгружаются.
        </p>
        <button
          type="button"
          className="button secondary"
          disabled={busy || !isOnline}
          onClick={() => void act(exportAccount, "Архив аккаунта подготовлен для скачивания.")}
        >
          Скачать архив аккаунта
        </button>
        <Link className="text-link" href="/workout/recovery">
          Локальные копии журнала
        </Link>
      </section>
      <section className={styles.entry}>
        <h2>Удаление аккаунта</h2>
        <p>
          Удалятся серверные тренировки, подходы, чаты, питание, календарь и прогресс. Историю
          восстановить не получится. Локальные копии этого аккаунта удалятся перед запросом на
          сервер, даже если запрос прервётся. Другие офлайн-устройства нельзя очистить удалённо.
        </p>
        {pendingCount ? (
          <p role="status">
            Есть неподтверждённые действия. Сначала синхронизируй их или сохрани копию и выбери
            серверную версию.
          </p>
        ) : null}
        <details>
          <summary>Перейти к удалению</summary>
          <form
            className={styles.form}
            onSubmit={(event) => {
              event.preventDefault();
              if (understood && confirmation === "УДАЛИТЬ")
                void act(() => deleteAccount(confirmation, password), "Аккаунт удалён.");
            }}
          >
            <label>
              Для подтверждения напиши УДАЛИТЬ
              <input
                required
                autoComplete="off"
                value={confirmation}
                disabled={busy}
                onChange={(event) => setConfirmation(event.target.value)}
              />
            </label>
            <label>
              Текущий пароль, если используешь вход по почте
              <input
                type="password"
                autoComplete="current-password"
                maxLength={128}
                value={password}
                disabled={busy}
                onChange={(event) => setPassword(event.target.value)}
              />
            </label>
            <label>
              <input
                type="checkbox"
                checked={understood}
                disabled={busy}
                onChange={(event) => setUnderstood(event.target.checked)}
              />
              Понимаю, что история и прогресс удалятся
            </label>
            <button
              className="button"
              disabled={
                busy || !isOnline || pendingCount > 0 || confirmation !== "УДАЛИТЬ" || !understood
              }
            >
              Удалить аккаунт и мои данные
            </button>
          </form>
        </details>
        <p>
          Для Яндекс/VK нужен свежий вход за последние 10 минут. Если он истёк, выйди и войди
          заново.
        </p>
        <button
          className="button secondary"
          type="button"
          disabled={busy || !isOnline}
          onClick={() => void act(logout, "Выход выполнен.")}
        >
          Выйти для повторного входа
        </button>
      </section>
    </section>
  );
}
