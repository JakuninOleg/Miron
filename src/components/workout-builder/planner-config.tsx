import { ArrowRight } from "lucide-react";
import type { PlannerConfig, PlannerIntent, PlannerSplit } from "@/shared/workout-planner";
import styles from "./workout-builder.module.css";

export const plannerSplitNames: Record<PlannerSplit, string> = {
  fullbody: "Всё тело",
  upper_lower: "Верх / низ",
  push_pull_legs: "Жим / тяга / ноги",
};

export function plannerFrequencyLabel(days: number): string {
  return `${days} ${days === 1 ? "занятие" : "занятия"} в неделю`;
}

const intentions: { value: PlannerIntent; name: string; detail: string }[] = [
  { value: "start", name: "Начать спокойно", detail: "Меньше объёма, знакомые движения" },
  { value: "maintain", name: "Поддерживать форму", detail: "Регулярная посильная нагрузка" },
  { value: "develop", name: "Развиваться", detail: "Больше объёма в пределах твоего уровня" },
];

export function PlannerConfigForm({
  config,
  busy,
  hasProgram,
  onChange,
  onPreview,
}: {
  config: PlannerConfig;
  busy: boolean;
  hasProgram: boolean;
  onChange: (config: PlannerConfig) => void;
  onPreview: () => void;
}) {
  const supportsSplit = config.direction === "strength" || config.direction === "calisthenics";
  const frequencies =
    config.split === "fullbody" ? [1, 2, 3, 4] : config.split === "upper_lower" ? [2, 3, 4] : [3];
  function changeSplit(split: PlannerSplit) {
    const daysPerWeek =
      split === "push_pull_legs"
        ? 3
        : split === "upper_lower"
          ? Math.max(2, config.daysPerWeek)
          : config.daysPerWeek;
    onChange({
      ...config,
      split,
      daysPerWeek,
      preferredTemplateId: undefined,
      replacements: undefined,
    });
  }
  return (
    <form
      className={styles.plannerForm}
      onSubmit={(event) => {
        event.preventDefault();
        onPreview();
      }}
    >
      <fieldset className={styles.plannerFieldset} disabled={busy}>
        <legend>Что подберём?</legend>
        <div className={styles.plannerChoices}>
          {(
            [
              { mode: "program", name: "Моя программа", detail: "Повторяемый состав на неделю" },
              {
                mode: "single",
                name: "Просто потренироваться",
                detail: "Одно занятие отдельно от программы",
              },
            ] as const
          ).map((item) => (
            <label
              key={item.mode}
              className={styles.plannerChoice}
              data-selected={config.mode === item.mode}
            >
              <input
                type="radio"
                name="planner-mode"
                checked={config.mode === item.mode}
                onChange={() => onChange({ ...config, mode: item.mode, replacements: undefined })}
              />
              <span>
                <strong>{item.name}</strong>
                <small>{item.detail}</small>
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      {config.mode === "program" ? (
        <fieldset className={styles.plannerFieldset} disabled={busy}>
          <legend>Ритм недели</legend>
          <div className={styles.plannerFields}>
            <label>
              Распределение нагрузки
              <select
                className={styles.select}
                aria-label="Распределение нагрузки"
                value={config.split}
                onChange={(event) => changeSplit(event.target.value as PlannerSplit)}
              >
                {Object.entries(plannerSplitNames)
                  .filter(([value]) => supportsSplit || value === "fullbody")
                  .map(([value, name]) => (
                    <option key={value} value={value}>
                      {name}
                    </option>
                  ))}
              </select>
            </label>
            <label>
              Занятий в неделю
              <select
                className={styles.select}
                aria-label="Занятий в неделю"
                value={config.daysPerWeek}
                onChange={(event) =>
                  onChange({
                    ...config,
                    daysPerWeek: Number(event.target.value),
                    replacements: undefined,
                  })
                }
              >
                {frequencies.map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <p className={styles.plannerHint}>
            Дни можно проходить по порядку в удобное время. Подбор не назначает даты в календаре.
          </p>
        </fieldset>
      ) : null}
      <fieldset className={styles.plannerFieldset} disabled={busy}>
        <legend>Какую нагрузку хочешь?</legend>
        <div className={styles.plannerChoices}>
          {intentions.map((item) => (
            <label
              key={item.value}
              className={styles.plannerChoice}
              data-selected={config.intent === item.value}
            >
              <input
                type="radio"
                name="planner-intent"
                checked={config.intent === item.value}
                onChange={() => onChange({ ...config, intent: item.value })}
              />
              <span>
                <strong>{item.name}</strong>
                <small>{item.detail}</small>
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      <fieldset className={styles.plannerFieldset} disabled={busy}>
        <legend>Время и порядок</legend>
        <div className={styles.plannerFields}>
          <label>
            Время на занятие
            <select
              className={styles.select}
              aria-label="Время на занятие"
              value={config.durationMinutes}
              onChange={(event) =>
                onChange({ ...config, durationMinutes: Number(event.target.value) })
              }
            >
              {[...new Set([15, 20, 30, 40, 45, 60, 75, 90, 120, config.durationMinutes])]
                .sort((a, b) => a - b)
                .map((value) => (
                  <option value={value} key={value}>
                    {value} минут
                  </option>
                ))}
            </select>
          </label>
          <label>
            Порядок подходов
            <select
              className={styles.select}
              aria-label="Порядок подходов"
              value={config.execution}
              onChange={(event) =>
                onChange({ ...config, execution: event.target.value as PlannerConfig["execution"] })
              }
            >
              <option value="straight">Обычные подходы</option>
              {supportsSplit ? <option value="pairs">Суперсеты А–Б</option> : null}
            </select>
          </label>
          <label>
            Выбор упражнений
            <select
              className={styles.select}
              aria-label="Выбор упражнений"
              value={config.variety}
              onChange={(event) =>
                onChange({ ...config, variety: event.target.value as PlannerConfig["variety"] })
              }
            >
              <option value="familiar">Знакомый состав</option>
              <option value="different">Хочется разнообразия</option>
            </select>
          </label>
        </div>
        {config.direction === "strength" ? (
          <label className={styles.methodOption}>
            <input
              type="checkbox"
              checked={config.dropSets ?? false}
              onChange={(event) => onChange({ ...config, dropSets: event.target.checked })}
            />
            <span>
              <strong>Добавить дропсет, если подходит</strong>
              <small>
                Одно снижение веса в последнем подходе. Для регулярных занятий; при старте или после
                паузы останутся обычные подходы.
              </small>
            </span>
          </label>
        ) : null}
        <p className={styles.plannerHint}>
          {supportsSplit
            ? "Суперсеты чередуют два совместимых упражнения с отдыхом между раундами. "
            : "Для этого направления упражнения идут последовательно. "}
          Примерное время зависит от фактического состава и может отличаться от пожелания.
        </p>
      </fieldset>
      <div className={styles.actionRow}>
        <p className={styles.muted}>
          {config.mode === "single" && hasProgram
            ? "Твоя недельная программа останется отдельно."
            : "Сначала покажем состав и изменения. Сохранение — после твоего подтверждения."}
        </p>
        <button type="submit" className={styles.primary} disabled={busy}>
          {busy ? "Подбираем состав…" : "Показать подбор"}
          <ArrowRight size={20} aria-hidden="true" />
        </button>
      </div>
    </form>
  );
}
