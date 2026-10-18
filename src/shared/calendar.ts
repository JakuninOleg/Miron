import type { SavedWorkoutPreview } from "./workout-sources";

export type CalendarSnapshot = Pick<
  SavedWorkoutPreview,
  "day" | "place" | "direction" | "rewardKind"
>;
export interface CalendarEntry {
  id: string;
  revision: number;
  date: string;
  timezone: string;
  status: "planned" | "skipped" | "cancelled" | "started";
  title: string;
  workoutId: string | null;
}
export function validCalendarDate(value: string): boolean {
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    value >= "2020-01-01" &&
    value <= "2100-12-31" &&
    Number.isFinite(Date.parse(`${value}T12:00:00Z`)) &&
    new Date(`${value}T12:00:00Z`).toISOString().slice(0, 10) === value
  );
}
