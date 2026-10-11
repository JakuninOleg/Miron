import Image from "next/image";
import type { CSSProperties } from "react";
import { STORY_PANELS } from "@/shared/story-content";
import styles from "./story-header.module.css";

type Props = {
  step: number;
  total?: number;
  caption: string;
  companion?: "max" | "lika";
};

export function StoryHeader({
  step,
  total = STORY_PANELS.length,
  caption,
  companion = "max",
}: Props) {
  const progress = total > 1 ? ((step - 1) / (total - 1)) * 100 : 0;
  const style: CSSProperties & { "--story-header-progress": string } = {
    "--story-header-progress": `${progress}%`,
  };
  return (
    <header className={styles.header} data-companion={companion}>
      <div className={styles.brand}>
        <Image
          className={styles.wordmark}
          src="/brand/wordmark.webp"
          alt="MIRON"
          width={500}
          height={69}
          loading="eager"
        />
      </div>
      <p className={styles.motto}>ТВОЙ ПУТЬ. НА ТВОИХ УСЛОВИЯХ.</p>
      <div className={styles.progress} aria-label={`Сцена ${step} из ${total}`}>
        <span className={styles.number}>
          <span className={styles.current}>{String(step).padStart(2, "0")}</span>
          <span className={styles.total}>/ {String(total).padStart(2, "0")}</span>
        </span>
        <div className={styles.dots} style={style} aria-hidden="true">
          {Array.from({ length: total }, (_, index) => (
            <i key={index} data-active={index < step} />
          ))}
        </div>
        <span className={styles.caption}>{caption}</span>
      </div>
    </header>
  );
}
