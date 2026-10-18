import {
  PLANNER_ALL_GROUPS,
  PLANNER_LIBRARY_DISCLOSURE,
  PLANNER_STRENGTH_TEMPLATES,
  PLANNER_SUPPORT_GROUPS,
  PLANNER_SUPPORT_TEMPLATES,
  type PlannerExerciseGroup,
  type PlannerLibrarySlot,
  type PlannerLibraryTemplate,
} from "../../../data/workouts/planner-library";
import { MUSCLE_GROUPS, type MuscleGroup } from "../../shared/catalog-taxonomy";
import type { Experience } from "../../shared/contracts";
import { estimateBuilderWorkout, type BuilderExercise } from "../../shared/workout-builder";
import type {
  PlannerConfig,
  PlannerDay,
  PlannerDraft,
  PlannerHistory,
  PlannerHistorySummary,
  PlannerPreferences,
  PlannerProgram,
  PlannerReplacementOption,
  PlannerStep,
} from "../../shared/workout-planner";
import { CATALOG_SKILL_POLICY } from "../db/catalog-skill-policy";
import { supportsDropSet } from "../../shared/training-methods";
import { DomainError } from "./errors";
import { isStrengthDirection, trainingMethodology } from "../../shared/training-methodology";
import {
  recentDifficultStrength,
  strengthHistory,
  strengthStepCoaching,
} from "./strength-coaching";

export interface PlannerEngineInput {
  config: PlannerConfig;
  /** Caller authorizes the owner and supplies only admitted, inventory-compatible exact revisions. */
  catalog: BuilderExercise[];
  preferences: PlannerPreferences;
  history: PlannerHistory[];
  experience: Experience;
  previous: PlannerProgram | null;
  now: Date;
}

const DAY_MS = 86_400_000;
const RETURN_PAUSE_DAYS = 21;
const RECENT_DAYS = 3;
const ALL_TEMPLATES = [...PLANNER_STRENGTH_TEMPLATES, ...PLANNER_SUPPORT_TEMPLATES];
type RecordedHistorySet = PlannerHistory["sets"][number];

function confirmed(set: RecordedHistorySet): boolean {
  // Legacy history lacks phase. Its supplied positive sets are actual recorded work, never targets.
  if ("phase" in set && set.phase !== undefined && set.phase !== "main") return false;
  return (
    (set.reps !== null && Number.isFinite(set.reps) && set.reps > 0) ||
    (set.durationSeconds !== null &&
      Number.isFinite(set.durationSeconds) &&
      set.durationSeconds > 0)
  );
}

function recentHistory(history: PlannerHistory[], now: Date, days = RECENT_DAYS): PlannerHistory[] {
  return history.filter((entry) => {
    const timestamp = Date.parse(entry.endedAt);
    return (
      Number.isFinite(timestamp) &&
      timestamp <= now.getTime() &&
      now.getTime() - timestamp < days * DAY_MS
    );
  });
}

export function summarizePlannerHistory(
  history: PlannerHistory[],
  now: Date,
): PlannerHistorySummary {
  const rows = history.filter(
    (entry) =>
      Number.isFinite(Date.parse(entry.endedAt)) && Date.parse(entry.endedAt) <= now.getTime(),
  );
  const performed = rows.filter((entry) => entry.sets.some(confirmed));
  const last =
    performed.map((entry) => entry.endedAt).sort((a, b) => Date.parse(b) - Date.parse(a))[0] ??
    null;
  const muscles = new Set(
    recentHistory(performed, now).flatMap((entry) =>
      entry.sets.filter(confirmed).flatMap((set) => set.primaryMuscles),
    ),
  );
  return {
    confirmedSets: rows.reduce((total, entry) => total + entry.sets.filter(confirmed).length, 0),
    lastWorkoutAt: last,
    recentPrimaryMuscles: (Object.keys(MUSCLE_GROUPS) as MuscleGroup[]).filter((muscle) =>
      muscles.has(muscle),
    ),
    returningAfterPause:
      last !== null && now.getTime() - Date.parse(last) >= RETURN_PAUSE_DAYS * DAY_MS,
  };
}

function isConservative(input: PlannerEngineInput): boolean {
  return (
    input.experience !== "regular" ||
    input.config.intent === "start" ||
    summarizePlannerHistory(directionHistory(input), input.now).returningAfterPause
  );
}

function directionHistory(input: PlannerEngineInput): PlannerHistory[] {
  if (isStrengthDirection(input.config.direction)) return strengthHistory(input.history);
  return input.history.filter((entry) =>
    entry.direction !== undefined
      ? entry.direction === input.config.direction
      : entry.sets.some(
          (set) =>
            (set.phase === undefined || set.phase === "main") &&
            set.variantId.startsWith(`${input.config.direction}.`),
        ),
  );
}

function excluded(input: PlannerEngineInput): Set<string> {
  return new Set([
    ...input.preferences.excludedVariantIds,
    ...(input.config.excludeVariantIds ?? []),
  ]);
}

