"use client";

import styles from "./assistant-chat.module.css";

export function AssistantChatStatus({
  enabled,
  loading,
  online,
  sending,
  pendingText,
  error,
  demo = false,
  onRetry,
  onRefresh,
}: {
  enabled: boolean | null;
  loading: boolean;
  online: boolean;
  sending: boolean;
  pendingText: string | null;
  error: string | null;
  demo?: boolean;
  onRetry: () => Promise<void>;
  onRefresh: () => Promise<void>;
}) {
  if (demo)
    return (
      <p className={styles.note}>Демонстрация: напарник отвечает подготовленными репликами.</p>
    );
  if (!online)
    return (
      <p className={styles.notice} role="status">
        Ты офлайн. Вопрос останется черновиком. Для ответа напарника нужен интернет.
      </p>
    );
  if (loading)
    return (
      <p className={styles.note} role="status">
        Загружаем разговор…
      </p>
    );
  return (
    <>
      {error ? (
        <p className={styles.notice} role="alert">
          {error}
        </p>
      ) : null}
      {pendingText && !sending ? (
        <div className={styles.notice}>
          <p>У этого сообщения пока нет подтверждённого ответа. Повторим тот же запрос.</p>
          <button
            type="button"
            className={styles.actionButton}
            onClick={() => void onRetry().catch(() => undefined)}
          >
            Повторить запрос
          </button>
        </div>
      ) : null}
      {enabled !== true && !sending ? (
        <div className={styles.notice}>
          <p>
            {enabled === false
              ? "Чат временно недоступен. Можно открыть тренировку или собрать план самостоятельно."
              : "Не удалось подключить чат. Черновик останется здесь."}
          </p>
          <button
            type="button"
            className={styles.actionButton}
            onClick={() => void onRefresh().catch(() => undefined)}
          >
            Повторить загрузку чата
          </button>
        </div>
      ) : null}
      {enabled === true && !error && !pendingText ? (
        <p className={styles.note}>
          ИИ · beta. Напарник видит подтверждённый план и записанные результаты.
        </p>
      ) : null}
    </>
  );
}
