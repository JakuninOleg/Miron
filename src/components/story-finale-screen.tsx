"use client";

import "@fontsource/roboto-condensed/cyrillic-900.css";
import "@fontsource/neucha/cyrillic-400.css";
import Image from "next/image";
import { ArrowRight, Crown } from "lucide-react";
import type { Ref } from "react";
import type { CompanionId } from "@/shared/contracts";
import { STORY_PANELS } from "@/shared/story-content";
import { StoryHeader } from "./story-header";
import { StoryPreparation } from "./story-preparation";
import styles from "./story-finale-screen.module.css";

type Props = {
  kind: "prepare" | "finish";
  companion: CompanionId;
  onNext: () => void;
  titleRef?: Ref<HTMLHeadingElement>;
  busy?: boolean;
  direction?: string;
  step: number;
  adultConfirmation?: { confirmed: boolean; onChange: (confirmed: boolean) => void };
  saving?: boolean;
  error?: string | null;
};

export function StoryFinaleScreen({
  kind,
  companion,
  onNext,
  titleRef,
  busy = false,
  direction = "forward",
  step,
  adultConfirmation,
  saving = false,
  error,
}: Props) {
  const preparing = kind === "prepare";
  const artworks = companion === "lika" ? (["prepare", "finish"] as const) : [kind];
  const art = (
    <div className={styles.art}>
      {artworks.map((artwork) => (
        <div
          key={artwork}
          className={styles.artPicture}
          aria-hidden={artwork !== kind}
          data-art={artwork}
        >
          <picture>
            {artwork === "prepare" && (
              <source
                media="(max-aspect-ratio: 1/1)"
                srcSet="/story-finale/preparation-mobile-v1.webp"
              />
            )}
            <Image
              className={styles.artImage}
              src={`/story-finale/${artwork === "prepare" ? "preparation" : "finish"}-v1.webp`}
              alt={
                artwork === "prepare"
                  ? "Спортивная сумка, полотенце, гантель и шейкер"
                  : "Дружеское касание кулаками Макса и Лики"
              }
              width={1254}
              height={1254}
              sizes="(max-aspect-ratio: 1/1) max(100vw, 55vh), 65vw"
              loading="eager"
            />
          </picture>
        </div>
      ))}
      <p className={styles.artNote} aria-hidden="true">
        {preparing ? (
          <>
            Хорошие вещи
            <br />
            требуют подготовки.
          </>
        ) : (
          <>
            Это только
            <br />
            начало…
          </>
        )}
        <Crown />
      </p>
    </div>
  );

  return (
    <main
      className={styles.screen}
      data-kind={kind}
      data-persona={companion}
      data-direction={direction}
      data-account={adultConfirmation ? "true" : undefined}
    >
      <StoryHeader
        step={step}
        total={STORY_PANELS.length}
        caption={preparing ? "Почти на месте" : "Мы в команде"}
        companion={companion}
      />
      <section className={styles.scene} aria-label="История знакомства" aria-busy={busy}>
        <div className={styles.intro}>
          <p className={styles.eyebrow}>{preparing ? "ПОЧТИ НА МЕСТЕ" : "МЫ В КОМАНДЕ"}</p>
          <h1 className={styles.title} ref={titleRef} tabIndex={-1}>
            {preparing ? (
              <>
                <span>ГОТОВИМ ТВОЁ</span> <span>ПРОСТРАНСТВО</span>
              </>
            ) : (
              <>
                <span>ГОТОВО,</span> <span>НАПАРНИК!</span>
              </>
            )}
          </h1>
          <p className={styles.description}>
            {preparing ? (
              "Пара штрихов — и можно знакомиться ближе."
            ) : (
              <>
                Давай сделаем этот день лучше.
                <br />В твоём ритме. Мы рядом.
              </>
            )}
          </p>
        </div>
        {preparing ? (
          <>
            {art}
            <StoryPreparation onDone={onNext} />
          </>
        ) : (
          <>
            {art}
            <div className={styles.actions}>
              {adultConfirmation ? (
                <label className={styles.adultConfirmation}>
                  <input
                    type="checkbox"
                    checked={adultConfirmation.confirmed}
                    onChange={(event) => adultConfirmation.onChange(event.target.checked)}
                    disabled={busy}
                  />
                  <span>Мне уже исполнилось 18 лет</span>
                </label>
              ) : null}
              {error ? (
                <p className={styles.saveError} role="alert" id="onboarding-save-error">
                  {error}
                </p>
              ) : null}
              <button
                className={styles.next}
                type="button"
                onClick={onNext}
                disabled={busy || (adultConfirmation !== undefined && !adultConfirmation.confirmed)}
                aria-describedby={error ? "onboarding-save-error" : undefined}
              >
                {saving ? "Сохраняем…" : error ? "Попробовать ещё раз" : "Погнали"}
                <ArrowRight aria-hidden="true" />
              </button>
            </div>
          </>
        )}
        <p className={styles.tagline}>Свой темп. Своя история.</p>
      </section>
    </main>
  );
}
