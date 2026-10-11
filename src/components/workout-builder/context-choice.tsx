import Image from "next/image";
import { ArrowRight, Check } from "lucide-react";
import type { CatalogContext, CatalogDirection } from "@/shared/catalog-taxonomy";
import { trainingChoices } from "./choices";
import styles from "./workout-builder.module.css";

export function ContextChoice({
  place,
  direction,
  busy,
  planning = false,
  onSelect,
  onContinue,
}: {
  place: CatalogContext | null;
  direction: CatalogDirection | null;
  busy: boolean;
  planning?: boolean;
  onSelect: (place: CatalogContext, direction: CatalogDirection) => void;
  onContinue: () => void;
}) {
  return (
    <section className={styles.scene} aria-labelledby="context-title">
      <p className={styles.eyebrow}>01 / Твои условия</p>
      <h1 id="context-title">
        Как сегодня <span>занимаемся?</span>
      </h1>
      <p className={styles.lead}>
        Зал, дом или любимый комплекс — начнём с того, что удобно сегодня.
      </p>
      <div className={styles.choiceGrid} role="group" aria-label="Вариант занятия">
        {trainingChoices.map((item) => (
          <button
            type="button"
            key={item.id}
            className={styles.artChoice}
            aria-pressed={place === item.place && direction === item.direction}
            disabled={busy}
            onClick={() => onSelect(item.place, item.direction)}
          >
            <Image src={item.image} alt="" fill sizes="(max-width: 600px) 45vw, 260px" />
            <span className={styles.artCaption}>
              <strong>{item.name}</strong>
              <small>{item.detail}</small>
            </span>
            {place === item.place && direction === item.direction ? (
              <span className={styles.choiceCheck}>
                <Check size={18} aria-hidden="true" />
              </span>
            ) : null}
          </button>
        ))}
      </div>
      <div className={styles.actionRow}>
        <p className={styles.muted}>
          {planning
            ? "Дальше выберем ритм, нагрузку и время. Состав покажем перед сохранением."
            : "Состав, порядок и нагрузку можно настроить на следующем шаге."}
        </p>
        <button
          type="button"
          className={styles.primary}
          disabled={!place || !direction || busy}
          onClick={onContinue}
        >
          {busy ? "Проверяем инвентарь…" : planning ? "Настроить подбор" : "Выбрать упражнения"}
          <ArrowRight size={20} aria-hidden="true" />
        </button>
      </div>
    </section>
  );
}
