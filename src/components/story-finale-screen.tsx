"use client";

import { ArrowRight } from "lucide-react";
import type { Ref } from "react";
import type { CompanionId } from "@/shared/contracts";
import { STORY_PANELS } from "@/shared/story-content";
import { StoryHeader } from "./story-header";
import { StoryPreparation } from "./story-preparation";
import { StorySceneArt } from "./story-scene-art";
import { StoryUnderline } from "./story-underline";
import base from "./story-reference.module.css";
import styles from "./story-scenes.module.css";

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
  return (
    <main
      className={`${base.screen} ${styles.screen}`}
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
        tone="dark"
        overlay
      />
      <section
        className={`${base.stage} ${styles.finalScene}`}
        aria-label="История знакомства"
        aria-busy={busy}
      >
        <StorySceneArt scene={kind} className={styles.sceneArt} />
        <div className={styles.intro}>
          <p className={styles.eyebrow}>{preparing ? "Почти на месте" : "Мы в команде"}</p>
          <h1 className={`${base.title} ${styles.title}`} ref={titleRef} tabIndex={-1}>
            {preparing ? (
              <>Готовим твоё пространство</>
            ) : (
              <>
                Готово,
                <br />
                <span>напарник!</span>
                <StoryUnderline />
              </>
            )}
          </h1>
          <p className={styles.description}>
            {preparing
              ? companion === "max"
                ? "Раскладываем всё по местам. Уже почти!"
                : "Добавим немного уюта — и можно начинать."
              : companion === "max"
                ? "Давай сделаем этот день лучше. Я с тобой."
                : "Здесь можно быть собой. Начнём в твоём ритме."}
          </p>
        </div>
        {preparing ? (
          <div className={styles.preparation}>
            <StoryPreparation onDone={onNext} />
          </div>
        ) : (
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
              className={`${base.next} ${styles.next}`}
              type="button"
              onClick={onNext}
              disabled={busy || (adultConfirmation !== undefined && !adultConfirmation.confirmed)}
              aria-describedby={error ? "onboarding-save-error" : undefined}
            >
              {saving ? "Сохраняем…" : error ? "Попробовать ещё раз" : "Погнали"}
              <ArrowRight aria-hidden="true" />
            </button>
          </div>
        )}
        <p className={styles.tagline}>Свой темп. Своя история.</p>
        {!preparing && <p className={styles.finalNote}>Это только начало ♡</p>}
      </section>
    </main>
  );
}
