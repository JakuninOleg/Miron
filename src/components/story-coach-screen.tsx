"use client";

import "@fontsource/roboto-condensed/cyrillic-900.css";
import "@fontsource/roboto-condensed/latin-900.css";
import "@fontsource/neucha/cyrillic-400.css";
import Image, { getImageProps } from "next/image";
import { ArrowLeft, ArrowRight, Check, type LucideIcon } from "lucide-react";
import { Fragment, type Ref } from "react";
import { StoryHeader } from "./story-header";
import { STORY_PANELS } from "@/shared/story-content";
import styles from "./story-coach-screen.module.css";

export interface CoachIntroDefinition {
  id: "max" | "lika";
  name: string;
  step: number;
  character: readonly string[];
  description: string;
  speech: string;
  benefits: readonly { Icon: LucideIcon; title: string; detail: string }[];
  art: { description: string; desktop: string; portrait: string };
  panels: readonly { src: string; alt: string }[];
  wallNote: readonly string[];
  kneeNote: readonly string[];
  quote: readonly string[];
  cta: string;
}

export interface StoryCoachScreenProps {
  onNext: () => void;
  onBack: () => void;
  titleRef?: Ref<HTMLHeadingElement>;
  busy?: boolean;
  direction?: string;
  total?: number;
}

function Lines({ lines }: { lines: readonly string[] }) {
  return lines.map((line, index) => (
    <Fragment key={line}>
      {index > 0 && <br />}
      {line}
    </Fragment>
  ));
}

function CoachSpeechBubble({ coach }: { coach: CoachIntroDefinition }) {
  return (
    <div className={styles.bubble}>
      <svg viewBox="0 0 280 180" preserveAspectRatio="none" aria-hidden="true" focusable="false">
        <path
          vectorEffect="non-scaling-stroke"
          d={
            coach.id === "max"
              ? "M30 3H248Q277 3 277 32V122Q277 151 248 151H205L255 178L165 151H30Q3 151 3 122V32Q3 3 30 3Z"
              : "M30 3H248Q277 3 277 32V122Q277 151 248 151H99L40 178L50 151H30Q3 151 3 122V32Q3 3 30 3Z"
          }
        />
      </svg>
      <span className={styles.speaker}>{coach.name}</span>
      <p>{coach.speech}</p>
    </div>
  );
}

export function StoryCoachScreen({
  coach,
  onNext,
  onBack,
  titleRef,
  busy = false,
  direction = "forward",
  total = STORY_PANELS.length,
}: StoryCoachScreenProps & { coach: CoachIntroDefinition }) {
  const desktopImage = getImageProps({
    src: coach.art.desktop,
    width: 1672,
    height: 941,
    alt: coach.art.description,
    sizes: "100vw",
    loading: "eager",
    fetchPriority: "high",
  }).props;
  const portraitImage = getImageProps({
    src: coach.art.portrait,
    width: 1086,
    height: 1448,
    alt: coach.art.description,
    sizes: "100vw",
  }).props;
  const displayName = coach.id === "max" ? "Макс" : "Лика";
  return (
    <main className={styles.screen} data-direction={direction} data-companion={coach.id}>
      <StoryHeader step={coach.step} total={total} caption={displayName} companion={coach.id} />
      <section className={styles.scene} aria-label="История знакомства" aria-busy={busy}>
        <div className={styles.artStage}>
          <picture className={styles.picture}>
            <source media="(max-aspect-ratio: 1/1)" srcSet={portraitImage.srcSet} sizes="100vw" />
            <img {...desktopImage} alt={coach.art.description} className={styles.art} />
          </picture>
          <div className={styles.shade} aria-hidden="true" />
          <CoachSpeechBubble coach={coach} />
          <p className={styles.wallNote} aria-hidden="true">
            <Lines lines={coach.wallNote} />
            <span>{coach.id === "max" ? "♕" : "♡"}</span>
          </p>
          <p className={styles.kneeNote} aria-hidden="true">
            <Lines lines={coach.kneeNote} />
            <span>☺</span>
          </p>
        </div>
        <div className={styles.intro}>
          <p className={styles.eyebrow}>ТВОЙ ТРЕНЕР</p>
          <h1 ref={titleRef} tabIndex={-1} className={styles.title}>
            {coach.name}
          </h1>
          <p className={styles.character}>
            <Lines lines={coach.character} />
          </p>
          <p className={styles.description}>{coach.description}</p>
        </div>
        <ul className={styles.benefits} aria-label={`Как помогает ${displayName}`}>
          {coach.benefits.map(({ Icon, title, detail }) => (
            <li key={title}>
              <span className={styles.benefitIcon}>
                <Icon aria-hidden="true" />
              </span>
              <div>
                <h2>{title}</h2>
                <p>{detail}</p>
              </div>
            </li>
          ))}
        </ul>
        <nav className={styles.actions} aria-label="Навигация по знакомству">
          <button type="button" className={styles.next} disabled={busy} onClick={onNext}>
            {coach.cta}
            <ArrowRight aria-hidden="true" />
          </button>
          <div className={styles.actionFooter}>
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
            <span className={styles.tagline}>СВОЙ ТЕМП. СВОЯ ИСТОРИЯ.</span>
          </div>
        </nav>
        <aside
          className={styles.sideStory}
          aria-label={`Знакомство с ${coach.id === "max" ? "Максом" : "Ликой"} в комиксе`}
        >
          <div className={styles.panels}>
            {coach.panels.map(({ src, alt }) => (
              <div className={styles.comicFrame} key={src}>
                <Image
                  src={src}
                  alt={alt}
                  width={1672}
                  height={941}
                  sizes="20vw"
                  loading="eager"
                  className={styles.panelArt}
                />
              </div>
            ))}
          </div>
          <blockquote className={styles.quote}>
            <span aria-hidden="true">“</span>
            <p>
              <Lines lines={coach.quote} />
            </p>
            <cite>{displayName}</cite>
          </blockquote>
          <div className={styles.together}>
            <p>ВМЕСТЕ МЫ:</p>
            <ul>
              {["Найдём твой ритм", "Сделаем движение привычкой", "Будем двигаться вперёд"].map(
                (line) => (
                  <li key={line}>
                    <Check aria-hidden="true" />
                    {line}
                  </li>
                ),
              )}
            </ul>
          </div>
          <p className={styles.sideTagline}>СВОЙ ТЕМП. СВОЯ ИСТОРИЯ.</p>
        </aside>
      </section>
    </main>
  );
}