function matchesGroup(exercise: BuilderExercise, group: PlannerExerciseGroup): boolean {
  const primary = new Set(exercise.primaryMuscles.map((row) => row.code));
  return (
    group.variants.includes(exercise.variantId) &&
    exercise.movementPattern === group.pattern &&
    exercise.focusMode === group.focus &&
    exercise.metric === group.metric &&
    primary.size === group.primary.length &&
    group.primary.every((muscle) => primary.has(muscle))
  );
}

function eligibleCatalog(input: PlannerEngineInput): BuilderExercise[] {
  const blocked = excluded(input);
  const conservative = isConservative(input);
  const seen = new Set<string>();
  return input.catalog.filter((exercise) => {
    if (seen.has(exercise.variantId))
      throw new DomainError(
        "PLANNER_CATALOG_AMBIGUOUS",
        409,
        "Каталог содержит несколько текущих версий упражнения. Обнови каталог.",
      );
    seen.add(exercise.variantId);
    const policy = CATALOG_SKILL_POLICY[exercise.variantId];
    const calisthenics =
      input.config.direction !== "calisthenics" ||
      exercise.focusMode !== "loading" ||
      exercise.resistanceMode === "bodyweight" ||
      exercise.resistanceMode === "assisted_bodyweight";
    return (
      calisthenics &&
      !blocked.has(exercise.variantId) &&
      policy?.kind !== "movement" &&
      !!policy &&
      exercise.difficulty !== "advanced" &&
      (!conservative || exercise.difficulty === "beginner") &&
      PLANNER_ALL_GROUPS.some((group) => matchesGroup(exercise, group))
    );
  });
}

function candidates(group: PlannerExerciseGroup, catalog: BuilderExercise[]): BuilderExercise[] {
  return catalog.filter((exercise) => matchesGroup(exercise, group));
}

function previousStep(
  input: PlannerEngineInput,
  dayKey: string,
  slotKey: string,
): PlannerStep | undefined {
  const previous = input.previous?.draft;
  if (
    !previous ||
    previous.config.mode !== input.config.mode ||
    previous.config.direction !== input.config.direction ||
    previous.config.place !== input.config.place
  )
    return undefined;
  return previous.days
    .find((day) => day.key === dayKey)
    ?.steps.find((step) => step.slotKey === slotKey);
}

function choiceScore(
  input: PlannerEngineInput,
  exercise: BuilderExercise,
  group: PlannerExerciseGroup,
  dayIndex: number,
  anchor: boolean,
  old: PlannerStep | undefined,
): number {
  let score = 0;
  const favorite = input.preferences.favoriteVariantIds.includes(exercise.variantId);
  if (favorite) score += 20;
  if (
    old?.exercise.variantId === exercise.variantId &&
    (anchor || input.config.variety === "familiar")
  )
    score += 100;
  if (
    old?.exercise.variantId === exercise.variantId &&
    !anchor &&
    input.config.variety === "different"
  )
    score -= 40;
  if (input.config.variety === "different" && !anchor) {
    const recentCount = recentHistory(input.history, input.now, 14)
      .flatMap((entry) => entry.sets.filter(confirmed))
      .filter((set) => set.variantId === exercise.variantId).length;
    score -= recentCount * 5;
  }
  // A fixed offset creates A/B variety once; opening the screen never reshuffles it.
  const position = group.variants.indexOf(exercise.variantId);
  score -=
    (position - (dayIndex % group.variants.length) + group.variants.length) % group.variants.length;
  if (
    isConservative(input) &&
    group.key === "push" &&
    exercise.variantId === "strength.push_up.wall"
  )
    score += 10;
  return score;
}

function chooseExercise(
  input: PlannerEngineInput,
  slot: PlannerLibrarySlot,
  catalog: BuilderExercise[],
  dayKey: string,
  dayIndex: number,
): BuilderExercise | null {
  const options = candidates(slot.group, catalog);
  const replacement = input.config.replacements?.find(
    (row) => row.dayKey === dayKey && row.slotKey === slot.key,
  );
  if (replacement) {
    const chosen = options.find((exercise) => exercise.variantId === replacement.variantId);
    if (!chosen)
      throw new DomainError(
        "PLANNER_REPLACEMENT_UNAVAILABLE",
        409,
        "Замена не подходит движению, акценту, уровню или текущему инвентарю. Выбери другую замену или пересобери занятие.",
      );
    return chosen;
  }
  const old = previousStep(input, dayKey, slot.key);
  const score = (exercise: BuilderExercise) =>
    choiceScore(input, exercise, slot.group, dayIndex, slot.anchor, old) +
    (exercise.variantId === slot.preferredVariantId &&
    !(isConservative(input) && exercise.resistanceMode === "bodyweight")
      ? 8
      : 0);
  return (
    [...options].sort((a, b) => score(b) - score(a) || a.variantId.localeCompare(b.variantId))[0] ??
    null
  );
}

