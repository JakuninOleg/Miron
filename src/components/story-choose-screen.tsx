"use client";

import "@fontsource/roboto-condensed/cyrillic-900.css";
import "@fontsource/neucha/cyrillic-400.css";
import Image from "next/image";
import { ArrowLeft, ArrowRight, Heart } from "lucide-react";
import type { Ref } from "react";
import type { CompanionId } from "@/shared/contracts";
import { STORY_PANELS } from "@/shared/story-content";
import { StoryHeader } from "./story-header";
import styles from "./story-choose-screen.module.css";

const coaches = [
  {
    id: "max",
    name: "МАКС",
    label: "МАКС Энергия и характер",
    character: "Прямой. Энергичный.",
    mobileCharacter: "Энергия и характер",
    detail: "Поддержит и поможет двигаться вперёд.",
    quote: "Давай, я рядом.",
    mobileQuote: "Давай, я рядом.",
    image: "/story-choose/max-v1.webp",
  },
  {
    id: "lika",
    name: "ЛИКА",
    label: "ЛИКА Внимание и драйв",
    character: "Внимательная. С характером.",
    mobileCharacter: "Внимание и баланс",
    detail: "Поможет разобраться и найти баланс.",
    quote: "Начнём в твоём ритме.",
    mobileQuote: "В твоём ритме.",
    image: "/story-choose/lika-v1.webp",
  },
] as const;

const selectionFrame = (
  <svg
    className={styles.selectionFrame}
    viewBox="0 0 100 100"
    preserveAspectRatio="none"
    aria-hidden="true"
    focusable="false"
  >
    <rect x="0.5" y="0.5" width="99" height="99" rx="1.4" vectorEffect="non-scaling-stroke" />
  </svg>
);

type Props = {
  companion: CompanionId | null;
  onSelect: (companion: CompanionId) => void;
  onNext: () => void;
  onBack: () => void;
  titleRef?: Ref<HTMLHeadingElement>;
  busy?: boolean;
  direction?: string;
  step?: number;
  total?: number;
};

export function StoryChooseScreen({
  companion,
  onSelect,
  onNext,
  onBack,
  titleRef,
  busy = false,
  direction = "forward",
  step = STORY_PANELS.findIndex((panel) => panel.kind === "choose") + 1,
  total = STORY_PANELS.length,
}: Props) {
  return (
    <main className={styles.screen} data-persona={companion ?? "max"} data-direction={direction}>
      <StoryHeader
        step={step}
        total={total}
        caption="Твой напарник"
        companion={companion ?? "max"}
      />
      <section className={styles.scene} aria-label="История знакомства" aria-busy={busy}>
        <div className={styles.intro}>
          <p className={styles.eyebrow}>ОДНА КОМАНДА. ДВА ХАРАКТЕРА.</p>
          <h1 className={styles.title} ref={titleRef} tabIndex={-1}>
            <span>С КЕМ</span> <span>НАЧНЁМ?</span>
          </h1>
          <p className={styles.description}>
            Выбери, с кем хочешь начать.
            <span className={styles.descriptionFull}>
              {" "}
              Макс и Лика всегда рядом — переключиться можно в любой момент.
            </span>
            <span className={styles.descriptionShort}>Переключиться можно в любой момент.</span>
          </p>
          <p className={styles.handNote} aria-hidden="true">
            Твой темп.
            <br />
            Твой выбор. <Heart />
          </p>
        </div>

        <div className={styles.choices} role="group" aria-label="Выбери первого напарника">
          {coaches.map((coach) => (
            <button
              key={coach.id}
              type="button"
              className={styles.card}
              data-coach={coach.id}
              aria-label={coach.label}
              aria-pressed={companion === coach.id}
              disabled={busy}
              onClick={() => onSelect(coach.id)}
            >
              <Image
                className={styles.portrait}
                src={coach.image}
                alt=""
                fill
                sizes="(max-aspect-ratio: 1/1) max(45vw, 44vh), 34vw"
                loading="eager"
              />
              <span className={styles.cardShade} aria-hidden="true" />
              <span className={styles.cardCopy}>
                <span className={styles.coachName}>{coach.name}</span>
                <span className={styles.character}>
                  <span className={styles.desktopCopy}>{coach.character}</span>
                  <span className={styles.mobileCopy}>{coach.mobileCharacter}</span>
                </span>
                <span className={styles.detail}>{coach.detail}</span>
                <span className={styles.quote}>
                  <span className={styles.desktopCopy}>{coach.quote}</span>
                  <span className={styles.mobileCopy}>{coach.mobileQuote}</span>
                </span>
              </span>
              {selectionFrame}
            </button>
          ))}
        </div>

        <nav className={styles.actions} aria-label="Навигация по знакомству">
          <p id="coach-choice-hint" className={styles.choiceHint} aria-live="polite">
            {companion ? "Отлично. Можно знакомиться ближе." : "Кто будет твоим первым напарником?"}
          </p>
          <button
            type="button"
            className={styles.next}
            disabled={busy || !companion}
            aria-describedby="coach-choice-hint"
            onClick={onNext}
          >
            {companion === "lika" ? "Начать с Ликой" : "Начать с Максом"}
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
            <span className={styles.tagline}>Свой темп. Своя история.</span>
          </div>
        </nav>
      </section>
    </main>
  );
}
