import type { ReactNode } from "react";
import styles from "./story-soft.module.css";

export function StorySpeech({
  children,
  className = "",
  tail = "left",
  shape = "rectangle",
}: {
  children: ReactNode;
  className?: string;
  tail?: "left" | "right";
  shape?: "rectangle" | "oval";
}) {
  return (
    <blockquote className={`${styles.speech} ${className}`} data-shape={shape}>
      <svg viewBox="0 0 280 120" preserveAspectRatio="none" aria-hidden="true">
        <path
          d={
            shape === "oval"
              ? tail === "right"
                ? "M236 86C260 108 275 114 278 114C259 116 236 110 217 99C185 107 69 108 34 96C-4 83-6 34 24 17C52 0 207-4 240 15C266 29 269 71 236 86Z"
                : "M45 86C21 108 6 114 3 114C22 116 45 110 64 99C96 107 212 108 247 96C285 83 287 34 257 17C229 0 74-4 41 15C15 29 12 71 45 86Z"
              : tail === "right"
                ? "M27 3H253Q277 3 277 26V76Q277 99 253 99H244L276 117L214 99H27Q3 99 3 76V26Q3 3 27 3Z"
                : "M27 3H253Q277 3 277 26V76Q277 99 253 99H116L92 117L96 99H27Q3 99 3 76V26Q3 3 27 3Z"
          }
        />
      </svg>
      <span>{children}</span>
    </blockquote>
  );
}