function templateFits(template: PlannerLibraryTemplate, catalog: BuilderExercise[]): boolean {
  return template.slots.every((slot) => candidates(slot.group, catalog).length > 0);
}

function compatibleTemplates(
  input: PlannerEngineInput,
  catalog: BuilderExercise[],
  kind?: PlannerLibraryTemplate["kind"],
): PlannerLibraryTemplate[] {
  const bases = ALL_TEMPLATES.filter(
    (template) =>
      template.direction === input.config.direction &&
      template.contexts.includes(input.config.place) &&
      (!kind || template.kind === kind),
  );
  const complete = bases.filter((template) => templateFits(template, catalog));
  return [...complete, ...partialPullCoverageTemplates(input, catalog, bases, complete)];
}

function partialPullCoverageTemplates(
  input: PlannerEngineInput,
  catalog: BuilderExercise[],
  bases: PlannerLibraryTemplate[],
  complete: PlannerLibraryTemplate[],
): PlannerLibraryTemplate[] {
  if (
    !["home", "outdoor"].includes(input.config.place) ||
    input.config.split !== "fullbody" ||
    !["strength", "calisthenics"].includes(input.config.direction) ||
    complete.some((template) => template.kind === "fullbody")
  )
    return [];
  const isPull = (group: PlannerExerciseGroup) =>
    group.pattern === "horizontal_pull" || group.pattern === "vertical_pull";
  // Missing pulling resources/eligible revisions permit this fallback. A request to exclude
  // every otherwise available pull does not silently change the requested coverage.
  const beforeExclusions = eligibleCatalog({
    ...input,
    preferences: { ...input.preferences, excludedVariantIds: [] },
    config: { ...input.config, excludeVariantIds: [] },
  });
  if (
    PLANNER_ALL_GROUPS.some((group) => isPull(group) && candidates(group, beforeExclusions).length)
  )
    return [];
  return bases.flatMap((template) => {
    if (template.kind !== "fullbody") return [];
    const missing = template.slots.filter((slot) => !candidates(slot.group, catalog).length);
    if (!missing.length || !missing.every((slot) => isPull(slot.group))) return [];
    return [
      {
        ...template,
        id: `${template.id}.without-pull`,
        title: "Ноги, жим и корпус",
        slots: template.slots.filter((slot) => !isPull(slot.group)),
        coverageWarning:
          "Нет тяги и основной работы для спины: с текущим инвентарём и уровнем подходящего варианта нет. Это неполный охват тела. Для добавления тяги укажи гантель и подходящую устойчивую опору либо доступный вариант с резинкой, тренажёром или перекладиной своего уровня. Остальные подходы не увеличены для компенсации.",
      },
    ];
  });
}

function templateScore(
  input: PlannerEngineInput,
  template: PlannerLibraryTemplate,
  catalog: BuilderExercise[],
  dayKey: string,
): number {
  const previous = input.previous?.draft.days.find((day) => day.key === dayKey);
  let score = input.config.preferredTemplateId === template.id ? 1_000 : 0;
  if (
    previous?.sourceTemplateId === template.id &&
    (!template.wholeSequence || input.config.variety === "familiar")
  )
    score += 100;
  if (input.config.place === "gym" && template.id.startsWith("gym.")) score += 10;
  if (input.config.place === "home" && template.id.startsWith("home.")) score += 10;
  if (input.config.mode === "single") {
    const recent = recentHistory(input.history, input.now).flatMap((entry) =>
      entry.sets.filter(confirmed),
    );
    for (const slot of template.slots.filter((slot) => slot.phase === "main")) {
      score -=
        recent.filter((set) =>
          set.primaryMuscles.some((muscle) => slot.group.primary.includes(muscle)),
        ).length * 4;
    }
    if (template.kind === "fullbody") score += 6;
  }
  if (input.config.variety === "different" && template.wholeSequence) {
    const recentIds = new Set(
      recentHistory(input.history, input.now, 14)
        .flatMap((entry) => entry.sets.filter(confirmed))
        .map((set) => set.variantId),
    );
    score -=
      template.slots.filter((slot) => slot.group.variants.some((id) => recentIds.has(id))).length *
      3;
    if (previous?.sourceTemplateId === template.id) score -= 25;
  }
  // Favorites never bypass admission, and rank templates only when actually available.
  score += template.slots.filter((slot) =>
    candidates(slot.group, catalog).some((exercise) =>
      input.preferences.favoriteVariantIds.includes(exercise.variantId),
    ),
  ).length;
  return score;
}

function sortedTemplates(
  input: PlannerEngineInput,
  catalog: BuilderExercise[],
  dayKey: string,
  kind?: PlannerLibraryTemplate["kind"],
): PlannerLibraryTemplate[] {
  return compatibleTemplates(input, catalog, kind).sort(
    (a, b) => templateScore(input, b, catalog, dayKey) - templateScore(input, a, catalog, dayKey),
  );
}

