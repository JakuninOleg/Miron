import { useState } from "react";
import type { CatalogContext, CatalogDirection } from "@/shared/catalog-taxonomy";
import type { BuilderInventory, BuilderResourceOption } from "@/shared/workout-builder";
import {
  cardSelected,
  relevantInventoryCards,
  toggleInventoryCard,
} from "@/shared/workout-inventory";
import { EquipmentArt } from "./equipment-art";
import styles from "./workout-builder.module.css";

export function InventoryChoice({
  options,
  initial,
  place,
  direction,
  placeName,
  busy,
  onSave,
}: {
  options: BuilderResourceOption[];
  initial: BuilderInventory["resources"];
  place: CatalogContext;
  direction: CatalogDirection;
  placeName: string;
  busy: boolean;
  onSave: (resources: BuilderInventory["resources"]) => void;
}) {
  // Keep equipment from other disciplines at this place when editing the visible selection.
  const [selected, setSelected] = useState(
    initial.filter((item) => item.code !== "floor" && item.code !== "clear_space"),
  );
  const visible = relevantInventoryCards(direction, place, options, selected);
  const active = visible.filter((card) => cardSelected(card, selected));
  const needsConfirmation = active.filter((card) =>
    card.codes.some((code) => options.find((option) => option.code === code)?.requiresConfirmation),
  );
  const missingConfirmation = needsConfirmation.some((card) =>
    card.codes.some(
      (code) =>
        options.find((option) => option.code === code)?.requiresConfirmation &&
        !selected.find((item) => item.code === code)?.isStable,
    ),
  );
  return (
    <section className={styles.scene} aria-labelledby="inventory-title">
      <p className={styles.eyebrow}>Что под рукой</p>
      <h1 id="inventory-title">
        Твой инвентарь <span>{placeName.toLowerCase()}</span>
      </h1>
      <p className={styles.lead}>
        {direction === "yoga"
          ? "Коврик, блоки, ремень — отметь, что есть для йоги. Можно и без них."
          : direction === "calisthenics"
            ? "Отметь доступные снаряды и утяжеления. Заниматься можно и со своим весом."
            : "Нажми на картинки того, что есть под рукой. Запомним выбор для следующих занятий."}
      </p>
      <div className={styles.equipmentGrid} role="group" aria-label="Доступный инвентарь">
        {visible.map((card) => {
          const checked = cardSelected(card, selected);
          return (
            <button
              type="button"
              key={card.id}
              className={styles.equipmentCard}
              aria-pressed={checked}
              disabled={busy}
              onClick={() =>
                setSelected((previous) => toggleInventoryCard(previous, card, options))
              }
            >
              <span className={styles.equipmentPicture}>
                <EquipmentArt art={card.art} paired={card.quantity > 1} />
              </span>
              <strong>{card.name}</strong>
              <span className={styles.equipmentSelected} aria-hidden="true">
                {checked ? "Выбрано" : "Есть под рукой"}
              </span>
            </button>
          );
        })}
      </div>
      {needsConfirmation.length ? (
        <div className={styles.equipmentConfirmations}>
          {needsConfirmation.map((card) => (
            <label className={styles.supportCheck} key={card.id}>
              <input
                type="checkbox"
                disabled={busy}
                checked={card.codes.every(
                  (code) =>
                    !options.find((option) => option.code === code)?.requiresConfirmation ||
                    selected.find((item) => item.code === code)?.isStable === true,
                )}
                onChange={(event) =>
                  setSelected((previous) =>
                    previous.map((item) =>
                      card.codes.includes(item.code) &&
                      options.find((option) => option.code === item.code)?.requiresConfirmation
                        ? { ...item, isStable: event.target.checked }
                        : item,
                    ),
                  )
                }
              />
              <span>{card.name}: опора и крепление устойчивы.</span>
            </label>
          ))}
        </div>
      ) : null}
      <div className={styles.actionRow}>
        <p className={styles.muted}>
          {missingConfirmation
            ? "Подтверди устойчивость выбранных опор или убери их."
            : active.length
              ? "Выбор сохранится. Изменить его можно в любой момент."
              : "Ничего не нужно? Продолжай без дополнительного инвентаря."}
        </p>
        <button
          type="button"
          className={styles.primary}
          disabled={busy || missingConfirmation}
          onClick={() => onSave(selected)}
        >
          {busy ? "Сохраняем…" : active.length ? "Инвентарь выбран" : "Без инвентаря"}
        </button>
      </div>
    </section>
  );
}
