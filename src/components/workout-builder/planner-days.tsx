import { ArrowRight, Clock3, Copy, RefreshCw } from "lucide-react";
import { builderDurationLabel } from "@/shared/workout-builder";
import type { PlannerDay, PlannerStep } from "@/shared/workout-planner";
import styles from "./workout-builder.module.css";

const phaseNames: Record<PlannerStep["phase"], string> = {
  warmup: "Разминка",
  main: "Основная часть",
  cooldown: "Завершение",
};

export function PlannerDays({
  days,
  busy,
  confirmed,
  onCopy,
  onStart,
  onReplace,
  onExclude,
}: {
  days: PlannerDay[];
  busy: boolean;
  confirmed: boolean;
  onCopy: (day: PlannerDay) => void;
  onStart: (day: PlannerDay) => void;
  onReplace?: (day: PlannerDay, step: PlannerStep) => void;
  onExclude: (step: PlannerStep) => void;
}) {
  return (
    <div className={styles.plannerDays}>
      {days.map((day) => (
        <article
          key={day.key}
          className={styles.plannerDay}
          aria-labelledby={`planner-day-${day.key}`}
        >
          <div className={styles.plannerDayHeading}>
            <h3 id={`planner-day-${day.key}`}>{day.title}</h3>
            <span>
              <Clock3 size={17} aria-hidden="true" />
              {builderDurationLabel(day.estimate)}
            </span>
          </div>
          {day.warnings.length ? (
            <ul className={styles.plannerWarnings}>
              {day.warnings.map((warning, index) => (
                <li key={index}>{warning}</li>
              ))}
            </ul>
          ) : null}
          <ol className={styles.plannerSteps}>
            {day.steps.map((step, index) => (
              <li key={step.slotKey}>
                {index === 0 || day.steps[index - 1].phase !== step.phase ? (
                  <p className={styles.plannerPhase}>{phaseNames[step.phase]}</p>
                ) : null}
                <div className={styles.plannerStepTitle}>
                  <span className={styles.stepNumber}>{String(index + 1).padStart(2, "0")}</span>
                  <strong>{step.exercise.name}</strong>
                  <span className={styles.draftBadge}>Черновик</span>
                </div>
                <p className={styles.plannerHint}>
                  {step.sets} × {step.target} {step.exercise.metric === "time" ? "сек" : "повт."}
                  {step.exercise.timing.perSide ? " на каждую сторону" : ""} · отдых{" "}
                  {step.restSeconds} сек
                  {step.pairKey
                    ? ` · суперсет ${index > 0 && day.steps[index - 1].pairKey === step.pairKey ? "Б" : "А"}, переход ${step.transitionSeconds ?? 15} сек`
                    : ""}
                </p>
                {step.dropSet ? (
                  <p className={styles.plannerHint}>
                    Дропсет: в последнем подходе одно снижение веса, ориентир{" "}
                    {step.dropSet.targetReps} повт. Можно пропустить; отказ не требуется.
                  </p>
                ) : null}
                {step.changeNote ? <p className={styles.plannerHint}>{step.changeNote}</p> : null}
                {step.coaching ? (
                  <details className={styles.plannerHint}>
                    <summary>Усилие и следующий шаг</summary>
                    <p>{step.coaching.effortHint}</p>
                    <p>{step.coaching.explanation}</p>
                  </details>
                ) : null}
                <div className={styles.plannerStepActions}>
                  {onReplace ? (
                    <button
                      type="button"
                      className={styles.secondary}
                      disabled={busy}
                      onClick={() => onReplace(day, step)}
                    >
                      <RefreshCw size={15} aria-hidden="true" />
                      Заменить<span className={styles.srOnly}> {step.exercise.name}</span>
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className={styles.plannerTextButton}
                    disabled={busy}
                    onClick={() => onExclude(step)}
                  >
                    Больше не предлагать<span className={styles.srOnly}> {step.exercise.name}</span>
                  </button>
                </div>
              </li>
            ))}
          </ol>
          <div className={styles.plannerDayActions}>
            <button
              type="button"
              className={styles.secondary}
              disabled={busy}
              onClick={() => onCopy(day)}
            >
              <Copy size={17} aria-hidden="true" />
              Открыть в конструкторе<span className={styles.srOnly}> — {day.title}</span>
            </button>
            {confirmed ? (
              <button
                type="button"
                className={styles.primary}
                disabled={busy}
                onClick={() => onStart(day)}
              >
                Начать занятие<span className={styles.srOnly}> — {day.title}</span>
                <ArrowRight size={18} aria-hidden="true" />
              </button>
            ) : null}
          </div>
          <p className={styles.plannerHint}>
            Конструктор создаст отдельную именованную копию. Правки копии не меняют программу.
          </p>
        </article>
      ))}
    </div>
  );
}