function validateConfig(config: PlannerConfig): void {
  if (config.dropSets && config.direction !== "strength")
    throw new DomainError("INVALID_INPUT", 400, "Дропсеты доступны только в силовом направлении.");
  if (
    !Number.isInteger(config.daysPerWeek) ||
    config.daysPerWeek < 1 ||
    config.daysPerWeek > 4 ||
    !Number.isInteger(config.durationMinutes) ||
    config.durationMinutes < 5 ||
    config.durationMinutes > 120
  ) {
    throw new DomainError("INVALID_INPUT", 400, "Выбери 1–4 занятия и 5–120 минут.");
  }
  const strength = config.direction === "strength" || config.direction === "calisthenics";
  if (config.direction === "yoga" && config.replacements?.length)
    throw new DomainError(
      "PLANNER_SEQUENCE_REPLACEMENT_UNAVAILABLE",
      409,
      "Для йоги выбери другую цельную последовательность; отдельные асаны не подменяются.",
    );
  if (
    config.mode === "program" &&
    strength &&
    config.split === "upper_lower" &&
    config.daysPerWeek < 2
  )
    throw new DomainError(
      "PLANNER_FREQUENCY_UNSUPPORTED",
      400,
      "Верх/низ доступен на 2, 3 или 4 дня. Для одного визита выбери всё тело.",
    );
  if (
    config.mode === "program" &&
    strength &&
    config.split === "push_pull_legs" &&
    config.daysPerWeek !== 3
  )
    throw new DomainError(
      "PLANNER_FREQUENCY_UNSUPPORTED",
      400,
      "Жимы/тяги/ноги доступны как цикл из трёх занятий. Для 2 или 4 дней выбери верх/низ или всё тело.",
    );
  const keys =
    config.replacements?.map((replacement) => `${replacement.dayKey}:${replacement.slotKey}`) ?? [];
  if (new Set(keys).size !== keys.length)
    throw new DomainError("INVALID_INPUT", 400, "Для одного слота можно выбрать одну замену.");
}

function orderedKinds(input: PlannerEngineInput): PlannerLibraryTemplate["kind"][] {
  const { config } = input;
  if (config.direction !== "strength" && config.direction !== "calisthenics")
    return Array.from(
      { length: config.mode === "single" ? 1 : config.daysPerWeek },
      () => "support",
    );
  if (config.mode === "single") return ["fullbody"];
  if (config.split === "fullbody")
    return Array.from({ length: config.daysPerWeek }, () => "fullbody");
  if (config.split === "push_pull_legs") return ["push", "pull", "legs"];
  // Only an actually completed day advances the rolling cycle; partial does not imply consent.
  const completed = input.history
    .filter(
      (entry) =>
        entry.status === "completed" &&
        entry.programRevision === input.previous?.revision &&
        entry.dayKey &&
        entry.sets.some(confirmed) &&
        Date.parse(entry.endedAt) <= input.now.getTime(),
    )
    .sort((a, b) => Date.parse(b.endedAt) - Date.parse(a.endedAt));
  const last = completed[0];
  const lastDay = input.previous?.draft.days.find((day) => day.key === last?.dayKey);
  const lastTemplate = ALL_TEMPLATES.find((template) => template.id === lastDay?.sourceTemplateId);
  const startLower = config.daysPerWeek === 3 && lastTemplate?.kind === "upper";
  return Array.from({ length: config.daysPerWeek }, (_, index) =>
    (index + (startLower ? 1 : 0)) % 2 === 0 ? "upper" : "lower",
  );
}

function setsForDay(
  input: PlannerEngineInput,
  kinds: PlannerLibraryTemplate["kind"][],
  index: number,
): number {
  const intent = isConservative(input) ? "start" : input.config.intent;
  const difficult =
    isStrengthDirection(input.config.direction) &&
    !!recentDifficultStrength(input.history, input.now);
  const target = (intent === "start" ? 4 : intent === "maintain" ? 6 : 8) - (difficult ? 2 : 0);
  if (input.config.mode === "single" || kinds.length === 1)
    return Math.max(
      1,
      (intent === "start" ? 1 : intent === "maintain" ? 2 : 3) - (difficult ? 1 : 0),
    );
  const kind = kinds[index];
  const occurrences = kinds.filter((entry) => entry === kind).length;
  const occurrence = kinds.slice(0, index).filter((entry) => entry === kind).length;
  if (kind !== "fullbody" && occurrences === 1)
    return Math.max(
      1,
      (intent === "start" ? 2 : intent === "maintain" ? 3 : 4) - (difficult ? 1 : 0),
    );
  // Same weekly role budget for 2/3/4 fullbody days; never multiply a heavy session.
  const weeklyTarget = Math.max(occurrences, target);
  return Math.floor(weeklyTarget / occurrences) + (occurrence < weeklyTarget % occurrences ? 1 : 0);
}

function makeStep(
  slot: PlannerLibrarySlot,
  exercise: BuilderExercise,
  sets: number,
  target = slot.target,
): PlannerStep {
  return {
    slotKey: slot.key,
    phase: slot.phase,
    sourceVariantId: slot.group.variants[0],
    exercise,
    revisionId: exercise.revisionId,
    sets,
    target,
    restSeconds: slot.restSeconds,
  };
}

