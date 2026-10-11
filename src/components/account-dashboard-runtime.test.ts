import { describe, expect, it } from "vitest";
import type { Progress } from "@/shared/contracts";
import { dashboardAchievements, dashboardLevel } from "./account-dashboard-runtime";

describe("account dashboard progress", () => {
  it.each([
    [0, 1, 0],
    [499, 1, 499],
    [500, 2, 0],
    [1250, 3, 250],
    [10000, 21, 0],
  ])("displays %i confirmed XP as level %i with %i level XP", (xp, level, levelXp) => {
    expect(dashboardLevel(xp)).toEqual({ level, levelXp });
  });

  it("does not award milestones for XP, partial history, aborted sessions or unsynced facts", () => {
    const progress: Progress = {
      xp: 2500,
      completedWorkouts: 0,
      history: [
        {
          id: "partial",
          title: "Частичное занятие",
          completedAt: "2026-10-10T12:00:00Z",
          sets: 10,
          xp: 25,
          status: "partial",
        },
        {
          id: "aborted",
          title: "Отменённое занятие",
          completedAt: "2026-10-11T12:00:00Z",
          sets: 0,
          xp: 0,
          status: "aborted",
        },
      ],
    };
    expect(dashboardAchievements(progress).filter((item) => item.earned)).toEqual([]);
    expect(progress.completedWorkouts).toBe(0);
    expect(progress.xp).toBe(2500);
  });

  it.each([
    [0, []],
    [1, ["Первый шаг"]],
    [2, ["Первый шаг"]],
    [3, ["Первый шаг", "Снова в деле"]],
    [9, ["Первый шаг", "Снова в деле"]],
    [10, ["Первый шаг", "Снова в деле", "Своя привычка"]],
    [300, ["Первый шаг", "Снова в деле", "Своя привычка"]],
  ])(
    "uses confirmed completed count %i for existing account milestones",
    (completedWorkouts, earnedTitles) => {
      expect(
        dashboardAchievements({ xp: 0, completedWorkouts, history: [] })
          .filter((item) => item.earned)
          .map((item) => item.title),
      ).toEqual(earnedTitles);
    },
  );
});
