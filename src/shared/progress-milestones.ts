import { JOURNEY_CHAPTERS } from "./journey-story";

export const ACHIEVEMENTS = [
  { id: "first", title: "Первый шаг", description: "Завершить первое занятие", goal: 1 },
  { id: "rhythm", title: "Снова в деле", description: "Завершить три занятия", goal: 3 },
  { id: "return", title: "Своя привычка", description: "Завершить десять занятий", goal: 10 },
] as const;

export interface ProgressMilestoneSnapshot {
  xp: number;
  completedWorkouts: number;
  activityDays?: number;
}
export const progressLevel = (xp: number) => Math.floor(Math.max(0, xp) / 500) + 1;
export function newProgressMilestones(
  before: ProgressMilestoneSnapshot,
  after: ProgressMilestoneSnapshot,
) {
  return {
    level: progressLevel(after.xp) > progressLevel(before.xp) ? progressLevel(after.xp) : null,
    achievements: ACHIEVEMENTS.filter(
      (item) => before.completedWorkouts < item.goal && after.completedWorkouts >= item.goal,
    ),
    chapters:
      before.activityDays === undefined || after.activityDays === undefined
        ? []
        : JOURNEY_CHAPTERS.filter(
            (item) => item.days > before.activityDays! && item.days <= after.activityDays!,
          ),
  };
}
