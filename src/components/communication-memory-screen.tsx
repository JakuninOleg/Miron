"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useMiron } from "@/client/use-miron";
import { builderRequest } from "@/client/workout-builder-api";
import type { CommunicationMemory, CommunicationPreferences } from "@/shared/communication-memory";
import { PageHeading } from "./app-shell";
import styles from "./calendar-screen.module.css";
const options = {
  address: {
    label: "Как обращаться",
    values: [
      ["informal", "На ты"],
      ["formal", "На вы"],
    ],
  },
  tone: {
    label: "Тон общения",
    values: [
      ["friendly", "Дружеский"],
      ["calm", "Спокойный"],
      ["energetic", "Энергичный"],
    ],
  },
  detail: {
    label: "Длина ответа",
    values: [
      ["short", "Коротко"],
      ["detailed", "С пояснениями"],
    ],
  },
  emoji: {
    label: "Эмодзи",
    values: [
      ["none", "Без эмодзи"],
      ["some", "Иногда можно"],
    ],
  },
} as const;
export function CommunicationMemoryScreen() {
  const { ownerId, isReady, isOnline } = useMiron();
  const [loaded, setLoaded] = useState<{ owner: string; values: CommunicationMemory[] } | null>(
    null,
  );
  const [error, setError] = useState("");
  useEffect(() => {
    if (!ownerId) return;
    const controller = new AbortController();
    void builderRequest<{ memories: CommunicationMemory[] }>(
      "/memory",
      { signal: controller.signal },
      ownerId,
    )
      .then((value) => {
        if (!controller.signal.aborted) setLoaded({ owner: ownerId, values: value.memories });
      })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted)
          setError(cause instanceof Error ? cause.message : "Не удалось загрузить настройки.");
      });
    return () => controller.abort();
  }, [ownerId]);
  const memories = loaded?.owner === ownerId ? loaded.values : null;
  if (!isReady) return <p role="status">Загружаем настройки…</p>;
  return (
    <section className={styles.page}>
      <PageHeading
        title="Как с тобой общаться"
        description="Сохраняем только выбранные тобой настройки. Догадки о характере и скрытый психологический профиль не создаём."
      />
      <Link href="/settings" className="text-link">
        К профилю
      </Link>
      <p className={styles.lead}>
        Общие настройки доступны обоим напарникам. Отдельные настройки Макса или Лики применяются
        поверх общих. История переписки удаляется отдельно.
      </p>
      {error ? <p role="alert">{error}</p> : null}
      {!isOnline ? <p role="status">Для изменения памяти подключись к интернету.</p> : null}
      {memories && ownerId ? (
        memories.map((memory) => (
          <MemoryForm
            key={`${ownerId}:${memory.scope}:${memory.revision}`}
            memory={memory}
            ownerId={ownerId}
            disabled={!isOnline}
            onSaved={(value) =>
              setLoaded((current) =>
                current?.owner === ownerId
                  ? {
                      owner: ownerId,
                      values: current.values.map((item) =>
                        item.scope === value.scope ? value : item,
                      ),
                    }
                  : current,
              )
            }
          />
        ))
      ) : (
        <p role="status">Загружаем память…</p>
      )}
    </section>
  );
}
function MemoryForm({
  memory,
  ownerId,
  disabled,
  onSaved,
}: {
  memory: CommunicationMemory;
  ownerId: string;
  disabled: boolean;
  onSaved: (value: CommunicationMemory) => void;
}) {
  const [preferences, setPreferences] = useState(memory.preferences);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const attempt = useRef<{ signature: string; operationId: string } | null>(null);
  async function save(value: CommunicationPreferences) {
    setBusy(true);
    setError("");
    const signature = JSON.stringify({
      ownerId,
      scope: memory.scope,
      revision: memory.revision,
      value,
    });
    if (attempt.current?.signature !== signature)
      attempt.current = { signature, operationId: crypto.randomUUID() };
    try {
      const ack = await builderRequest<Pick<CommunicationMemory, "scope" | "revision">>(
        "/memory",
        {
          method: "POST",
          body: JSON.stringify({
            operationId: attempt.current.operationId,
            scope: memory.scope,
            expectedRevision: memory.revision,
            preferences: value,
          }),
        },
        ownerId,
      );
      if (ack.scope !== memory.scope || ack.revision !== memory.revision + 1)
        throw new Error("Сервер не подтвердил эти настройки. Обнови страницу.");
      onSaved({ scope: memory.scope, revision: memory.revision + 1, preferences: value });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Не удалось сохранить настройки.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <form
      className={`card ${styles.form}`}
      onSubmit={(event) => {
        event.preventDefault();
        void save(preferences);
      }}
    >
      <h2>
        {memory.scope === "shared"
          ? "Для обоих напарников"
          : memory.scope === "max"
            ? "Только Макс"
            : "Только Лика"}
      </h2>
      {Object.entries(options).map(([field, item]) => (
        <label key={field}>
          {item.label}
          <select
            aria-label={`${item.label} · ${memory.scope}`}
            value={preferences[field as keyof CommunicationPreferences] ?? ""}
            disabled={disabled || busy}
            onChange={(event) => {
              const next = { ...preferences };
              if (event.target.value) Object.assign(next, { [field]: event.target.value });
              else delete next[field as keyof CommunicationPreferences];
              setPreferences(next);
            }}
          >
            <option value="">По умолчанию</option>
            {item.values.map(([value, name]) => (
              <option key={value} value={value}>
                {name}
              </option>
            ))}
          </select>
        </label>
      ))}
      {error ? (
        <p role="alert">
          {error}{" "}
          <button type="button" className="text-link" onClick={() => window.location.reload()}>
            Обновить настройки
          </button>
        </p>
      ) : null}
      <div className={styles.actions}>
        <button className="button" disabled={disabled || busy}>
          Сохранить настройки
        </button>
        <button
          type="button"
          className="button secondary"
          disabled={disabled || busy}
          onClick={() => void save({})}
        >
          Забыть эти настройки
        </button>
      </div>
    </form>
  );
}
