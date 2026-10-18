import type { PlannerHistory, PlannerStep } from "../../shared/workout-planner";
import type { StrengthStepCoaching } from "../../shared/training-methodology";
import { isStrengthDirection } from "../../shared/training-methodology";

const DAY_MS = 86_400_000;
/** Unknown legacy sessions never provide positive evidence for increasing load. */
export function strengthHistory(history: PlannerHistory[]): PlannerHistory[] {
  return history.filter((entry) =>
    entry.direction !== undefined
      ? isStrengthDirection(entry.direction)
      : entry.sets.some(
          (set) =>
            (set.phase === undefined || set.phase === "main") &&
            (set.variantId.startsWith("strength.") || set.variantId.startsWith("calisthenics.")),
        ),
  );
}
function performed(entry: PlannerHistory): boolean {
  return entry.sets.some(
    (set) =>
      (set.phase === undefined || set.phase === "main") &&
      ((set.reps ?? 0) > 0 || (set.durationSeconds ?? 0) > 0),
  );
}
function recent(history: PlannerHistory[], now: Date, days: number): PlannerHistory[] {
  return strengthHistory(history)
    .filter((entry) => {
      const age = now.getTime() - Date.parse(entry.endedAt);
      return Number.isFinite(age) && age >= 0 && age < days * DAY_MS && performed(entry);
    })
    .sort((a, b) => Date.parse(b.endedAt) - Date.parse(a.endedAt) || a.id.localeCompare(b.id));
}
/** Seven days and one set are conservative editorial choices, not clinical cutoffs. */
export function recentDifficultStrength(
  history: PlannerHistory[],
  now: Date,
): PlannerHistory | undefined {
  // An unrated or incomplete easy session must not erase a recent difficult assessment.
  const latest = recent(history, now, 7).find(
    (entry) =>
      entry.loadFeedback === "hard" ||
      entry.loadFeedback === "too_hard" ||
      (entry.status === "completed" &&
        (entry.loadFeedback === "easy" || entry.loadFeedback === "just_right")),
  );
  return latest?.loadFeedback === "hard" || latest?.loadFeedback === "too_hard"
    ? latest
    : undefined;
}

export function strengthStepCoaching(
  step: PlannerStep,
  history: PlannerHistory[],
  now: Date,
): StrengthStepCoaching | undefined {
  if (step.phase !== "main" || step.exercise.focusMode !== "loading") return undefined;
  const timed = step.exercise.metric === "time";
  const base = {
    kind: "strength" as const,
    effortHint: timed
      ? "Удерживай положение с управляемой техникой; при её потере закончи подход."
      : "Оставь силы примерно на 2–3 повтора с управляемой техникой. Оценка запаса приблизительная.",
    ...(!timed ? { repetitionsInReserve: { min: 2 as const, max: 3 as const } } : {}),
    sourceIds: ["acsm-2026"],
  };
  const difficult = recentDifficultStrength(history, now);
  if (difficult)
    return {
      ...base,
      progression: "ease",
      basedOnWorkoutIds: [difficult.id],
      explanation:
        "Недавняя силовая нагрузка показалась тяжёлой. Объём предложения уменьшен там, где это возможно без удаления движений; вес не повышаем. Можно выбрать более доступный вариант.",
    };
  if (step.dropSet)
    return {
      ...base,
      progression: "repeat",
      basedOnWorkoutIds: [],
      sourceIds: ["acsm-2026", "drop-sets-2026"],
      explanation:
        "В последнем подходе предусмотрено одно необязательное снижение веса. Сохраняй управляемую технику и запас сил; отказ не требуется. С обычными подходами такой результат для повышения веса не сравниваем.",
    };
  const sessions = recent(history, now, 30)
    .filter((entry) =>
      entry.sets.some(
        (set) =>
          set.variantId === step.exercise.variantId &&
          (set.phase === undefined || set.phase === "main"),
      ),
    )
    .slice(0, 2);
  if (!sessions.length)
    return {
      ...base,
      progression: "learn",
      basedOnWorkoutIds: [],
      explanation:
        "Для этого движения пока нет недавнего результата. Начни с доступной нагрузки и запиши подходы; прежний вес другого упражнения не переносим.",
    };
  const rows = (entry: PlannerHistory) =>
    entry.sets.filter(
      (set) =>
        set.variantId === step.exercise.variantId &&
        (set.phase === undefined || set.phase === "main"),
    );
  const complete = (entry: PlannerHistory) => {
    const sets = rows(entry);
    return (
      entry.status === "completed" &&
      isStrengthDirection(entry.direction ?? "mobility") &&
      (entry.loadFeedback === "easy" || entry.loadFeedback === "just_right") &&
      sets.length >= step.sets &&
      sets.every(
        (set) =>
          set.revisionId === step.revisionId &&
          !set.drop &&
          !set.hadDropSetPlan &&
          Number.isInteger(set.plannedSets) &&
          set.plannedSets === sets.length &&
          Number.isFinite(set.target) &&
          (set.target ?? 0) > 0 &&
          (set.reps ?? 0) >= Math.max(step.target, set.target ?? 0) &&
          Number.isFinite(set.weightKg) &&
          set.weightKg >= 0 &&
          (!(
            step.exercise.resistanceMode === "external_load" ||
            step.exercise.resistanceMode === "machine_load"
          ) ||
            set.weightKg > 0),
      )
    );
  };
  const sameLoad =
    sessions.length === 2 &&
    rows(sessions[0]).length === rows(sessions[1]).length &&
    rows(sessions[0]).every((set, index) => set.weightKg === rows(sessions[1])[index].weightKg);
  if (
    !timed &&
    sessions.length === 2 &&
    sessions[0].id !== sessions[1].id &&
    sessions.every(complete) &&
    sameLoad
  )
    return {
      ...base,
      progression: "discuss_progression",
      basedOnWorkoutIds: sessions.map((entry) => entry.id),
      explanation:
        "Два последних завершённых занятия с этим вариантом выполнены с одинаковым весом, нужными подходами и повторами; твоя оценка — легко или в самый раз. Можно обсудить следующий шаг: сначала повторы, затем минимальную доступную прибавку веса. Назначение автоматически не меняется.",
    };
  return {
    ...base,
    progression: "repeat",
    basedOnWorkoutIds: sessions.map((entry) => entry.id),
    explanation:
      "Пока сохраняем доступную нагрузку. Для предложения следующего шага нужны два недавних завершённых занятия с тем же вариантом, выполненным назначением, одинаковым весом и твоей оценкой нагрузки.",
  };
}