function pairCompatible(a: PlannerStep, b: PlannerStep): boolean {
  if (
    a.phase !== "main" ||
    b.phase !== "main" ||
    a.exercise.focusMode !== "loading" ||
    b.exercise.focusMode !== "loading" ||
    a.sets !== b.sets ||
    a.exercise.movementPattern === b.exercise.movementPattern
  )
    return false;
  const used = new Set(
    [...a.exercise.primaryMuscles, ...a.exercise.secondaryMuscles].map((muscle) => muscle.code),
  );
  return ![...b.exercise.primaryMuscles, ...b.exercise.secondaryMuscles].some((muscle) =>
    used.has(muscle.code),
  );
}

function applyPairs(steps: PlannerStep[], dayKey: string): boolean {
  let found = false;
  for (let index = 0; index < steps.length - 1; index++) {
    const a = steps[index];
    const b = steps[index + 1];
    if (!pairCompatible(a, b)) continue;
    const pairKey = `${dayKey}.pair.${index}`;
    // A→B transition differs from recovery between rounds. No universal 30-second rest.
    const rest = Math.max(a.restSeconds, b.restSeconds);
    a.pairKey = pairKey;
    b.pairKey = pairKey;
    a.transitionSeconds = 20;
    b.transitionSeconds = 20;
    a.restSeconds = rest;
    b.restSeconds = rest;
    found = true;
    index++;
  }
  return found;
}

function supplementalSteps(
  catalog: BuilderExercise[],
  phase: "warmup" | "cooldown",
): PlannerStep[] {
  const keys = phase === "warmup" ? ["shoulder_circle", "hip_circle"] : ["shoulder_circle"];
  return keys.flatMap((key) => {
    const group = PLANNER_SUPPORT_GROUPS.find((entry) => entry.key === key);
    if (!group) return [];
    const exercise = candidates(group, catalog)[0];
    if (!exercise) return [];
    const slot: PlannerLibrarySlot = {
      key: `${phase}_${key}`,
      group,
      anchor: true,
      phase,
      target: phase === "warmup" ? 8 : 6,
      restSeconds: 0,
    };
    return [makeStep(slot, exercise, 1)];
  });
}

function buildDay(
  input: PlannerEngineInput,
  catalog: BuilderExercise[],
  template: PlannerLibraryTemplate,
  dayIndex: number,
  sets: number,
  key: string,
): PlannerDay {
  const warnings: string[] = template.coverageWarning ? [template.coverageWarning] : [];
  const steps = template.slots.map((slot) => {
    const exercise = chooseExercise(input, slot, catalog, key, dayIndex);
    if (!exercise)
      throw new DomainError(
        "PLANNER_LIBRARY_GAP",
        409,
        `Нет доступного упражнения для «${slot.group.key}». Измени инвентарь, направление или состав занятия.`,
      );
    // Three named dose tiers preserve the entire support sequence and its ordering.
    const factor = template.wholeSequence
      ? input.config.durationMinutes < 15
        ? 1
        : input.config.durationMinutes < 25
          ? 1.5
          : 2
      : 1;
    const target = Math.round(slot.target * factor);
    const step = makeStep(slot, exercise, template.wholeSequence ? 1 : sets, target);
    if (isStrengthDirection(input.config.direction)) {
      step.coaching = strengthStepCoaching(step, input.history, input.now);
    }
    const old = previousStep(input, key, slot.key);
    if (old && old.exercise.variantId !== exercise.variantId)
      step.changeNote =
        "Сопоставимое движение с тем же основным акцентом. Вес прежнего упражнения не переносится.";
    else if (exercise.variantId !== slot.group.variants[0])
      step.changeNote = "Выбран доступный вариант того же движения, метрики и основного акцента.";
    return step;
  });
  if (!template.wholeSequence) {
    const warmup = supplementalSteps(catalog, "warmup");
    const cooldown = supplementalSteps(catalog, "cooldown");
    steps.unshift(...warmup);
    steps.push(...cooldown);
    if (!warmup.length)
      warnings.push(
        "Совместимая разминка отсутствует в доступном каталоге; подготовь её отдельно перед основной работой.",
      );
    if (!cooldown.length) warnings.push("Совместимая заминка отсутствует в доступном каталоге.");
  }
  if (input.config.execution === "pairs" && !template.wholeSequence && !applyPairs(steps, key))
    warnings.push(
      "В этом составе нет совместимых соседних пар с равным числом подходов. Показаны обычные подходы.",
    );
  if (template.wholeSequence && input.config.execution === "pairs")
    warnings.push(
      "Последовательность сохранена целиком; парные силовые подходы к ней не применяются.",
    );
  if (input.config.dropSets) {
    const eligible =
      input.config.direction === "strength" &&
      !isConservative(input) &&
      !recentDifficultStrength(input.history, input.now);
    const candidate = eligible
      ? steps.findLast(
          (step) => step.phase === "main" && !step.pairKey && supportsDropSet(step.exercise),
        )
      : undefined;
    if (candidate) {
      candidate.dropSet = { kind: "last_set_drop", targetReps: 8 };
      candidate.coaching = strengthStepCoaching(candidate, input.history, input.now);
    } else {
      warnings.push(
        eligible
          ? "Нет отдельного упражнения, подходящего для дропсета. Суперсет и дропсет не совмещаем; обычные подходы сохранены."
          : "Дропсет не добавлен: он доступен для регулярных силовых занятий без недавней тяжёлой оценки и возвращения после паузы. Обычный план сохранён.",
      );
    }
  }
  const estimate = estimateBuilderWorkout(steps);
  return {
    key,
    title: `${template.title}${input.config.mode === "program" ? ` · ${String.fromCharCode(65 + dayIndex)}` : ""}`,
    sourceTemplateId: template.id,
    steps,
    estimate,
    warnings,
  };
}

