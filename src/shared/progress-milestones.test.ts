import { describe, expect, it } from "vitest";
import { newProgressMilestones } from "./progress-milestones";
describe("confirmed progress milestones", () => {
  it("separates level, completed achievements and days of story", () => {
    const result = newProgressMilestones(
      { xp: 480, completedWorkouts: 2, activityDays: 3 },
      { xp: 530, completedWorkouts: 3, activityDays: 4 },
    );
    expect(result.level).toBe(2);
    expect(result.achievements.map((x) => x.id)).toEqual(["rhythm"]);
    expect(result.chapters.map((x) => x.id)).toEqual(["own-trail"]);
  });
  it("does not invent an unlock on reload, rating, unknown days or duplicate ACK", () => {
    const state = { xp: 500, completedWorkouts: 3 };
    expect(newProgressMilestones(state, state)).toEqual({
      level: null,
      achievements: [],
      chapters: [],
    });
  });
  it("does not claim a new chapter when an old offline baseline has no day count", () => {
    expect(
      newProgressMilestones(
        { xp: 0, completedWorkouts: 0 },
        { xp: 20, completedWorkouts: 1, activityDays: 1 },
      ).chapters,
    ).toEqual([]);
  });
});
