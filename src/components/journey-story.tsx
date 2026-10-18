"use client";

import Image from "next/image";
import { ArrowLeft, ArrowRight, BookOpen, Check, Map, Route } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useMiron } from "@/client/use-miron";
import { builderRequest } from "@/client/workout-builder-api";
import { JOURNEY_CHAPTERS, journeyState, type JourneyChapter } from "@/shared/journey-story";
import styles from "./journey-story.module.css";

export function JourneyStory({ activityDays }: { activityDays?: number }) {
  const { ownerId, isOnline } = useMiron();
  const [seen, setSeen] = useState<{ owner: string; ids: string[] } | null>(null);
  const [readError, setReadError] = useState("");
  const [saving, setSaving] = useState(false);
  const owner = useRef(ownerId);
  useLayoutEffect(() => {
    owner.current = ownerId;
  }, [ownerId]);
  useEffect(() => {
    if (!ownerId || !isOnline) return;
    const controller = new AbortController();
    void builderRequest<{ readIds: string[] }>("/story", { signal: controller.signal }, ownerId)
      .then((value) => {
        if (!controller.signal.aborted && owner.current === ownerId)
          setSeen({ owner: ownerId, ids: value.readIds });
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, [ownerId, isOnline]);
  async function markRead(chapterId: string) {
    if (!ownerId || !isOnline) return;
    const principal = ownerId;
    setSaving(true);
    setReadError("");
    try {
      const value = await builderRequest<{ readIds: string[] }>(
        "/story",
        { method: "POST", body: JSON.stringify({ chapterId }) },
        principal,
      );
      if (owner.current === principal) setSeen({ owner: principal, ids: value.readIds });
    } catch (cause) {
      if (owner.current === principal)
        setReadError(cause instanceof Error ? cause.message : "Не удалось сохранить отметку.");
    } finally {
      setSaving(false);
    }
  }
  const readIds = seen?.owner === ownerId ? seen.ids : null;
  const state = journeyState(activityDays);
  const [opened, setOpened] = useState<JourneyChapter["id"] | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  // A changed owner/older snapshot cannot keep a previously opened chapter available.
  const scene = state.available.find((chapter) => chapter.id === opened);

  function read(id: JourneyChapter["id"] | null) {
    setOpened(id);
    requestAnimationFrame(() => {
      heading.current?.focus({ preventScroll: true });
      heading.current?.scrollIntoView({ block: "start", behavior: "instant" });
    });
  }

  if (scene) {
    const index = JOURNEY_CHAPTERS.findIndex((chapter) => chapter.id === scene.id);
    const next = state.available[index + 1];
    return (
      <section className={styles.story} aria-label="Чтение истории MIRON">
        <button type="button" className={styles.back} onClick={() => read(null)}>
          <ArrowLeft size={18} aria-hidden="true" /> К главам
        </button>
        <p className={styles.eyebrow}>Глава {String(index).padStart(2, "0")}</p>
        <h2 className={styles.readerTitle} ref={heading} tabIndex={-1}>
          {scene.title}
        </h2>
        <div className={styles.readerArt}>
          <Image
            unoptimized
            src={scene.image}
            alt={scene.alt}
            width={1586}
            height={992}
            sizes="(max-width: 850px) 100vw, 1120px"
          />
        </div>
        <div className={styles.reading}>
          <p className={styles.setting}>{scene.setting}</p>
          <ol className={styles.dialogue} aria-label="Диалог персонажей">
            {scene.lines.map((line, position) => (
              <li key={position} data-speaker={line.speaker}>
                <span className={styles.initial} aria-hidden="true">
                  {line.speaker === "max" ? "М" : "Л"}
                </span>
                <div>
                  <strong>{line.speaker === "max" ? "Макс" : "Лика"}</strong>
                  <p>{line.text}</p>
                </div>
              </li>
            ))}
          </ol>
          <p className={styles.ending}>{scene.ending}</p>
          {ownerId ? (
            <div className={styles.notice}>
              {readIds?.includes(scene.id) ? (
                <p role="status">Глава прочитана</p>
              ) : (
                <button
                  type="button"
                  className={styles.back}
                  disabled={!isOnline || saving}
                  onClick={() => void markRead(scene.id)}
                >
                  {saving ? "Сохраняем…" : "Отметить прочитанной"}
                </button>
              )}
              {!isOnline ? (
                <p>
                  Можно читать офлайн. Чтобы отметить главу прочитанной, подключись к интернету.
                </p>
              ) : null}
              {readError ? <p role="alert">{readError}</p> : null}
            </div>
          ) : null}
          <div className={styles.readerActions}>
            <button type="button" className={styles.primary} onClick={() => read(next?.id ?? null)}>
              {next ? "Следующая глава" : "К списку глав"}
              <ArrowRight size={20} aria-hidden="true" />
            </button>
            <span>Иллюстрированная история MIRON</span>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className={styles.story} aria-label="История и главы MIRON">
      <div className={styles.hero}>
        <div className={styles.cover}>
          <Image
            unoptimized
            src={state.current.image}
            alt={state.current.alt}
            width={1586}
            height={992}
            sizes="(max-width: 850px) 100vw, 800px"
          />
        </div>
        <div className={styles.heroCopy}>
          <p className={styles.eyebrow}>
            <Map size={16} aria-hidden="true" /> Маленькие приключения в большом городе
          </p>
          <h2 ref={heading} tabIndex={-1}>
            Твоя <span>история</span>
          </h2>
          <p className={styles.subtitle}>{state.current.teaser}</p>
          <p className={styles.available}>
            Открыто {state.available.length} из {JOURNEY_CHAPTERS.length} глав
          </p>
          {readIds && state.available.some((chapter) => !readIds.includes(chapter.id)) ? (
            <p className={styles.available}>Есть непрочитанная глава</p>
          ) : null}
          <button className={styles.primary} type="button" onClick={() => read(state.current.id)}>
            <BookOpen size={20} aria-hidden="true" /> Читать главу{" "}
            <ArrowRight size={20} aria-hidden="true" />
          </button>
        </div>
      </div>
      {state.days === null ? (
        <p className={styles.notice} role="status">
          Пролог доступен сразу. Для остальных глав обнови прогресс при подключении к сети.
        </p>
      ) : null}
      <ol className={styles.chapters} aria-label="Главы истории">
        {JOURNEY_CHAPTERS.map((chapter, index) => {
          const available = state.available.some((item) => item.id === chapter.id);
          const current = chapter.id === state.current.id;
          return (
            <li key={chapter.id} data-available={available} data-current={current}>
              <button
                type="button"
                disabled={!available}
                onClick={() => read(chapter.id)}
                aria-label={`${String(index).padStart(2, "0")}. ${chapter.title}. ${available ? "Читать главу" : `Откроется за ${chapter.days} разных дней с результатом`}`}
              >
                <div className={styles.thumbnail}>
                  <Image
                    unoptimized
                    src={chapter.image}
                    alt=""
                    width={400}
                    height={250}
                    sizes="(max-width: 850px) 100px, 260px"
                  />
                </div>
                <div className={styles.chapterCopy}>
                  <h3>
                    <span>{String(index).padStart(2, "0")}.</span> {chapter.title}
                  </h3>
                  <p>
                    {available ? (
                      <>
                        <Check size={16} aria-hidden="true" /> Доступна
                      </>
                    ) : state.days === null ? (
                      `После ${chapter.days} разных дней с результатом`
                    ) : (
                      `Дни с результатом: ${state.days} / ${chapter.days}`
                    )}
                  </p>
                </div>
                {available ? (
                  <ArrowRight className={styles.chapterArrow} size={20} aria-hidden="true" />
                ) : null}
              </button>
            </li>
          );
        })}
      </ol>
      <div className={styles.footnote}>
        <Route size={25} aria-hidden="true" />
        <div>
          <strong>
            {state.days === null || state.next
              ? "Перерывы ничего не обнуляют"
              : "Первое приключение целиком в твоей коллекции"}
          </strong>
          <p>
            Один день с подтверждённым результатом — один шаг. Частичное занятие тоже считается.
            Чтение глав не меняет XP и достижения.
          </p>
        </div>
      </div>
    </section>
  );
}
