"use client";

import Image from "next/image";
import { ArrowLeft, ArrowRight, Check, Compass } from "lucide-react";
import type { Ref } from "react";
import { STORY_INTERESTS, STORY_PANELS } from "@/shared/story-content";
import { StoryHeader } from "./story-header";
import { StorySceneArt } from "./story-scene-art";
import { StoryUnderline } from "./story-underline";
import base from "./story-reference.module.css";
import styles from "./story-scenes.module.css";

const descriptions = {
  strength: { title: "Зал", detail: "Железо и сила", image: "gym" },
  home: { title: "Силовые дома", detail: "Свой зал дома", image: "home" },
  calisthenics: { title: "Калистеника", detail: "Турник и свой вес", image: "park" },
  yoga: { title: "Йога", detail: "Баланс и дыхание", image: "yoga" },
  mobility: { title: "Растяжка", detail: "Подвижность и лёгкость", image: "mobility" },
} satisfies Record<
  (typeof STORY_INTERESTS)[number]["id"],
  { title: string; detail: string; image: string }
>;

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
      if (!interests.includes("explore"))
        interests.filter((interest) => interest !== "explore").forEach(onToggleInterest);
    } else if (interests.includes("explore")) onToggleInterest("explore");
    onToggleInterest(id);
  }
  return (
    <main
      className={`${base.screen} ${styles.screen}`}
      data-scene="interests"
      data-direction={direction}
    >
      <StoryHeader step={4} total={total} caption="Что тебе ближе?" overlay />
      <section
        className={`${base.stage} ${styles.interestScene}`}
        aria-label="История знакомства"
        aria-busy={busy}
      >
        <StorySceneArt scene="interests" className={styles.sceneArt} />
        <div className={styles.intro}>
          <p className={styles.eyebrow}>Теперь про тебя</p>
          <h1 className={`${base.title} ${styles.title}`} ref={titleRef} tabIndex={-1}>
            Что тебе
            <br /> ближе?
            <StoryUnderline />
          </h1>
          <p className={styles.description} id="interests-hint">
            <span className={styles.desktopCopy}>
              Выбери несколько направлений — или попробуем вместе.
            </span>
            <span className={styles.mobileCopy}>Можно выбрать несколько.</span>
          </p>
        </div>
        <div className={styles.selection}>
          <div
            className={styles.choices}
            role="group"
            aria-label="Направления тренировок"
            aria-describedby="interests-hint"
          >
            {STORY_INTERESTS.map((interest) => {
              const option = descriptions[interest.id];
              return (
                <button
                  key={interest.id}
                  type="button"
                  className={styles.interestCard}
                  aria-label={interest.label}
                  aria-pressed={interests.includes(interest.id)}
                  disabled={busy}
                  onClick={() => toggle(interest.id)}
                >
                  <span className={styles.cardArt}>
                    <Image
                      unoptimized
                      src={`/visuals/soft-3d/${option.image}.webp`}
                      alt=""
                      fill
                      sizes="(max-width: 700px) 45vw, 24vw"
                    />
                  </span>
                  <span className={styles.cardCopy}>
                    <span className={styles.cardTitle}>{option.title}</span>
                    <span className={styles.cardDetail}>{option.detail}</span>
                  </span>
                  <span className={styles.check}>
                    <Check aria-hidden="true" />
                  </span>
                </button>
              );
            })}
            <button
              type="button"
              className={`${styles.interestCard} ${styles.explore}`}
              aria-label="Пока не знаю"
              aria-pressed={interests.includes("explore")}
              disabled={busy}
              onClick={() => toggle("explore")}
            >
              <Compass aria-hidden="true" />
              <span className={styles.cardCopy}>
                <span className={styles.cardTitle}>Пока не знаю</span>
                <span className={styles.cardDetail}>Разберёмся вместе</span>
              </span>
              <span className={styles.check}>
                <Check aria-hidden="true" />
              </span>
            </button>
          </div>
          <nav className={styles.actions} aria-label="Навигация по знакомству">
            <button
              className={`${base.back} ${styles.back}`}
              type="button"
              onClick={onBack}
              disabled={busy}
              aria-label="Предыдущая сцена"
            >
              <ArrowLeft aria-hidden="true" />
              Назад
            </button>
            <button
              className={`${base.next} ${styles.next}`}
              type="button"
              onClick={onNext}
              disabled={busy}
            >
              Дальше
              <ArrowRight aria-hidden="true" />
            </button>
          </nav>
        </div>
      </section>
    </main>
  );
}