function historyAwareSingleTemplates(
  input: PlannerEngineInput,
  catalog: BuilderExercise[],
  dayKey: string,
): PlannerLibraryTemplate[] {
  const options = compatibleTemplates(input, catalog).filter((template) =>
    ["fullbody", "upper", "lower", "support"].includes(template.kind),
  );
  return options.sort(
    (a, b) => templateScore(input, b, catalog, dayKey) - templateScore(input, a, catalog, dayKey),
  );
}

function dayFromCandidates(
  input: PlannerEngineInput,
  catalog: BuilderExercise[],
  kinds: PlannerLibraryTemplate["kind"][],
  index: number,
): PlannerDay {
  const key = input.config.mode === "single" ? "single" : `day-${index + 1}`;
  const options =
    input.config.mode === "single"
      ? historyAwareSingleTemplates(input, catalog, key)
      : sortedTemplates(input, catalog, key, kinds[index]);
  if (!options.length)
    throw new DomainError(
      "PLANNER_LIBRARY_GAP",
      409,
      "Для этих условий нет цельного совместимого черновика. Проверь инвентарь и исключения или выбери другое направление. Тяга не заменяется упражнением с одним лишь тегом «спина».",
    );
  const preferred = input.config.preferredTemplateId;
  const forced =
    preferred && (input.config.mode === "single" || index === 0)
      ? options.find(
          (template) =>
            template.id === preferred ||
            (template.coverageWarning && template.id === `${preferred}.without-pull`),
        )
      : undefined;
  if (preferred && (input.config.mode === "single" || index === 0) && !forced)
    throw new DomainError(
      "PLANNER_TEMPLATE_UNAVAILABLE",
      409,
      "Выбранный черновик не соответствует направлению, месту, схеме, инвентарю или исключениям.",
    );
  const replacements =
    input.config.replacements?.filter((replacement) => replacement.dayKey === key) ?? [];
  const validOptions = (forced ? [forced] : options).filter((template) =>
    replacements.every((replacement) =>
      template.slots.some((slot) => slot.key === replacement.slotKey),
    ),
  );
  if (!validOptions.length)
    throw new DomainError(
      "PLANNER_SLOT_UNAVAILABLE",
      400,
      "Слот замены отсутствует в текущем занятии.",
    );
  let minimum = Number.POSITIVE_INFINITY;
  for (const template of validOptions) {
    const day = buildDay(input, catalog, template, index, setsForDay(input, kinds, index), key);
    minimum = Math.min(minimum, day.estimate.maxSeconds);
    if (day.estimate.maxSeconds <= input.config.durationMinutes * 60) return day;
  }
  throw new DomainError(
    "PLANNER_DURATION_TOO_SHORT",
    409,
    `Цельный совместимый состав требует до ${Math.ceil(minimum / 60)} мин. Увеличь время или явно выбери более короткий комплекс; последовательность не обрезана.`,
  );
}

