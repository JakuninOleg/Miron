"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Play } from "lucide-react";
import { useMiron } from "@/client/use-miron";
import { builderRequest, BuilderRequestError } from "@/client/workout-builder-api";
import type { Workout } from "@/shared/contracts";
import type {
  SavedWorkoutPreview,
  SavedWorkoutSource,
  SavedWorkoutStart,
} from "@/shared/workout-sources";
import { builderDurationLabel } from "@/shared/workout-builder";
import { directions, places } from "./choices";
import styles from "./workout-builder.module.css";
import { SaveHistoryTemplate } from "./save-history-template";

export function SavedWorkoutStartScreen({
  source,
  initialSave = false,
}: {
  source: SavedWorkoutSource;
  initialSave?: boolean;
}) {
  const { ownerId, isReady, profile, isOnline, pendingCount } = useMiron();
  const sourceKey = `${source.source}:${source.id}`;
  const [reload, setReload] = useState(0);
  const [loaded, setLoaded] = useState<{
    owner: string;
    key: string;
    value: SavedWorkoutPreview;
  } | null>(null);
  const [problem, setProblem] = useState<{
    owner: string;
    key: string;
    message: string;
    active: boolean;
  } | null>(null);
  const [starting, setStarting] = useState(false);
  const currentOwner = useRef(ownerId);
  const currentSource = useRef(sourceKey);
  useLayoutEffect(() => {
    currentOwner.current = ownerId;
    currentSource.current = sourceKey;
  }, [ownerId, sourceKey]);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const attempt = useRef<{ key: string; input: SavedWorkoutStart } | null>(null);
  const preview = loaded?.owner === ownerId && loaded.key === sourceKey ? loaded.value : null;
  const error = problem?.owner === ownerId && problem.key === sourceKey ? problem : null;

  useEffect(() => {
    if (!ownerId) return;
    const controller = new AbortController();
    void builderRequest<SavedWorkoutPreview>(
      `/saved-start?source=${source.source}&id=${encodeURIComponent(source.id)}`,
      { signal: controller.signal },
      ownerId,
    )
      .then((value) => {
        if (
          !controller.signal.aborted &&
          currentOwner.current === ownerId &&
          currentSource.current === sourceKey
        ) {
          setLoaded({ owner: ownerId, key: sourceKey, value });
          setProblem(null);
        }
      })
      .catch((cause: unknown) => {
        if (
          !controller.signal.aborted &&
          currentOwner.current === ownerId &&
          currentSource.current === sourceKey
        )
          setProblem({
            owner: ownerId,
            key: sourceKey,
            message: cause instanceof Error ? cause.message : "Не удалось открыть тренировку.",
            active: false,
          });
      });
    return () => controller.abort();
  }, [ownerId, source.source, source.id, sourceKey, reload]);

  async function start() {
    if (!preview || !ownerId || starting || !isOnline || pendingCount) return;
    const owner = ownerId;
    const key = `${owner}:${source.source}:${source.id}:${preview.revision}`;
    if (attempt.current?.key !== key)
      attempt.current = {
        key,
        input: {
          ...source,
          operationId: crypto.randomUUID(),
          expectedSourceRevision: preview.revision,
        },
      };
    setStarting(true);
    setProblem(null);
    try {
      await builderRequest<Workout>(
        "/saved-start",
        { method: "POST", body: JSON.stringify(attempt.current.input) },
        owner,
      );
      if (mounted.current && currentOwner.current === owner && currentSource.current === sourceKey)
        window.location.assign("/workout");
    } catch (cause) {
      if (mounted.current && currentOwner.current === owner && currentSource.current === sourceKey)
        setProblem({
          owner,
          key: sourceKey,
          message: cause instanceof Error ? cause.message : "Не удалось начать занятие.",
          active: cause instanceof BuilderRequestError && cause.code === "WORKOUT_ACTIVE",
        });
    } finally {
      if (mounted.current) setStarting(false);
    }
  }

  return (
    <div className={styles.shell} data-theme={profile.theme}>
      <header className={styles.header}>
        <Link href="/dashboard" aria-label="MIRON, главная">
          <Image
            className={styles.wordmark}
            src="/brand/wordmark.webp"
            alt="MIRON"
            width={180}
            height={25}
          />
        </Link>
        <Link className={styles.secondary} href="/workout-builder">
          <ArrowLeft size={18} aria-hidden="true" /> К тренировкам
        </Link>
      </header>
      <main className={`${styles.main} ${styles.scene}`}>
        {!isReady ? (
          <p role="status">Загружаем твой аккаунт…</p>
        ) : !ownerId ? (
          <>
            <h1>Войди, чтобы открыть тренировку</h1>
            <Link className={styles.primary} href="/sign-in">
              Войти в MIRON
            </Link>
          </>
        ) : (
          <>
            <p className={styles.eyebrow}>
              {source.source === "history"
                ? "Повтор без старых рабочих весов"
                : "Твоя сохранённая тренировка"}
            </p>
            <h1>{preview?.day.title ?? "Готовим состав…"}</h1>
            {error ? (
              <div>
                <p role="alert">{error.message}</p>
                <button
                  type="button"
                  className={styles.secondary}
                  disabled={starting}
                  onClick={() => {
                    setLoaded(null);
                    setProblem(null);
                    setReload((value) => value + 1);
                  }}
                >
                  Обновить состав
                </button>
                <Link className={styles.secondary} href="/workout-builder">
                  Открыть конструктор
                </Link>
              </div>
            ) : null}
            {error?.active ? (
              <Link className={styles.primary} href="/workout">
                Продолжить текущее занятие
              </Link>
            ) : null}
            {preview ? (
              <>
                <p className={styles.lead}>
                  {places.find((item) => item.id === preview.place)?.name} ·{" "}
                  {directions.find((item) => item.id === preview.direction)?.name} ·{" "}
                  {builderDurationLabel(preview.day.estimate)}
                </p>
                <p className={styles.muted}>
                  Проверь состав. Перед стартом сверим доступность упражнений и инвентаря. Карточки
                  могут быть черновиками.
                </p>
                <p className={styles.muted}>
                  {preview.rewardKind === "main"
                    ? "Основное занятие: до 50 XP за полный результат."
                    : "Поддерживающее занятие: до 20 XP за полный результат."}{" "}
                  Дневной предел общий для всех занятий.
                </p>
                <ol className={styles.savedSteps}>
                  {preview.day.steps.map((step, index) => (
                    <li key={step.slotKey}>
                      <span>{String(index + 1).padStart(2, "0")}</span>
                      <div>
                        <h2>{step.exercise.name}</h2>
                        <p>
                          {step.sets} × {step.target}{" "}
                          {step.exercise.metric === "time" ? "сек" : "повторов"}
                          {step.pairKey ? " · в паре" : ""}
                        </p>
                        <details>
                          <summary>Как выполнять</summary>
                          {step.exercise.instructions.map((line) => (
                            <p key={line}>{line}</p>
                          ))}
                        </details>
                      </div>
                    </li>
                  ))}
                </ol>
                {preview.day.warnings.map((warning) => (
                  <p className={styles.muted} key={warning}>
                    {warning}
                  </p>
                ))}
                {source.source === "history" && ownerId ? (
                  <SaveHistoryTemplate
                    key={`${ownerId}:${preview.id}:${preview.revision}`}
                    preview={preview}
                    ownerId={ownerId}
                    initialOpen={initialSave}
                  />
                ) : null}
                {!isOnline ? (
                  <p role="status">
                    Для начала новой тренировки подключись к интернету. Уже начатое занятие можно
                    продолжать офлайн.
                  </p>
                ) : null}
                <button
                  type="button"
                  className={styles.primary}
                  disabled={starting || !isOnline || pendingCount > 0}
                  onClick={() => void start()}
                >
                  <Play size={19} aria-hidden="true" />
                  {starting ? "Сверяем и начинаем…" : "Начать тренировку"}
                  <ArrowRight size={20} aria-hidden="true" />
                </button>
                {pendingCount > 0 ? (
                  <p role="status">
                    Сначала подтверди результаты предыдущего занятия.{" "}
                    <Link href="/workout/recovery">Открыть журнал синхронизации</Link>
                  </p>
                ) : null}
              </>
            ) : !error ? (
              <p role="status">Загружаем сохранённый состав…</p>
            ) : null}
          </>
        )}
      </main>
    </div>
  );
}
