import { afterEach, describe, expect, it, vi } from "vitest";
import { preparedSafety } from "./policy";
import { validateReportedEnergy } from "./tools";
import { assistantDailyIntentLimit } from "./repository";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("independent beta boundaries", () => {
  it("defaults the global intent cap to 200 and rejects unbounded configuration", () => {
    vi.stubEnv("AI_DAILY_INTENT_LIMIT", undefined);
    expect(assistantDailyIntentLimit()).toBe(200);
    vi.stubEnv("AI_DAILY_INTENT_LIMIT", "10000");
    expect(assistantDailyIntentLimit()).toBe(10000);
    for (const invalid of ["0", "10001", "1.5", "unbounded"]) {
      vi.stubEnv("AI_DAILY_INTENT_LIMIT", invalid);
      expect(() => assistantDailyIntentLimit()).toThrow();
    }
  });
  it("blocks explicit minor/medical/pain context before external transmission", () => {
    expect(preparedSafety("Привет, мне 17 лет, нужен план")).toContain("18 лет");
    expect(preparedSafety("У меня диабет, составь программу")).toContain(
      "медицинского специалиста",
    );
    expect(preparedSafety("Болит колено, замени присед")).toContain("Прекрати нагрузку");
    expect(preparedSafety("После паузы нет мотивации тренироваться")).toBeNull();
  });
  it("requires directly reported units/numbers for energy proposal", () => {
    const workoutId = "d9e835ff-7ecf-4c12-9f55-131e002a4bda";
    expect(() =>
      validateReportedEnergy("У меня было 80 минут", { workoutId, bodyWeightKg: 80 }),
    ).toThrow();
    expect(() =>
      validateReportedEnergy("Моя масса 80,5 кг", { workoutId, bodyWeightKg: 80.5 }),
    ).not.toThrow();
    expect(() =>
      validateReportedEnergy("Сделал 2 подхода по 12", {
        workoutId,
        workload: [{ exerciseId: workoutId, sets: 3, repsPerSet: 12 }],
      }),
    ).toThrow();
    expect(() =>
      validateReportedEnergy("Сделал 2 подхода по 12", {
        workoutId,
        workload: [{ exerciseId: workoutId, sets: 2, repsPerSet: 12 }],
      }),
    ).not.toThrow();
  });
});