function planChanges(input: PlannerEngineInput, days: PlannerDay[]): PlannerDraft["changes"] {
  const previous = input.previous?.draft;
  if (!previous || input.config.mode === "single") return [];
  const changes: PlannerDraft["changes"] = [];
  if (previous.config.daysPerWeek !== input.config.daysPerWeek)
    changes.push({
      label: "Частота будущих занятий",
      before: `${previous.config.daysPerWeek} дня`,
      after: `${input.config.daysPerWeek} дня; работа распределена заново`,
    });
  if (previous.config.split !== input.config.split)
    changes.push({ label: "Схема", before: previous.config.split, after: input.config.split });
  if (previous.config.intent !== input.config.intent)
    changes.push({
      label: "Намерение",
      before: previous.config.intent,
      after: input.config.intent,
    });
  for (const day of days) {
    const old = previous.days.find((entry) => entry.key === day.key);
    if (!old) {
      changes.push({
        label: day.title,
        before: "Нет будущего назначения",
        after: `${day.steps.filter((step) => step.phase === "main").length} упражнений основной части`,
      });
      continue;
    }
    for (const step of day.steps.filter((entry) => entry.phase === "main")) {
      const oldStep = old.steps.find((entry) => entry.slotKey === step.slotKey);
      if (
        !oldStep ||
        oldStep.exercise.variantId !== step.exercise.variantId ||
        oldStep.sets !== step.sets ||
        oldStep.target !== step.target ||
        oldStep.restSeconds !== step.restSeconds ||
        oldStep.pairKey !== step.pairKey ||
        JSON.stringify(oldStep.dropSet) !== JSON.stringify(step.dropSet)
      )
        changes.push({
          label: `${day.key}: ${step.exercise.name}`,
          before: oldStep
            ? `${oldStep.exercise.name}: ${oldStep.sets} × ${oldStep.target}, отдых ${oldStep.restSeconds} с${oldStep.pairKey ? ", в суперсете" : ""}${oldStep.dropSet ? ", снижение веса в последнем подходе" : ""}`
            : "Нет назначения",
          after: `${step.exercise.name}: ${step.sets} × ${step.target}, отдых ${step.restSeconds} с${step.pairKey ? ", в суперсете" : ""}${step.dropSet ? ", снижение веса в последнем подходе" : ""}`,
        });
    }
    for (const oldStep of old.steps.filter(
      (entry) =>
        entry.phase === "main" && !day.steps.some((step) => step.slotKey === entry.slotKey),
    ))
      changes.push({
        label: `${day.key}: ${oldStep.exercise.name}`,
        before: `${oldStep.sets} × ${oldStep.target}`,
        after: "Убрано из будущего назначения",
      });
  }
  for (const old of previous.days.filter((entry) => !days.some((day) => day.key === entry.key)))
    changes.push({
      label: old.title,
      before: "Будущее назначение",
      after: "Убрано из будущего цикла; история сохранена",
    });
  return changes;
}

function weeklySets(days: PlannerDay[]): PlannerDraft["weeklyPrimarySets"] {
  const totals = new Map<MuscleGroup, number>();
  for (const day of days)
    for (const step of day.steps) {
      if (step.phase !== "main" || step.exercise.focusMode !== "loading") continue;
      for (const { code } of step.exercise.primaryMuscles)
        totals.set(code, (totals.get(code) ?? 0) + step.sets);
    }
  return (Object.keys(MUSCLE_GROUPS) as MuscleGroup[]).flatMap((muscle) =>
    totals.has(muscle) ? [{ muscle, sets: totals.get(muscle) ?? 0 }] : [],
  );
}

