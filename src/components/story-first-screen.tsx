"use client";

import Image from "next/image";
import { Apple, ArrowRight, ChartNoAxesColumnIncreasing, Dumbbell, Heart } from "lucide-react";
import { StoryHeader } from "./story-header";
import { StorySpeech } from "./story-speech";
import { StoryUnderline } from "./story-underline";
import { STORY_PANELS } from "@/shared/story-content";
import styles from "./story-reference.module.css";

const features = [
  { Icon: Dumbbell, title: "Тренировки" },
  { Icon: Apple, title: "Питание" },
  { Icon: ChartNoAxesColumnIncreasing, title: "Прогресс" },
  { Icon: Heart, title: "Поддержка" },
];

export function StoryFirstScreen({
  onNext,
  total = STORY_PANELS.length,
}: {
  onNext: () => void;
  total?: number;
}) {
  return (
    <main className={styles.screen} data-scene="welcome">
      <StoryHeader step={1} total={total} caption="Знакомство" overlay />
      <section className={styles.stage} aria-label="История знакомства" aria-busy={false}>
        <picture className={styles.welcomeArt}>
          <source
            media="(max-aspect-ratio: 6/5) and (min-height: 451px)"
            srcSet="/visuals/soft-3d/scenes/welcome-mobile-v2.webp"
          />
          <Image
            unoptimized
            src="/visuals/soft-3d/scenes/welcome-v2.webp"
            alt="Макс протягивает руку для знакомства, а Лика приветствует тебя с розовым шейкером"
            fill
            sizes="100vw"
            loading="eager"
          />
        </picture>
        <div className={styles.welcomeCopy}>
          <div className={styles.welcomeIntro}>
            <p className={styles.eyebrow}>Твой путь. На твоих условиях.</p>
            <h1 className={styles.title} tabIndex={-1}>
              Привет!
              <br />
              Мы{" "}
              <em className={styles.maxName}>
                Макс
                <StoryUnderline />
              </em>
              <br />и{" "}
              <em className={styles.likaName}>
                Лика.
                <StoryUnderline />
              </em>
            </h1>
            <p className={styles.description}>
              Будем рядом в тренировках.
              <br />А дальше разберёмся по ходу.
            </p>
          </div>
          <button type="button" className={styles.next} onClick={onNext}>
            Давай знакомиться <ArrowRight aria-hidden="true" />
          </button>
          <p className={styles.welcomeTagline}>Свой темп. Своя история.</p>
        </div>
        <StorySpeech className={styles.welcomeBubble} tail="right" shape="oval">
          <span>
            Ну что,
            <br />
          </span>
          знакомимся?
        </StorySpeech>
        <p className={styles.welcomeNote}>
          Я рядом ♡
          <svg viewBox="0 0 180 80" aria-hidden="true">
            <path d="M4 35Q12 12 36 16M153 33Q142 65 112 68" />
          </svg>
        </p>
        <footer className={styles.features}>
          {features.map(({ Icon, title }) => (
            <div className={styles.feature} key={title}>
              <Icon aria-hidden="true" />
              <div>
                <h2>{title}</h2>
              </div>
            </div>
          ))}
        </footer>
      </section>
    </main>
  );
}
