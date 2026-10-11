import type { RewardKind, WorkoutStatus } from "./contracts";

export const XP_POLICY_VERSION = "daily-v1" as const;
export const XP_TIMEZONE = "Europe/Moscow" as const;
export const DAILY_XP_LIMIT = 50;

/** Reward day is pinned at server admission, never derived from client completion time. */
export function rewardDay(at: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: XP_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(at);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)!.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}

export function eligibleXp(kind: RewardKind, status: WorkoutStatus): number {
  if (status === "completed") return kind === "main" ? 50 : 20;
  if (status === "partial") return kind === "main" ? 25 : 10;
  return 0;
}

/** A second activity can improve the day's award, never add another full award. */
export function dailyXpDelta(eligible: number, already: number): number {
  if (!Number.isInteger(eligible) || !Number.isInteger(already) || eligible < 0 || already < 0)
    throw new Error("Invalid daily XP values");
  return Math.max(0, Math.min(DAILY_XP_LIMIT, eligible) - Math.min(DAILY_XP_LIMIT, already));
}

export function isTerminalWorkout(status: WorkoutStatus): boolean {
  return status === "completed" || status === "partial" || status === "aborted";
}