export function buildPlannerDraft(input: PlannerEngineInput): PlannerDraft {
  validateConfig(input.config);
  const strength = isStrengthDirection(input.config.direction);
  input = { ...input, history: directionHistory(input) };
  const historySummary = summarizePlannerHistory(input.history, input.now);
  const catalog = eligibleCatalog(input);
  const kinds = orderedKinds(input);
  const days = kinds.map((_, index) => dayFromCandidates(input, catalog, kinds, index));
  for (const replacement of input.config.replacements ?? [])
    if (
      !days.some(
        (day) =>
          day.key === replacement.dayKey &&
          day.steps.some((step) => step.slotKey === replacement.slotKey),
      )
    )
      throw new DomainError(
        "PLANNER_SLOT_UNAVAILABLE",
        400,
        "Слот замены отсутствует в текущем занятии.",
      );
  const notes = strength
    ? [
        "Численный вес не назначается и не переносится между упражнениями. Подтверждённые результаты остаются фактами; автоматического повышения нагрузки нет.",
        "Повторы и секунды — стартовый ориентир. Завершай подход при потере управляемой техники; сообщение о боли требует отдельного сценария, а не обычной замены.",
        "Время включает подходы, стороны, отдых, подготовку и переходы; ожидание тренажёра не учтено.",
      ]
    : [
        "Цельный комплекс сохраняет собственные порядок, стороны и дозировки. Силовые правила повторений, веса и недельных подходов к нему не применяются.",
      ];
  if (
    strength &&
    input.config.mode === "program" &&
    input.config.split === "fullbody" &&
    input.config.daysPerWeek > 1
  )
    notes.push(
      "Недельная основная работа распределена между днями; увеличение частоты не умножает объём. Разминка и заминка не входят в основной объём.",
    );
  if (strength && input.config.mode === "program" && input.config.daysPerWeek === 1)
    notes.push(
      "Один визит — ограниченное комплексное занятие. Вся неделя не компенсируется чрезмерным объёмом за один раз.",
    );
  if (strength && input.config.mode === "program" && input.config.split === "upper_lower")
    notes.push(
      input.config.daysPerWeek === 3
        ? "Верх/низ — продолжающийся трёхдневный цикл. Стороны чередуются по завершённым занятиям; каждой половине тела не обещаны два дня в каждой календарной неделе."
        : input.config.daysPerWeek === 2
          ? "Два дня верх/низ дают каждой половине тела одно занятие в неделю. Для более частого охвата выбери всё тело."
          : "Четыре дня: верх A / низ A / верх B / низ B.",
    );
  if (strength && input.config.split === "push_pull_legs" && input.config.mode === "program")
    notes.push(
      "Три дня жимы/тяги/ноги — по одному занятию каждой части; это не шестидневный цикл.",
    );
  if (historySummary.returningAfterPause || input.experience === "returning")
    notes.push(
      "После паузы используется консервативный старт: только начальный уровень и уменьшенный объём, прежняя прогрессия автоматически не продолжается. Порог 21 день — редакционное правило этой версии.",
    );
  if (strength && recentDifficultStrength(input.history, input.now))
    notes.push(
      "Учтена сохранённая оценка силовой нагрузки: уменьшаем число подходов, сохраняя движения и минимум один подход. Вес не повышается. Изменения применятся после подтверждения черновика.",
    );
  if (input.config.dropSets && strength)
    notes.push(
      "Не более одного дропсета в занятии: после последнего подхода выбранного упражнения снизь вес и продолжи с управляемой техникой. Обязательного отказа нет; снижение можно пропустить. Килограммы не назначаются. Это продолжение подхода, а не ещё один полный подход или дополнительный XP.",
    );
  if (input.config.mode === "single" && historySummary.recentPrimaryMuscles.length)
    notes.push(
      `Учтена фактическая работа за последние ${RECENT_DAYS} дня: ${historySummary.recentPrimaryMuscles.map((muscle) => MUSCLE_GROUPS[muscle]).join(", ")}. Совместимые комплексы с меньшим повторным акцентом получили приоритет; это не оценка восстановленности.`,
    );
  if (input.config.variety === "different")
    notes.push(
      "Опорные силовые движения сохранены, где совместимы; разнообразие ограничено сопоставимыми дополнениями. Для йоги выбирается другая цельная последовательность.",
    );
  if (input.preferences.excludedVariantIds.length)
    notes.push(
      "Постоянные исключения учтены. Разовые пропуски не превращаются в постоянный запрет.",
    );
  if (input.config.excludeVariantIds?.length)
    notes.push(
      "Разовые исключения относятся только к этому предложению; постоянные предпочтения не изменены.",
    );
  if (input.previous && input.config.mode === "program")
    notes.push(
      "Изменения относятся к будущему циклу. Выполненные занятия и подтверждённые подходы не переписываются.",
    );
  if (input.config.direction === "yoga")
    notes.push(
      "Порядок целой последовательности и обе стороны сохранены; случайного перемешивания или обрезания асан нет.",
    );
  return {
    policyVersion: "planner-v1",
    methodology: trainingMethodology(input.config.direction),
    config: structuredClone(input.config),
    days,
    notes,
    changes: planChanges(input, days),
    weeklyPrimarySets: strength ? weeklySets(days) : [],
    historySummary,
    disclosure: PLANNER_LIBRARY_DISCLOSURE,
  };
}

export function getPlannerReplacements(
  input: PlannerEngineInput & { dayKey: string; slotKey: string },
): PlannerReplacementOption[] {
  const draft = buildPlannerDraft(input);
  const day = draft.days.find((entry) => entry.key === input.dayKey);
  const step = day?.steps.find((entry) => entry.slotKey === input.slotKey);
  if (!day || !step)
    throw new DomainError(
      "PLANNER_SLOT_UNAVAILABLE",
      400,
      "Упражнение отсутствует в текущем предложении.",
    );
  // Whole yoga sequences are replaced as sequences, never by an independently chosen posture.
  if (input.config.direction === "yoga") return [];
  const group = PLANNER_ALL_GROUPS.find((entry) => matchesGroup(step.exercise, entry));
  if (!group) return [];
  return candidates(group, eligibleCatalog(input))
    .filter((exercise) => {
      if (exercise.variantId === step.exercise.variantId) return false;
      const modified = day.steps.map((old) =>
        old.slotKey === step.slotKey
          ? { ...old, exercise, revisionId: exercise.revisionId }
          : { ...old },
      );
      const pair = step.pairKey ? modified.filter((entry) => entry.pairKey === step.pairKey) : [];
      if (pair.length && (pair.length !== 2 || !pairCompatible(pair[0], pair[1]))) return false;
      if (step.dropSet && !supportsDropSet(exercise)) return false;
      return estimateBuilderWorkout(modified).maxSeconds <= input.config.durationMinutes * 60;
    })
    .sort(
      (a, b) =>
        Number(input.preferences.favoriteVariantIds.includes(b.variantId)) -
          Number(input.preferences.favoriteVariantIds.includes(a.variantId)) ||
        a.name.localeCompare(b.name, "ru"),
    )
    .map((exercise) => ({
      variantId: exercise.variantId,
      revisionId: exercise.revisionId,
      name: exercise.name,
      explanation:
        "То же движение, метрика и основной мышечный акцент; проверены текущий инвентарь, уровень, время и совместимость пары. Вес не переносится.",
    }));
}
