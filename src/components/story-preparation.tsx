"use client";

import { useEffect, useRef, useState } from "react";
import { Check } from "lucide-react";
import styles from "./story-preparation.module.css";

const labels = ["Твои интересы", "Твой напарник", "Твоя история", "Последние штрихи"];

/** Decorative onboarding sequence. Does not create a program or call any API. */
export function StoryPreparation({ onDone }: { onDone: () => void }) {
  const [done, setDone] = useState(0);
  const callback = useRef(onDone);
  const advanced = useRef(false);
  useEffect(() => {
    callback.current = onDone;
  }, [onDone]);
  useEffect(() => {
    advanced.current = false;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const timers: ReturnType<typeof setTimeout>[] = [];
    let elapsed = 0;
    for (let row = 0; row < labels.length; row++) {
      elapsed += reduced ? 80 : 2000 + Math.floor(Math.random() * 1001);
      timers.push(setTimeout(() => setDone(row + 1), elapsed));
    }
    timers.push(
      setTimeout(
        () => {
          if (!advanced.current) {
            advanced.current = true;
            callback.current();
          }
        },
        elapsed + (reduced ? 80 : 500),
      ),
    );
    return () => timers.forEach(clearTimeout);
  }, []);
  return (
    <div className={styles.sequence} aria-label="Готовим твоё пространство">
      <ol className={styles.steps}>
        {labels.map((label, index) => (
          <li
            key={label}
            data-state={index < done ? "done" : index === done ? "active" : "waiting"}
          >
            <span className={styles.indicator} aria-hidden="true">
              {index < done ? (
                <Check className={styles.check} size={20} strokeWidth={3} />
              ) : (
                <span className={styles.cutRing} />
              )}
              {index < done && <span className={styles.burst} />}
            </span>
            <span>{label}</span>
          </li>
        ))}
      </ol>
      <p className={styles.status} role="status" aria-live="polite">
        {done === labels.length
          ? "Всё на месте. Погнали!"
          : done === 0
            ? "Начинаем…"
            : done === labels.length - 1
              ? "Последние штрихи…"
              : `На месте ${done} из ${labels.length}`}
      </p>
      <div className={styles.track} aria-hidden="true">
        <span style={{ transform: `scaleX(${done / labels.length})` }} />
      </div>
    </div>
  );
}
