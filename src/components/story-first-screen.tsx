"use client";

import "@fontsource/roboto-condensed/cyrillic-900.css";
import "@fontsource/roboto-condensed/latin-900.css";
import "@fontsource/neucha/cyrillic-400.css";
import "@fontsource/neucha/latin-400.css";
import { getImageProps } from "next/image";
import { ArrowRight, ChartNoAxesColumnIncreasing, Dumbbell, Heart, Utensils } from "lucide-react";
import { StoryHeader } from "./story-header";
import { STORY_PANELS } from "@/shared/story-content";
import styles from "./story-first-screen.module.css";

const features = [
  { Icon: Dumbbell, title: "ТРЕНИРОВКИ", lines: ["Под твои цели", "и возможности"] },
  { Icon: Utensils, title: "ПИТАНИЕ", lines: ["Без жёстких", "ограничений"] },
  { Icon: ChartNoAxesColumnIncreasing, title: "ПРОГРЕСС", lines: ["Реальные", "результаты"] },
  { Icon: Heart, title: "ПОДДЕРЖКА", lines: ["Макс и Лика", "всегда рядом"] },
];
const artDescription =
  "Макс протягивает руку для знакомства. Рядом улыбается Лика, опираясь щекой на ладонь.";
const desktopImage = getImageProps({
  src: "/story-first/desktop-v2.webp",
  width: 1672,
  height: 941,
  alt: artDescription,
  sizes: "100vw",
  loading: "eager",
  fetchPriority: "high",
}).props;
const portraitImage = getImageProps({
  src: "/story-first/mobile-v2.webp",
  width: 1086,
  height: 1448,
  alt: artDescription,
  sizes: "100vw",
}).props;

function SpeechBubble({ coach }: { coach: "max" | "lika" }) {
  const isMax = coach === "max";
  return (
    <div className={`${styles.bubble} ${isMax ? styles.maxBubble : styles.likaBubble}`}>
      <svg
        className={`${styles.bubbleShape} ${styles.desktopBubbleShape}`}
        viewBox={isMax ? "0 0 240 150" : "-40 0 280 150"}
        preserveAspectRatio="none"
        aria-hidden="true"
        focusable="false"
      >
        <path
          vectorEffect="non-scaling-stroke"
          d={
            isMax
              ? "M25 2H215Q238 2 238 25V75Q238 98 215 98H204L222 140L166 98H25Q2 98 2 75V25Q2 2 25 2Z"
              : "M25 2H215Q238 2 238 25V75Q238 98 215 98H55L-35 145L17 94Q2 90 2 75V25Q2 2 25 2Z"
          }
        />
      </svg>
      <svg
        className={`${styles.bubbleShape} ${styles.portraitBubbleShape}`}
        viewBox="0 0 240 150"
        preserveAspectRatio="none"
        aria-hidden="true"
        focusable="false"
      >
        <path
          vectorEffect="non-scaling-stroke"
          d={
            isMax
              ? "M119 2C55 2 3 12 3 41C3 77 22 98 111 98C149 98 171 94 184 88L219 131L202 78C225 66 237 50 237 39C237 13 182 2 119 2Z"
              : "M25 2H215Q238 2 238 25V75Q238 98 215 98H93L55 138L47 98H25Q2 98 2 75V25Q2 2 25 2Z"
          }
        />
      </svg>
      <span className={styles.speaker}>{isMax ? "МАКС" : "ЛИКА"}</span>
      <p>
        {isMax ? "Ну что," : "Здорово,"}
        <br />
        {isMax ? "знакомимся?" : "что ты с нами!"}
      </p>
    </div>
  );
}

export function StoryFirstScreen({
  onNext,
  total = STORY_PANELS.length,
}: {
  onNext: () => void;
  total?: number;
}) {
  return (
    <main className={styles.screen}>
      <StoryHeader step={1} total={total} caption="Знакомство" />
      <section className={styles.scene} aria-label="История знакомства" aria-busy="false">
        <div className={styles.artStage}>
          <picture className={styles.picture}>
            <source media="(max-aspect-ratio: 1/1)" srcSet={portraitImage.srcSet} sizes="100vw" />
            <img {...desktopImage} alt={artDescription} className={styles.art} />
          </picture>
          <div className={styles.artShade} aria-hidden="true" />
          <SpeechBubble coach="max" />
          <SpeechBubble coach="lika" />
          <p className={styles.artNote} aria-hidden="true">
            СВОЙ ТЕМП.
            <br />
            СВОЯ ИСТОРИЯ.<span>☺</span>
          </p>
        </div>
        <div className={styles.copy}>
          <div className={styles.copyPaint} aria-hidden="true" />
          <div className={styles.intro}>
            <p className={styles.eyebrow}>ТВОЙ ПУТЬ. НА ТВОИХ УСЛОВИЯХ.</p>
            <h1 className={styles.title} tabIndex={-1}>
              <span className={styles.greeting}>ПРИВЕТ!</span>
              <span className={styles.names}>
                <span className={styles.maxLine}>
                  МЫ <em className={styles.maxName}>МАКС</em>
                </span>
                <span className={styles.likaLine}>
                  {" "}
                  И <em className={styles.likaName}>ЛИКА.</em>
                </span>
              </span>
            </h1>
            <p className={styles.description}>
              Будем рядом в тренировках.
              <br />А дальше разберёмся по ходу. <Heart aria-hidden="true" />
            </p>
          </div>
          <button type="button" className={styles.cta} onClick={onNext}>
            Давай знакомиться
            <ArrowRight aria-hidden="true" />
          </button>
        </div>
        <footer className={styles.bottom}>
          <div className={styles.features}>
            {features.map(({ Icon, title, lines }) => (
              <div className={styles.feature} key={title}>
                <Icon aria-hidden="true" />
                <div>
                  <h2>{title}</h2>
                  <p>
                    {lines[0]}
                    <br />
                    {lines[1]}
                  </p>
                </div>
              </div>
            ))}
          </div>
          <div className={styles.mobileProgress}>
            <p>СВОЙ ТЕМП. СВОЯ ИСТОРИЯ.</p>
          </div>
        </footer>
      </section>
    </main>
  );
}
