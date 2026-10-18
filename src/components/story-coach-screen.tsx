"use client";

import Image from "next/image";
import { ArrowLeft, ArrowRight, type LucideIcon } from "lucide-react";
import type { Ref } from "react";
import { StoryHeader } from "./story-header";
import { StorySpeech } from "./story-speech";
import { StoryUnderline } from "./story-underline";
import { STORY_PANELS } from "@/shared/story-content";
import styles from "./story-reference.module.css";

export interface CoachIntroDefinition {
  id: "max" | "lika";
  name: string;
  step: number;
  character: readonly string[];
  description: readonly string[];
  speech: string;
  benefits: readonly { Icon: LucideIcon; title: string; detail: string }[];
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

export function StoryCoachScreen({
  coach,
  onNext,
  onBack,
  titleRef,
  busy = false,
  direction = "forward",
  total = STORY_PANELS.length,
}: StoryCoachScreenProps & { coach: CoachIntroDefinition }) {
  return (
    <main
      className={styles.screen}
      data-scene="coach"
      data-companion={coach.id}
      data-direction={direction}
    >
      <StoryHeader
        step={coach.step}
        total={total}
        caption={coach.id === "max" ? "Макс" : "Лика"}
        companion={coach.id}
        overlay
      />
      <section className={styles.stage} aria-label="История знакомства" aria-busy={busy}>
        <div className={styles.intro}>
          <p className={styles.eyebrow}>Твой напарник</p>
          <h1
            className={`${styles.title} ${coach.id === "max" ? styles.maxName : styles.likaName}`}
            ref={titleRef}
            tabIndex={-1}
          >
            {coach.id === "max" ? "Макс." : "Лика."}
            <StoryUnderline />
          </h1>
          <p className={styles.character}>
            {coach.id === "max" ? (
              <>
                Больше движения.
                <br />
                Меньше сложностей.
              </>
            ) : (
              <>
                Без спешки.
                <br />С заботой о тебе.
              </>
            )}
          </p>
          <p className={styles.description}>
            {coach.description.map((line) => (
              <span className={styles.descriptionLine} key={line}>
                {line}{" "}
              </span>
            ))}
          </p>
        </div>
        <picture className={styles.coachArt} data-art="coach">
          <source
            media="(max-aspect-ratio: 6/5) and (min-height: 451px)"
            srcSet={`/visuals/soft-3d/scenes/${coach.id}-mobile-v2.webp`}
          />
          <Image
            unoptimized
            src={`/visuals/soft-3d/scenes/${coach.id}-v2.webp`}
            alt={
              coach.id === "max"
                ? "Макс с полотенцем у стойки с гантелями показывает большой палец"
                : "Лика сидит на коврике в светлой студии и делает дружелюбный жест ладонью"
            }
            fill
            sizes="100vw"
            loading="eager"
          />
        </picture>
        <p className={styles.artNote}>
          {coach.id === "max" ? (
            <>
              Маленький шаг —<br />
              тоже шаг!
            </>
          ) : (
            <>
              Можно в своём темпе.
              <br />
              Правда ♡
            </>
          )}
        </p>
        <StorySpeech className={styles.coachBubble} tail="right" shape="oval">
          {coach.speech}
        </StorySpeech>
        <ul
          className={styles.benefits}
          aria-label={coach.id === "max" ? "Как помогает Макс" : "Как помогает Лика"}
        >
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
          <button className={styles.next} type="button" onClick={onNext} disabled={busy}>
            {coach.cta}
            <ArrowRight aria-hidden="true" />
          </button>
          <div className={styles.actionFooter}>
            <button
              className={styles.back}
              type="button"
              onClick={onBack}
              disabled={busy}
              aria-label="Предыдущая сцена"
            >
              <ArrowLeft aria-hidden="true" />
              Назад
            </button>
            <span className={styles.tagline}>Свой темп. Своя история.</span>
          </div>
        </nav>
      </section>
    </main>
  );
}
