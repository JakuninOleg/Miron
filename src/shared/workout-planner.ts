import type { CatalogContext, CatalogDirection, MuscleGroup } from "./catalog-taxonomy";
import type { Experience } from "./contracts";
import type { BuilderEstimate, BuilderSelectedStep } from "./workout-builder";
import type { StrengthStepCoaching, TrainingMethodology } from "./training-methodology";
import type { WorkoutLoadFeedback } from "./workout-feedback";
import type { DropSetResult } from "./training-methods";

export type PlannerSplit = "fullbody" | "upper_lower" | "push_pull_legs";
export type PlannerIntent = "start" | "maintain" | "develop";
export type PlannerExecution = "straight" | "pairs";
export interface PlannerConfig {
  mode: "program" | "single";
  place: CatalogContext;
  direction: CatalogDirection;
  split: PlannerSplit;
  daysPerWeek: number;
  intent: PlannerIntent;
  durationMinutes: number;
  execution: PlannerExecution;
  dropSets?: boolean;
  variety: "familiar" | "different";
  preferredTemplateId?: string;
  /** One-off omissions; permanent exclusions use the explicit preferences command. */
  excludeVariantIds?: string[];
  replacements?: { dayKey: string; slotKey: string; variantId: string }[];
}
export interface PlannerPreferences {
  revision: number;
  excludedVariantIds: string[];
  favoriteVariantIds: string[];
}
export interface PlannerHistory {
  id: string;
  endedAt: string;
  status: "completed" | "partial" | "aborted";
  programRevision: number | null;
  dayKey: string | null;
  direction?: CatalogDirection;
  loadFeedback?: WorkoutLoadFeedback;
  sets: {
    drop?: DropSetResult;
    hadDropSetPlan?: boolean;
    variantId: string;
    revisionId?: string;
    plannedSets?: number;
    target?: number;
    reps: number | null;
    durationSeconds: number | null;
    weightKg: number;
    primaryMuscles: MuscleGroup[];
    secondaryMuscles: MuscleGroup[];
    phase?: "warmup" | "main" | "cooldown";
  }[];
}
export interface PlannerStep extends BuilderSelectedStep {
  coaching?: StrengthStepCoaching;
  slotKey: string;
  phase: "warmup" | "main" | "cooldown";
  sourceVariantId: string;
  changeNote?: string;
}
export interface PlannerDay {
  key: string;
  title: string;
  sourceTemplateId: string;
  steps: PlannerStep[];
  estimate: BuilderEstimate;
  warnings: string[];
}
export interface PlannerChange {
  label: string;
  before: string;
  after: string;
}
export interface PlannerHistorySummary {
  confirmedSets: number;
  lastWorkoutAt: string | null;
  recentPrimaryMuscles: MuscleGroup[];
  returningAfterPause: boolean;
}
export interface PlannerDraft {
  policyVersion: "planner-v1";
  /** Optional only for confirmed legacy revisions; new previews always pin their methodology. */
  methodology?: TrainingMethodology;
  config: PlannerConfig;
  days: PlannerDay[];
  notes: string[];
  changes: PlannerChange[];
  weeklyPrimarySets: { muscle: MuscleGroup; sets: number }[];
  historySummary: PlannerHistorySummary;
  disclosure: string;
}
export interface PlannerPreview extends PlannerDraft {
  fingerprint: string;
  expectedProgramRevision: number;
  preferencesRevision: number;
  inventoryRevision: number;
}
export interface PlannerProgram {
  revision: number;
  confirmedAt: string;
  draft: PlannerDraft;
}
export interface PlannerState {
  preferences: PlannerPreferences;
  program: PlannerProgram | null;
  single: PlannerProgram | null;
  excludedExercises: { variantId: string; name: string }[];
  experience: Experience;
  historySummary: PlannerHistorySummary;
}
export interface PlannerConfirm {
  operationId: string;
  expectedProgramRevision: number;
  fingerprint: string;
  config: PlannerConfig;
}
export interface PlannerPreferencesCommand {
  operationId: string;
  expectedRevision: number;
  excludedVariantIds: string[];
  favoriteVariantIds: string[];
}
export interface PlannerReplacementQuery {
  config: PlannerConfig;
  dayKey: string;
  slotKey: string;
}
export interface PlannerReplacementOption {
  variantId: string;
  revisionId: string;
  name: string;
  explanation: string;
}
