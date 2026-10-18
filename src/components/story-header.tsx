import Image from "next/image";
import { STORY_PANELS } from "@/shared/story-content";
import styles from "./story-header.module.css";

type Props = {
  step: number;
  total?: number;
  caption: string;
  companion?: "max" | "lika";
  tone?: "dark" | "light";
  overlay?: boolean;
};

export function StoryHeader({
  step,
  total = STORY_PANELS.length,
  caption,
  companion = "max",
  tone = companion === "lika" ? "light" : "dark",
  overlay = false,
}: Props) {
  return (
    <header
      className={styles.header}
      data-companion={companion}
      data-tone={tone}
      data-overlay={overlay}
    >
      <div className={styles.brand}>
        <Image
          unoptimized
          className={styles.wordmark}
          src="/brand/wordmark.webp"
          alt="MIRON"
          width={500}
          height={69}
          loading="eager"
        />
      </div>
      <p className={styles.motto}>
        Твой фитнес-компаньон
        <br />
        на каждый день
      </p>
      <div className={styles.progress} aria-label={`Сцена ${step} из ${total}`}>
        <span className={styles.caption}>{caption}</span>
        <span className={styles.separator} aria-hidden="true" />
        <span className={styles.number}>
          <span className={styles.current}>{String(step).padStart(2, "0")}</span>
          <span className={styles.total}>/ {String(total).padStart(2, "0")}</span>
        </span>
      </div>
    </header>
  );
}
