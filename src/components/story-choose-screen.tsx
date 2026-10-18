"use client";

import { ArrowLeft, ArrowRight, Check } from "lucide-react";
import type { Ref } from "react";
import type { CompanionId } from "@/shared/contracts";
import { STORY_PANELS } from "@/shared/story-content";
import { StoryHeader } from "./story-header";
import { StorySceneArt } from "./story-scene-art";
import { StoryUnderline } from "./story-underline";
import { StorySpeech } from "./story-speech";
import base from "./story-reference.module.css";
import styles from "./story-scenes.module.css";

const coaches = [
  {
    id: "max",
    name: "Макс",
    label: "МАКС Энергия и характер",
    character: "Энергия и характер",
    speech: "Погнали? Я на твоей стороне.",
  },
  {
    id: "lika",
    name: "Лика",
    label: "ЛИКА Внимание и баланс",
    character: "Внимание и баланс",
    speech: "Начнём спокойно. Я рядом.",
  },
] as const;
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
    <main
      className={`${base.screen} ${styles.screen}`}
      data-scene="choose"
      data-persona={companion ?? "max"}
      data-direction={direction}
    >
      <StoryHeader
        step={step}
        total={total}
        caption="Твой напарник"
        companion={companion ?? "max"}
        tone="dark"
        overlay
      />
      <section
        className={`${base.stage} ${styles.choiceScene}`}
        aria-label="История знакомства"
        aria-busy={busy}
      >
        <StorySceneArt scene="choose" className={styles.sceneArt} />
        <div className={styles.intro}>
          <p className={styles.eyebrow}>Одна команда. Два характера.</p>
          <h1 className={`${base.title} ${styles.title}`} ref={titleRef} tabIndex={-1}>
            С кем <br /> <span>начнём?</span>
            <StoryUnderline />
          </h1>
          <p className={styles.description}>Два характера. Одна команда.</p>
          <p className={styles.choiceNote}>Сменить напарника можно между тренировками.</p>
        </div>
        <StorySpeech
          className={styles.choiceBubble}
          shape="oval"
          tail={companion === "lika" ? "left" : "right"}
        >
          {companion === "lika"
            ? "Расскажи, что любишь. Начнём с этого ♡"
            : "Погнали? Я на твоей стороне."}
        </StorySpeech>
        <div className={styles.coachChoices} role="group" aria-label="Выбери первого напарника">
          {coaches.map((coach) => (
            <button
              key={coach.id}
              type="button"
              className={styles.coachCard}
              data-coach={coach.id}
              aria-label={coach.label}
              aria-pressed={companion === coach.id}
              disabled={busy}
              onClick={() => onSelect(coach.id)}
            >
              <span className={styles.coachCardCopy}>
                <span className={styles.coachName}>{coach.name}</span>
                <span className={styles.coachTrait}>{coach.character}</span>
              </span>
              <span className={styles.check} data-selected={companion === coach.id}>
                <Check aria-hidden="true" />
              </span>
            </button>
          ))}
        </div>
        <nav className={styles.actions} aria-label="Навигация по знакомству">
          <p id="coach-choice-hint" className={styles.choiceHint} aria-live="polite">
            <span className={styles.desktopCopy}>
              {companion === "lika"
                ? "Лика: «Расскажи, что любишь. Начнём с этого ♡»"
                : companion === "max"
                  ? "Макс: «Погнали? Я на твоей стороне»."
                  : "Кто будет твоим первым напарником?"}
            </span>
            <span className={styles.mobileCopy}>
              {companion === "lika"
                ? "Лика: «В твоём темпе. Вместе ♡»"
                : companion === "max"
                  ? "Макс: «Погнали? Я на твоей стороне»"
                  : "Кто будет твоим первым напарником?"}
            </span>
          </p>
          <button
            type="button"
            className={`${base.next} ${styles.next}`}
            disabled={busy || !companion}
            aria-describedby="coach-choice-hint"
            onClick={onNext}
          >
            {companion === "lika" ? "Начать с Ликой" : "Начать с Максом"}
            <ArrowRight aria-hidden="true" />
          </button>
          <div className={styles.actionFooter}>
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
            <span className={styles.tagline}>Свой темп. Своя история.</span>
          </div>
        </nav>
      </section>
    </main>
  );
}
