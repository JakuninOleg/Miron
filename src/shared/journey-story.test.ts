import { describe, expect, it } from "vitest";
import { JOURNEY_CHAPTERS, journeyState } from "./journey-story";

describe("account story chapters", () => {
  it.each([
    [0, "meeting", 1],
    [1, "first-route", 2],
    [3, "first-route", 2],
    [4, "own-trail", 3],
    [7, "own-trail", 3],
    [8, "further-together", 4],
    [900, "further-together", 4],
  ])("%i confirmed days selects %s", (days, id, count) => {
    const result = journeyState(days);
    expect(result.current.id).toBe(id);
    expect(result.available).toHaveLength(count);
    expect(result.next?.days ?? Infinity).toBeGreaterThan(days);
  });

  it.each([undefined, -1, NaN, Infinity, 1.5])("does not invent progress for %s", (days) => {
    expect(journeyState(days)).toMatchObject({ days: null, current: { id: "meeting" } });
    expect(journeyState(days).available).toHaveLength(1);
    expect(journeyState(days).next).toBeUndefined();
  });

  it("keeps chapter identities unique and thresholds increasing", () => {
    expect(new Set(JOURNEY_CHAPTERS.map((chapter) => chapter.id)).size).toBe(
      JOURNEY_CHAPTERS.length,
    );
    expect(JOURNEY_CHAPTERS.map((chapter) => chapter.days)).toEqual([0, 1, 4, 8]);
  });
});
