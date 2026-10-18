import { describe, expect, it } from "vitest";
import { validCalendarDate } from "./calendar";
describe("calendar dates", () => {
  it("accepts real ISO days and rejects normalized or invalid dates without throwing", () => {
    for (const value of ["2026-10-18", "2024-02-29"]) expect(validCalendarDate(value)).toBe(true);
    for (const value of ["2026-02-31", "2026-99-99", "2025-02-29", "2026-1-1", "", "2200-01-01"])
      expect(validCalendarDate(value)).toBe(false);
  });
});
