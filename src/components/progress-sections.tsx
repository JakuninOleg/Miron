"use client";

import { useRef, useState, type ReactNode } from "react";
import { JourneyStory } from "./journey-story";
import styles from "./journey-story.module.css";

export function ProgressSections({
  activityDays,
  children,
  initialSection = "xp",
}: {
  activityDays?: number;
  children: ReactNode;
  initialSection?: "xp" | "story";
}) {
  const [section, setSection] = useState<"xp" | "story">(initialSection);
  const content = useRef<HTMLDivElement>(null);
  function change(next: "xp" | "story") {
    setSection(next);
    requestAnimationFrame(() => {
      const heading = content.current?.querySelector("h2");
      if (heading) {
        heading.tabIndex = -1;
        heading.focus({ preventScroll: true });
        heading.scrollIntoView({ block: "start", behavior: "instant" });
      }
    });
  }
  return (
    <>
      <div className={styles.switches} role="group" aria-label="Раздел прогресса">
        <button type="button" aria-pressed={section === "xp"} onClick={() => change("xp")}>
          Опыт и достижения
        </button>
        <button type="button" aria-pressed={section === "story"} onClick={() => change("story")}>
          Твоя история
        </button>
      </div>
      <div ref={content}>
        {section === "story" ? <JourneyStory activityDays={activityDays} /> : children}
      </div>
    </>
  );
}
