import { ArrowDown, ArrowUp, Clock3, Save, Trash2 } from "lucide-react";
import {
  builderDurationLabel,
  estimateBuilderWorkout,
  builderPairError,
  type BuilderSelectedStep,
} from "@/shared/workout-builder";
import styles from "./workout-builder.module.css";
import { dropSetPlanError, supportsDropSet } from "@/shared/training-methods";

export function SelectedWorkout({
  name,
  steps,
  busy,
  onName,
  onChange,
  onMove,
  onRemove,
  onSave,
  onUnpair,
  allowDropSets,
  onDropSet,
}: {
  name: string;
  steps: BuilderSelectedStep[];
  busy: boolean;
  onName: (value: string) => void;
  onChange: (index: number, field: "sets" | "target" | "restSeconds", value: number) => void;
  onMove: (index: number, delta: -1 | 1) => void;
  onRemove: (index: number) => void;
  onSave: () => void;
  onUnpair: (pairKey: string) => void;
  allowDropSets: boolean;
  onDropSet: (index: number, enabled: boolean) => void;
}) {
  const pairError = builderPairError(steps);
  const valid =
    steps.length > 0 &&
    !pairError &&
    !steps.some((step) => dropSetPlanError(step)) &&
    steps.every(
      (step) =>
        Number.isInteger(step.sets) &&
        step.sets >= 1 &&
        step.sets <= 10 &&
        Number.isInteger(step.target) &&
        step.target >= 1 &&
        step.target <= (step.exercise.metric === "time" ? 600 : 100) &&
        Number.isInteger(step.restSeconds) &&
        step.restSeconds >= 0 &&
        step.restSeconds <= 600,
    );
  return (
    <aside className={styles.selection} aria-label="Состав тренировки">
      <div className={styles.selectionHeader}>
        <h2>Твоя сборка</h2>
        <span>{steps.length} / 40</span>
      </div>
      <label className={styles.nameLabel} htmlFor="workout-name">
        Название тренировки
      </label>
      <input
        className={styles.nameInput}
        id="workout-name"
        disabled={busy}
        value={name}
        maxLength={80}
        placeholder="Например, Верх тела дома"
        onChange={(event) => onName(event.target.value)}
      />
      {!steps.length ? (
        <div className={styles.selectionEmpty}>
          <span>+</span>
          <p>
            Добавь первое упражнение из каталога. Подходы, повторы и отдых можно настроить здесь.
          </p>
        </div>
      ) : null}
      <ol className={styles.selectedList}>
        {steps.map((step, index) => (
          <li key={step.revisionId} className={styles.selectedStep}>
            <div className={styles.stepHeading}>
              <span className={styles.stepNumber}>{String(index + 1).padStart(2, "0")}</span>
              <h3>{step.exercise.name}</h3>
              <button
                type="button"
                className={styles.iconButton}
                aria-label={`Убрать ${step.exercise.name}`}
                onClick={() => onRemove(index)}
                disabled={busy}
              >
                <Trash2 size={17} aria-hidden="true" />
              </button>
            </div>
            {step.pairKey ? (
              <div className={styles.stepFooter}>
                <span>Суперсет А–Б · переход {step.transitionSeconds ?? 30} сек</span>
                <button
                  type="button"
                  className={styles.secondary}
                  disabled={busy}
                  onClick={() => onUnpair(step.pairKey!)}
                >
                  Разъединить
                </button>
              </div>
            ) : null}
            <div className={styles.stepInputs}>
              <label>
                {step.pairKey ? "Круги" : "Подходы"}
                <input
                  type="number"
                  min={1}
                  max={10}
                  value={step.sets}
                  onChange={(event) => onChange(index, "sets", Number(event.target.value))}
                  disabled={busy}
                />
              </label>
              <label>
                {step.exercise.metric === "time" ? "Секунды" : "Повторы"}
                {step.exercise.timing.perSide ? " / сторона" : ""}
                <input
                  type="number"
                  min={1}
                  max={step.exercise.metric === "time" ? 600 : 100}
                  value={step.target}
                  onChange={(event) => onChange(index, "target", Number(event.target.value))}
                  disabled={busy}
                />
              </label>
              <label>
                {step.pairKey ? "Между кругами, сек" : "Отдых, сек"}
                <input
                  type="number"
                  min={0}
                  max={600}
                  step={15}
                  value={step.restSeconds}
                  onChange={(event) => onChange(index, "restSeconds", Number(event.target.value))}
                  disabled={busy}
                />
              </label>
            </div>
            {step.dropSet || (allowDropSets && !step.pairKey && supportsDropSet(step.exercise)) ? (
              <label className={styles.methodOption}>
                <input
                  type="checkbox"
                  checked={Boolean(step.dropSet)}
                  disabled={busy}
                  onChange={(event) => onDropSet(index, event.target.checked)}
                />
                <span>
                  <strong>Дропсет в последнем подходе</strong>
                  <small>
                    Одно снижение веса, ориентир 8 повторов. Выполнять до отказа не нужно.
                  </small>
                </span>
              </label>
            ) : null}
            <div className={styles.stepFooter}>
              <span>{builderDurationLabel(estimateBuilderWorkout([step]))}</span>
              <div>
                <button
                  type="button"
                  className={styles.iconButton}
                  aria-label={`Поднять ${step.exercise.name}`}
                  disabled={index === 0 || busy || !!step.pairKey || !!steps[index - 1]?.pairKey}
                  onClick={() => onMove(index, -1)}
                >
                  <ArrowUp size={16} aria-hidden="true" />
                </button>
                <button
                  type="button"
                  className={styles.iconButton}
                  aria-label={`Опустить ${step.exercise.name}`}
                  disabled={
                    index === steps.length - 1 ||
                    busy ||
                    !!step.pairKey ||
                    !!steps[index + 1]?.pairKey
                  }
                  onClick={() => onMove(index, 1)}
                >
                  <ArrowDown size={16} aria-hidden="true" />
                </button>
              </div>
            </div>
          </li>
        ))}
      </ol>
      <div className={styles.total}>
        <Clock3 size={21} aria-hidden="true" />
        <div>
          <strong>
            {valid ? builderDurationLabel(estimateBuilderWorkout(steps)) : "Добавь упражнения"}
          </strong>
          <p>С отдыхом и переходами. Ожидание тренажёров не учитывается.</p>
        </div>
      </div>
      {!valid && steps.length ? (
        <p className={styles.muted}>
          {pairError ??
            "Проверь параметры: 1–10 подходов, 1–100 повторов или 1–600 секунд, отдых 0–600 секунд."}
        </p>
      ) : null}
      <p className={styles.disclosure}>
        Собственная тренировка из редакционного каталога. Профессиональная проверка не проводилась.
      </p>
      <button
        type="button"
        className={styles.primary}
        disabled={!valid || !name.trim() || busy}
        onClick={onSave}
      >
        <Save size={18} aria-hidden="true" />
        {busy ? "Сохраняем…" : "Сохранить тренировку"}
      </button>
    </aside>
  );
}
