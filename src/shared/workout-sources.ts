import type { CatalogContext, CatalogDirection } from "./catalog-taxonomy";
import type { PlannerDay } from "./workout-planner";
import type { RewardKind } from "./contracts";

export interface SavedWorkoutSource {
  source: "template" | "history" | "schedule";
  id: string;
}
export interface SavedWorkoutPreview extends SavedWorkoutSource {
  revision: number;
  place: CatalogContext;
  direction: CatalogDirection;
  rewardKind: RewardKind;
  day: PlannerDay;
}
export interface SavedWorkoutStart extends SavedWorkoutSource {
  operationId: string;
  expectedSourceRevision: number;
}
