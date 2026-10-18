import type { BuilderTiming } from "./workout-builder";
import type { WorkoutLoadFeedback } from "./workout-feedback";
import type { StrengthStepCoaching } from "./training-methodology";
import type { DropSetPlan, DropSetResult } from "./training-methods";

export type CompanionId = "max" | "lika";
export type Theme = "dark" | "rose";
export type Goal = "strength" | "energy" | "habit";
export type Experience = "beginner" | "returning" | "regular";
export type Discipline = "strength" | "calisthenics" | "mobility" | "yoga";
export type Location = "home" | "gym" | "outdoor" | "workout_park";
export type WorkoutStatus = "ready" | "active" | "completed" | "partial" | "aborted";
export type RewardKind = "main" | "support";
export type EnergyActivity = "strength" | "calisthenics" | "yoga" | "stretch" | "mobility";
export interface WorkoutEnergyInput {
  bodyWeightKg?: number;
  /** User-reported correction for this estimate only; never rewrites recorded sets or XP. */
  workload?: EnergyWorkloadCorrection[];
}
export interface EnergyWorkloadCorrection {
  exerciseId: string;
  sets: number;
  repsPerSet?: number;
  durationSecondsPerSet?: number;
}
export interface WorkoutEnergyEstimate {
  methodVersion: "met-performed-v1";
  basis: "additional_to_rest";
  sourceVersion: "2024-adult";
  sourceCode: string;
  sourceUrl: string;
  sourcePopulation: "19-59";
  activity: EnergyActivity;
  met: number;
  bodyWeightKg: number;
  weightSource: "reference" | "user_reported";
  durationSeconds: number;
  durationSource: "modeled_from_performed_sets";
  workloadCorrections: EnergyWorkloadCorrection[];
  estimatedKcal: number;
  estimatedAt: string;
}
export interface WorkoutReward {
  policyVersion: "daily-v1";
  day: string;
  timezone: "Europe/Moscow";
  kind: RewardKind;
  eligibleXp: number;
  awardedXp: number;
  dayTotalXp: number;
}
export interface InventoryItem {
  code: string;
  quantity: number;
}
export interface Profile {
  name: string;
  interests?: string[];
  companion: CompanionId;
  theme: Theme;
  goal: Goal;
  experience: Experience;
  discipline: Discipline;
  daysPerWeek: number;
  durationMinutes: number;
  location: Location;
  equipment: InventoryItem[];
  timezone: string;
  trainingDays: number[];
  reminderTime: string;
  onboardingCompleted: boolean;
  adultConfirmed: boolean;
  remindersEnabled: boolean;
  showWorkoutEnergy?: boolean;
}
export interface Trial {
  startsAt: string;
  endsAt: string;
  replyLimit: number;
  repliesUsed: number;
}
export interface Exercise {
  revisionId?: string;
  dropSet?: DropSetPlan;
  coaching?: StrengthStepCoaching;
  id: string;
  name: string;
  description: string;
  equipment: string[];
  sets: number;
  targetReps: number;
  /** Seconds pinned by legacy time snapshots; absent in older cached DTOs. */
  targetDurationSeconds?: number;
  /** Target is per side; one recorded set confirms both sides. Timed facts are total work seconds. */
  perSide?: boolean;
  restSeconds: number;
  /** Pinned planning assumptions for rough duration/energy estimates. */
  timing?: BuilderTiming;
  instructions: string[];
  metric: "reps" | "time";
  status: "draft" | "demo" | "published";
  skipped?: boolean;
  phase?: "warmup" | "main" | "cooldown";
  pairKey?: string;
  transitionSeconds?: number;
}
export interface RecordedSet {
  drop?: DropSetResult;
  id: string;
  exerciseId: string;
  /** Stable order within an exercise; older cached facts may omit it. */
  setIndex?: number;
  reps: number | null;
  /** Absent on legacy records/ACKs. New timed records have null reps. */
  durationSeconds?: number | null;
  weightKg: number;
  completedAt: string;
}
export interface Workout {
  id: string;
  title: string;
  subtitle: string;
  estimatedMinutes: number;
  exercises: Exercise[];
  currentIndex: number;
  status: WorkoutStatus;
  revision: number;
  source?: { kind: "template" | "history" | "schedule"; id: string; revision: number };
  recordedSets: RecordedSet[];
  startedAt: string | null;
  completedAt: string | null;
  rewardKind?: RewardKind;
  rewardDay?: string;
  reward?: WorkoutReward;
  sourcePlannerRevision?: number;
  sourcePlannerDayKey?: string;
  /** Pinned at admission; never inferred from today's profile or the workout title. */
  energyActivity?: EnergyActivity;
  energyEstimate?: WorkoutEnergyEstimate;
  loadFeedback?: WorkoutLoadFeedback;
}
export interface Progress {
  xp: number;
  completedWorkouts: number;
  /** Server-confirmed distinct activity days; absent in older offline snapshots. */
  journey?: { activityDays: number };
  history: {
    id: string;
    title: string;
    completedAt: string;
    sets: number;
    xp: number;
    status?: WorkoutStatus;
    rewardDay?: string;
    rewardKind?: RewardKind;
    energyEstimate?: WorkoutEnergyEstimate;
  }[];
}
export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  createdAt: string;
}
export interface AccountState {
  profile: Profile;
  trial: Trial;
  progress: Progress;
}
export type SetCorrectionCommand =
  | { type: "correct_set"; setId: string; reps: number; weightKg: number; drop?: DropSetResult }
  | { type: "correct_timed_set"; setId: string; durationSeconds: number }
  | { type: "undo_set"; setId: string };
export type WorkoutCommand =
  | SetCorrectionCommand
  | { type: "lighten_remaining" }
  | { type: "replace_exercise"; exerciseId: string; revisionId: string }
  | {
      type: "record_set";
      exerciseId: string;
      setId: string;
      reps: number;
      weightKg: number;
      drop?: DropSetResult;
    }
  | { type: "record_timed_set"; exerciseId: string; setId: string; durationSeconds: number }
  | { type: "next_exercise" }
  | { type: "skip_exercise"; exerciseId: string }
  | ({ type: "estimate_energy" } & WorkoutEnergyInput)
  | { type: "rate_load"; feedback: WorkoutLoadFeedback }
  | { type: "end_early" }
  | { type: "finish" };
export interface CommandEnvelope {
  operationId: string;
  expectedRevision: number;
  command: WorkoutCommand;
}
export interface CommandAck {
  operationId: string;
  workout: Workout;
  progress: Progress;
}
export interface ApiError {
  error: { code: string; message: string };
}
export interface AuthConfig {
  emailPassword: boolean;
  providers: { yandex: boolean; vk: boolean };
  requireEmailVerification: boolean;
}
