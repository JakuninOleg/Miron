import type { CatalogContext, CatalogDirection, MuscleGroup } from "./catalog-taxonomy";

export type BuilderEquipmentFilter =
  "all" | "machines" | "free_weights" | "bodyweight" | "bands" | "cables";

export interface BuilderResourceOption {
  code: string;
  name: string;
  kind: "equipment" | "support" | "space" | "anchor";
  requiresConfirmation: boolean;
}

export interface BuilderInventory {
  place: CatalogContext;
  revision: number;
  confirmedAt: string;
  resources: { code: string; quantity: number; isStable: boolean | null }[];
}

export interface BuilderBootstrap {
  ownerId: string;
  theme: "dark" | "rose";
  resources: BuilderResourceOption[];
  inventories: BuilderInventory[];
  previousInventories?: {
    place: CatalogContext;
    resources: BuilderInventory["resources"];
    supportsConfirmed: boolean;
  }[];
  muscles: { code: MuscleGroup; name: string }[];
}

export interface BuilderTiming {
  secondsPerRep: { min: number; max: number };
  setupSeconds: { min: number; max: number };
  sideSwitchSeconds: { min: number; max: number };
  perSide: boolean;
}

export interface BuilderExercise {
  variantId: string;
  revisionId: string;
  name: string;
  metric: "reps" | "time";
  resistanceMode: "bodyweight" | "external_load" | "machine_load" | "assisted_bodyweight";
  difficulty: "beginner" | "intermediate" | "advanced";
  primaryMuscles: { code: MuscleGroup; name: string }[];
  secondaryMuscles: { code: MuscleGroup; name: string }[];
  equipment: { code: string; name: string }[];
  instructions: string[];
  status: "draft" | "published";
  timing: BuilderTiming;
  /** Exact revision metadata used for equivalent substitutions, never inferred from muscle tags. */
  movementPattern?: string;
  focusMode?: "loading" | "stretch" | "mobility" | "balance" | "relaxation";
}

export interface BuilderCatalog {
  exercises: BuilderExercise[];
  total: number;
  page: number;
  pageSize: number;
}

export interface BuilderStep {
  revisionId: string;
  sets: number;
  target: number;
  restSeconds: number;
  /** Adjacent A/B pair. Rest is between rounds; transition is between A and B. */
  pairKey?: string;
  transitionSeconds?: number;
}

export interface BuilderSelectedStep extends BuilderStep {
  exercise: BuilderExercise;
}

export interface BuilderEstimate {
  minSeconds: number;
  maxSeconds: number;
  version: "planning-v1";
}

export interface CustomWorkoutSummary {
  id: string;
  revision: number;
  name: string;
  place: CatalogContext;
  direction: CatalogDirection;
  exerciseCount: number;
  estimate: BuilderEstimate;
  updatedAt: string;
}

export interface CustomWorkoutTemplate extends CustomWorkoutSummary {
  inventoryRevision: number;
  steps: BuilderSelectedStep[];
}

export interface SaveCustomWorkout {
  operationId: string;
  id: string;
  expectedRevision: number;
  name: string;
  place: CatalogContext;
  direction: CatalogDirection;
  inventoryRevision: number;
  steps: BuilderStep[];
}

export interface SaveBuilderInventory {
  operationId: string;
  place: CatalogContext;
  expectedRevision: number;
  resources: { code: string; quantity: number; isStable: boolean | null }[];
}

export function builderPairError(steps: BuilderStep[]): string | null {
  const seen = new Set<string>();
  for (let index = 0; index < steps.length; index++) {
    const step = steps[index];
    if (!step.pairKey) {
      if (step.transitionSeconds !== undefined)
        return "Переход задаётся только для пары упражнений.";
      continue;
    }
    const partner = steps[index + 1];
    if (seen.has(step.pairKey) || !partner || partner.pairKey !== step.pairKey)
      return "В паре должны быть ровно два соседних упражнения.";
    if (
      step.sets !== partner.sets ||
      step.restSeconds !== partner.restSeconds ||
      step.transitionSeconds !== partner.transitionSeconds
    )
      return "У упражнений пары должны совпадать число кругов, отдых и время перехода.";
    seen.add(step.pairKey);
    index++;
  }
  return null;
}

// Planning assumptions, not measured exercise duration or technique instructions.
export function estimateBuilderWorkout(steps: BuilderSelectedStep[]): BuilderEstimate {
  let minSeconds = 0;
  let maxSeconds = 0;
  let groups = 0;
  for (let index = 0; index < steps.length; index++) {
    const { exercise, sets, target, restSeconds, pairKey, transitionSeconds } = steps[index];
    const { timing, metric } = exercise;
    const sides = timing.perSide ? 2 : 1;
    const previous = steps[index - 1];
    const next = steps[index + 1];
    const pairedPrevious = pairKey && previous?.pairKey === pairKey;
    const pairedNext = pairKey && next?.pairKey === pairKey;
    if (!pairedPrevious) groups++;
    const rest = pairedPrevious ? 0 : Math.max(0, sets - 1) * restSeconds;
    const transitionsWithinPair = pairedNext ? sets * (transitionSeconds ?? 30) : 0;
    const switches = timing.perSide ? sets : 0;
    minSeconds +=
      sets * target * sides * (metric === "time" ? 1 : timing.secondsPerRep.min) +
      rest +
      transitionsWithinPair +
      timing.setupSeconds.min +
      switches * timing.sideSwitchSeconds.min;
    maxSeconds +=
      sets * target * sides * (metric === "time" ? 1 : timing.secondsPerRep.max) +
      rest +
      transitionsWithinPair +
      timing.setupSeconds.max +
      switches * timing.sideSwitchSeconds.max;
    // Invalid pairs are rejected by the command validator before authoritative estimation.
  }
  const transitions = Math.max(0, groups - 1);
  return {
    minSeconds: minSeconds + transitions * 15,
    maxSeconds: maxSeconds + transitions * 30,
    version: "planning-v1",
  };
}

export function builderDurationLabel(estimate: BuilderEstimate): string {
  if (!estimate.maxSeconds) return "0 минут";
  const min = Math.max(1, Math.floor(estimate.minSeconds / 60));
  const max = Math.max(min, Math.ceil(estimate.maxSeconds / 60));
  return min === max ? `≈ ${min} мин` : `≈ ${min}–${max} мин`;
}
