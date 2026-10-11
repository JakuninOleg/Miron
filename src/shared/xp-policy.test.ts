import { describe, expect, it } from "vitest";
import { dailyXpDelta, eligibleXp, rewardDay } from "./xp-policy";

describe("daily account XP policy", () => {
  it("uses a server Moscow date at the UTC boundary, independently of device timezone", () => {
    expect(rewardDay(new Date("2026-10-07T20:59:59Z"))).toBe("2026-10-07");
    expect(rewardDay(new Date("2026-10-07T21:00:00Z"))).toBe("2026-10-08");
  });
  it("distinguishes participation by the pinned role, not weights or elapsed time", () => {
    expect(eligibleXp("main", "completed")).toBe(50);
    expect(eligibleXp("main", "partial")).toBe(25);
    expect(eligibleXp("support", "completed")).toBe(20);
    expect(eligibleXp("support", "partial")).toBe(10);
    expect(eligibleXp("main", "aborted")).toBe(0);
  });
  it("tops up only the difference and does not let repetitions of a short session farm XP", () => {
    let awarded = dailyXpDelta(20, 0);
    for (let i = 0; i < 100; i++) awarded += dailyXpDelta(20, awarded);
    expect(awarded).toBe(20);
    awarded += dailyXpDelta(25, awarded);
    expect(awarded).toBe(25);
    awarded += dailyXpDelta(50, awarded);
    expect(awarded).toBe(50);
    expect(dailyXpDelta(50, awarded)).toBe(0);
    expect(dailyXpDelta(25, 50)).toBe(0);
  });
});
