"use client";

import "@fontsource/roboto-condensed/cyrillic-900.css";
import "@fontsource/roboto-condensed/latin-900.css";
import "@fontsource/neucha/cyrillic-400.css";
import Image from "next/image";
import { ArrowLeft, ArrowRight, Check, Compass } from "lucide-react";
import type { Ref } from "react";
import { STORY_INTERESTS, STORY_PANELS } from "@/shared/story-content";
import { StoryHeader } from "./story-header";
import styles from "./story-interests-screen.module.css";

const descriptions = {
  strength: { title: "Силовые тренировки", detail: "Железо, прогресс, сила" },
  home: { title: "Тренировки дома", detail: "Удобно, в своём пространстве" },
  calisthenics: { title: "Турник и свой вес", detail: "Свобода движения" },
  yoga: { title: "Йога", detail: "Баланс тела и головы" },
  mobility: { title: "Растяжка и мобильность", detail: "Подвижность и лёгкость" },
  fitness: { title: "Общая форма", detail: "Выносливость, энергия, тонус" },
} satisfies Record<(typeof STORY_INTERESTS)[number]["id"], { title: string; detail: string }>;

type Props = {
  interests: readonly string[];
  onToggleInterest: (id: string) => void;
  onNext: () => void;
  onBack: () => void;
  titleRef?: Ref<HTMLHeadingElement>;
  busy?: boolean;
  direction?: string;
  total?: number;
};

function SpeechBubble({ coach }: { coach: "max" | "lika" }) {
  return (
    <div className={styles.bubble} data-coach={coach}>
      <svg viewBox="0 0 280 160" preserveAspectRatio="none" aria-hidden="true">
        <path
          d={
            coach === "max"
              ? "M28 3H252Q277 3 277 28V105Q277 130 252 130H187L215 156L148 130H28Q3 130 3 105V28Q3 3 28 3Z"
              : "M28 3H252Q277 3 277 28V105Q277 130 252 130H105L57 156L65 130H28Q3 130 3 105V28Q3 3 28 3Z"
          }
          fill="#f5f2eb"
          stroke="#101719"
          strokeWidth="3"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      <span className={styles.speaker}>{coach === "max" ? "МАКС" : "ЛИКА"}</span>
      <p>
        {coach === "max" ? (
          <>
            Теперь про тебя.
            <br />
            Что тебе нравится?
          </>
        ) : (
          <>
            Можно несколько.
            <br />
            Или разберёмся вместе. ♡
          </>
        )}
      </p>
    </div>
  );
}

export function StoryInterestsScreen({
  interests,
  onToggleInterest,
  onNext,
  onBack,
  titleRef,
  busy = false,
  direction = "forward",
  total = STORY_PANELS.length,
}: Props) {
  function toggle(id: string) {
    if (id === "explore") {
      if (!interests.includes("explore")) {
        interests.filter((interest) => interest !== "explore").forEach(onToggleInterest);
      }
    } else if (interests.includes("explore")) {
      onToggleInterest("explore");
    }
    onToggleInterest(id);
  }

  return (
    <main className={styles.screen} data-direction={direction}>
      <StoryHeader step={4} total={total} caption="Что тебе ближе?" />
      <section className={styles.scene} aria-label="История знакомства" aria-busy={busy}>
        <div className={styles.artStage}>
          <Image
            src="/story-interests/duo-v1.webp"
            alt="Макс стоит со скрещёнными руками. Лика рядом, с рукой на бедре. Оба дружелюбно улыбаются."
            fill
            sizes="(max-width: 1100px) 1px, 60vw"
            className={styles.duo}
          />
          <div className={styles.shade} aria-hidden="true" />
        </div>
        <SpeechBubble coach="max" />
        <SpeechBubble coach="lika" />
        <div className={styles.intro}>
          <p className={styles.eyebrow}>ТЕПЕРЬ ПРО ТЕБЯ</p>
          <h1 ref={titleRef} tabIndex={-1} className={styles.title}>
            ЧТО ТЕБЕ
            <br />
            <span>БЛИЖЕ?</span>
          </h1>
          <p className={styles.description} id="interests-hint">
            Выбери, чем тебе интересно заниматься. Можно несколько. Всё можно изменить позже.
          </p>
          <p className={styles.handNote} aria-hidden="true">
            Твой темп.
            <br />
            Твой выбор.
            <span>♡</span>
          </p>
        </div>
        <div className={styles.selection}>
          <div
            className={styles.choices}
            role="group"
            aria-label="Что тебе интересно"
            aria-describedby="interests-hint"
          >
            {STORY_INTERESTS.map(({ id, label }) => {
              const { title, detail } = descriptions[id];
              return (
                <button
                  key={id}
                  type="button"
                  className={styles.card}
                  aria-label={label}
                  aria-pressed={interests.includes(id)}
                  disabled={busy}
                  onClick={() => toggle(id)}
                >
                  <span className={styles.cardArt}>
                    <Image
                      src={`/story-interests/${id}-${id === "calisthenics" ? "v2" : "v1"}.webp`}
                      alt=""
                      fill
                      sizes="(max-width: 599px) 70vw, (max-width: 1100px) 50vw, 25vw"
                      loading="eager"
                    />
                  </span>
                  <span className={styles.cardCopy}>
                    <span className={styles.cardTitle}>
                      {id === "mobility" ? (
                        <>
                          <span className={styles.fullTitle}>{title}</span>
                          <span className={styles.compactTitle}>Растяжка</span>
                        </>
                      ) : (
                        title
                      )}
                    </span>
                    <span className={styles.cardDetail}>{detail}</span>
                  </span>
                  <span className={styles.check} aria-hidden="true">
                    <Check />
                  </span>
                  <svg className={styles.selectionStroke} viewBox="0 0 200 20" aria-hidden="true">
                    <path d="M4 13Q76 2 194 8M10 18Q81 8 174 12" />
                  </svg>
                </button>
              );
            })}
            <button
              type="button"
              className={`${styles.card} ${styles.explore}`}
              aria-pressed={interests.includes("explore")}
              aria-label="Пока не знаю"
              disabled={busy}
              onClick={() => toggle("explore")}
            >
              <Compass className={styles.compass} aria-hidden="true" />
              <span className={styles.cardCopy}>
                <span className={styles.cardTitle}>Пока не знаю</span>
                <span className={styles.cardDetail}>Найдём твоё вместе</span>
              </span>
              <span className={styles.check} aria-hidden="true">
                <Check />
              </span>
            </button>
          </div>
          <nav className={styles.actions} aria-label="Навигация по знакомству">
            <button
              type="button"
              className={styles.back}
              aria-label="Предыдущая сцена"
              disabled={busy}
              onClick={onBack}
            >
              <ArrowLeft aria-hidden="true" />
              Назад
            </button>
            <button type="button" className={styles.next} disabled={busy} onClick={onNext}>
              Дальше
              <ArrowRight aria-hidden="true" />
            </button>
          </nav>
          <p className={styles.tagline}>СВОЙ ТЕМП. СВОЯ ИСТОРИЯ.</p>
        </div>
      </section>
    </main>
  );
}
