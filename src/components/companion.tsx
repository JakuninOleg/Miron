"use client";
import Image from "next/image";

import { Check, ChevronDown } from "lucide-react";
import type { CompanionId, Progress } from "@/shared/contracts";

export const companionNames: Record<CompanionId, string> = { max: "Макс", lika: "Лика" };
export function CompanionStage({
  companion,
  progress,
}: {
  companion: CompanionId;
  progress: Progress;
}) {
  const level = Math.floor(progress.xp / 500) + 1;
  const levelXp = progress.xp % 500;
  return (
    <section
      className="companion-stage"
      data-companion={companion}
      aria-label={`Твой напарник ${companionNames[companion]}`}
    >
      <span className="stage-name" aria-hidden="true">
        {companionNames[companion].toUpperCase()}
      </span>
      <div className="stage-top">
        <h2>{companionNames[companion]}</h2>
        <p>{companion === "max" ? "Начнём в твоём темпе." : "Я рядом. Давай начнём?"}</p>
      </div>
      {/* Own generated companion illustration; never presented as exercise technique. */}

      <Image
        unoptimized
        loading="eager"
        width={768}
        height={1152}
        className="character"
        src={`/characters/${companion}.webp`}
        alt=""
      />
      <span className="stage-stamp" aria-hidden="true">
        Лучше,
        <br />
        чем вчера.
      </span>
      <div className="stage-progress">
        <div className="stage-progress-label">
          <span>Уровень {level}</span>
          <span>{levelXp} / 500 XP</span>
        </div>
        <div
          className="meter"
          role="progressbar"
          aria-label="Опыт напарника"
          aria-valuenow={levelXp}
          aria-valuemin={0}
          aria-valuemax={500}
        >
          <span style={{ width: `${levelXp / 5}%` }} />
        </div>
      </div>
    </section>
  );
}

export function CompanionSwitch({
  companion,
  onChange,
}: {
  companion: CompanionId;
  onChange: (id: CompanionId) => void | Promise<void>;
}) {
  return (
    <button
      className="companion-switch"
      onClick={() =>
        void Promise.resolve(onChange(companion === "max" ? "lika" : "max")).catch(() => undefined)
      }
      aria-label={`Напарник ${companionNames[companion]}. Переключить на ${companion === "max" ? "Лику" : "Макса"}`}
    >
      <Image
        unoptimized
        width={768}
        height={1152}
        src={`/characters/${companion}-avatar.webp`}
        alt=""
      />
      <span>{companionNames[companion]}</span>
      <ChevronDown size={15} />
    </button>
  );
}

export function CompanionOptions({
  value,
  onChange,
}: {
  value: CompanionId;
  onChange: (id: CompanionId) => void;
}) {
  return (
    <div className="companion-options" role="group" aria-label="Выбери напарника">
      {(["max", "lika"] as const).map((id) => (
        <button
          key={id}
          type="button"
          data-companion={id}
          className={`companion-option ${value === id ? "selected" : ""}`}
          aria-pressed={value === id}
          onClick={() => onChange(id)}
        >
          <div className="choice-copy">
            <h3>{companionNames[id]}</h3>
            <p>
              {id === "max"
                ? "Спокойный настрой. Понятные шаги."
                : "Тёплая поддержка. Внимание к тебе."}
            </p>
          </div>
          <Image unoptimized width={768} height={1152} src={`/characters/${id}.webp`} alt="" />
          <span className="selection-check">{value === id ? <Check size={16} /> : null}</span>
        </button>
      ))}
    </div>
  );
}
