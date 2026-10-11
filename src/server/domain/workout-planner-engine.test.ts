import { describe, expect, it } from "vitest";
import strengthRows from "../../../data/catalog/strength.v1.json";
import additions from "../../../data/catalog/strength-additions.v2.json";
import calisthenicsRows from "../../../data/catalog/calisthenics.v2.json";
import flexibilityRows from "../../../data/catalog/flexibility.v1.json";
import overlay from "../../../data/catalog/editorial.v2.json";
import {
  PLANNER_ALL_GROUPS,
  PLANNER_SUPPORT_TEMPLATES,
} from "../../../data/workouts/planner-library";
import {
  MUSCLE_GROUPS,
  type CatalogEditorialOverlay,
  type CatalogSeedRow,
} from "../../shared/catalog-taxonomy";
import type { BuilderExercise } from "../../shared/workout-builder";
import type { PlannerHistory } from "../../shared/workout-planner";
import { CATALOG_SKILL_POLICY } from "../db/catalog-skill-policy";
import { parseCatalogResources } from "../db/catalog-consistency";
import { resourcesSatisfy } from "./catalog";
import {
  buildPlannerDraft,
  getPlannerReplacements,
  summarizePlannerHistory,
  type PlannerEngineInput,
} from "./workout-planner-engine";

const rows = [
  ...strengthRows,
  ...additions,
  ...calisthenicsRows,
  ...flexibilityRows,
] as CatalogSeedRow[];
const enrichment = overlay as Record<string, CatalogEditorialOverlay>;
function exerciseFromRow(row: CatalogSeedRow, index: number): BuilderExercise {
  const editorial = { ...row.editorial, ...enrichment[row.id] };
  return {
    variantId: row.id,
    revisionId: `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
    name: editorial.displayNameRu,
    metric: row.metric,
    resistanceMode: row.resistanceMode,
    difficulty: editorial.difficulty,
    primaryMuscles: row.muscles
      .filter((muscle) => muscle.role === "primary")
      .map((muscle) => ({ code: muscle.group, name: MUSCLE_GROUPS[muscle.group] })),
    secondaryMuscles: row.muscles
      .filter((muscle) => muscle.role === "secondary")
      .map((muscle) => ({ code: muscle.group, name: MUSCLE_GROUPS[muscle.group] })),
    equipment: [],
    instructions: editorial.cues,
    status: "draft",
    movementPattern: row.pattern,
    focusMode: editorial.focusMode,
    timing: {
      secondsPerRep: { min: 2, max: 4 },
      setupSeconds: { min: 5, max: 15 },
      sideSwitchSeconds: { min: 5, max: 10 },
      perSide: editorial.sideMode === "per_side",
    },
  };
}
const catalog = rows.map(exerciseFromRow);
function noEquipmentCatalog(place: "home" | "outdoor"): BuilderExercise[] {
  const facts = [
    { code: "floor", quantity: 1 },
    { code: "clear_space", quantity: 1 },
  ];
  return rows.flatMap((row, index) => {
    if (!row.editorial.contexts.includes(place)) return [];
    const requirements = [
      ...parseCatalogResources(row.equipmentRequirement).map((resource) => ({
        ...resource,
        requiresConfirmation: false,
      })),
      ...parseCatalogResources(row.supportRequirement).map((resource) => ({
        ...resource,
        requiresConfirmation: resource.code !== "floor",
      })),
      ...(row.spaceRequirement === "none"
        ? []
        : [{ code: "clear_space", quantity: 1, requiresConfirmation: false }]),
    ];
    return resourcesSatisfy(requirements, facts) ? [exerciseFromRow(row, index)] : [];
  });
}
const now = new Date("2026-10-10T12:00:00.000Z");
function input(): PlannerEngineInput {
  return {
    config: {
      mode: "program",
      place: "gym",
      direction: "strength",
      split: "fullbody",
      daysPerWeek: 2,
      intent: "maintain",
      durationMinutes: 60,
      execution: "straight",
      variety: "familiar",
    },
    catalog,
    preferences: { revision: 0, excludedVariantIds: [], favoriteVariantIds: [] },
    history: [],
    experience: "regular",
    previous: null,
    now,
  };
}
function history(
  variantId: string,
  endedAt = "2026-10-09T12:00:00.000Z",
  count = 1,
): PlannerHistory {
  const exercise = catalog.find((entry) => entry.variantId === variantId);
  if (!exercise) throw new Error("Fixture exercise absent");
  return {
    id: `history-${variantId}`,
    endedAt,
    status: "partial",
    programRevision: null,
    dayKey: null,
    sets: Array.from({ length: count }, () => ({
      variantId,
      reps: exercise.metric === "reps" ? 8 : null,
      durationSeconds: exercise.metric === "time" ? 20 : null,
      weightKg: 900,
      primaryMuscles: exercise.primaryMuscles.map((muscle) => muscle.code),
      secondaryMuscles: exercise.secondaryMuscles.map((muscle) => muscle.code),
    })),
  };
}
function mainSets(draft: ReturnType<typeof buildPlannerDraft>): number {
  return draft.days.reduce(
    (total, day) =>
      total +
      day.steps.filter((step) => step.phase === "main").reduce((sets, step) => sets + step.sets, 0),
    0,
  );
}

describe("curated planner library integrity", () => {
  it("contains only real IDs with the declared movement, metric, focus and exact primary roles", () => {
    for (const group of PLANNER_ALL_GROUPS)
      for (const id of group.variants) {
        const exercise = catalog.find((entry) => entry.variantId === id);
        expect(exercise, id).toBeDefined();
        expect(exercise?.movementPattern, id).toBe(group.pattern);
        expect(exercise?.focusMode, id).toBe(group.focus);
        expect(exercise?.metric, id).toBe(group.metric);
        expect(exercise?.primaryMuscles.map((muscle) => muscle.code).sort(), id).toEqual(
          [...group.primary].sort(),
        );
        expect(CATALOG_SKILL_POLICY[id]?.kind, id).not.toBe("movement");
      }
  });

  it.each(["stretch", "mobility", "yoga"] as const)(
    "offers at least four whole ordered %s sequences",
    (direction) => {
      const sequences = PLANNER_SUPPORT_TEMPLATES.filter(
        (template) => template.direction === direction,
      );
      expect(sequences.length).toBeGreaterThanOrEqual(4);
      for (const template of sequences) {
        const source = input();
        source.config = {
          ...source.config,
          mode: "single",
          direction,
          preferredTemplateId: template.id,
        };
        const draft = buildPlannerDraft(source);
        expect(draft.days[0].steps.map((step) => step.slotKey)).toEqual(
          template.slots.map((slot) => slot.key),
        );
        expect(draft.disclosure).toContain("Профессиональная проверка не проводилась");
      }
    },
  );
});

describe("deterministic workout planner", () => {
  it("offers a whole balanced beginner mobility flow with actual floor/clear-space seed requirements", () => {
    const source = input();
    source.config = {
      ...source.config,
      place: "home",
      direction: "mobility",
      mode: "single",
      preferredTemplateId: "mobility.floor",
    };
    source.experience = "beginner";
    source.catalog = noEquipmentCatalog("home");
    const draft = buildPlannerDraft(source);
    const day = draft.days[0];
    expect(day.sourceTemplateId).toBe("mobility.floor");
    expect(day.steps.map((step) => step.exercise.variantId)).toEqual([
      "mobility.shoulder_circle.standing",
      "mobility.hip_circle.standing",
      "mobility.wrist.quadruped_rock",
      "mobility.spinal_flexion_extension.quadruped",
      "mobility.adductor.quadruped_rock_back",
      "mobility.half_kneeling_rock.forward_back",
      "mobility.thoracic_rotation.side_lying",
      "mobility.pelvic_tilt.supine",
    ]);
    expect(
      day.steps.every(
        (step) => step.exercise.difficulty === "beginner" && step.exercise.focusMode === "mobility",
      ),
    ).toBe(true);
    expect(day.steps.every((step) => step.exercise.metric === "reps" && step.target > 0)).toBe(
      true,
    );
    expect(day.steps[0].phase).toBe("warmup");
    expect(day.steps.at(-1)?.phase).toBe("cooldown");
    expect(day.steps.filter((step) => step.exercise.timing.perSide).length).toBeGreaterThanOrEqual(
      2,
    );
    expect(day.steps.some((step) => step.exercise.movementPattern === "thoracic_rotation")).toBe(
      true,
    );
    expect(
      day.steps.some((step) => step.exercise.movementPattern === "hip_flexion_extension"),
    ).toBe(true);
    expect(
      day.steps.some((step) =>
        ["ankle_circle", "ankle_mobility"].includes(step.slotKey.split("_").slice(0, -1).join("_")),
      ),
    ).toBe(false);
  });

  it("selects mobility.floor automatically when home inventory has no confirmed chair or wall", () => {
    const source = input();
    source.config = { ...source.config, place: "home", direction: "mobility", daysPerWeek: 3 };
    source.experience = "beginner";
    source.catalog = noEquipmentCatalog("home");
    const draft = buildPlannerDraft(source);
    expect(draft.days).toHaveLength(3);
    expect(
      draft.days.every(
        (day) => day.sourceTemplateId === "mobility.floor" && day.steps.length === 8,
      ),
    ).toBe(true);
  });

  it.each(["start", "maintain", "develop"] as const)(
    "redistributes the same weekly main work over 2→3→4 days for %s",
    (intent) => {
      const totals = [2, 3, 4].map((daysPerWeek) => {
        const source = input();
        source.config = { ...source.config, intent, daysPerWeek };
        const draft = buildPlannerDraft(source);
        expect(draft.days).toHaveLength(daysPerWeek);
        expect(draft.days.every((day) => day.steps.some((step) => step.phase === "warmup"))).toBe(
          true,
        );
        if (daysPerWeek === 4)
          expect(
            Math.max(
              ...draft.days.map((day) =>
                day.steps
                  .filter((step) => step.phase === "main")
                  .reduce((sum, step) => sum + step.sets, 0),
              ),
            ),
          ).toBeLessThanOrEqual(10);
        return { total: mainSets(draft), byMuscle: draft.weeklyPrimarySets };
      });
      expect(totals[1]).toEqual(totals[0]);
      expect(totals[2]).toEqual(totals[0]);
    },
  );

  it("bounds one visit rather than putting the whole weekly quota in a single day", () => {
    const source = input();
    source.config.daysPerWeek = 1;
    source.config.intent = "develop";
    const draft = buildPlannerDraft(source);
    expect(mainSets(draft)).toBeLessThanOrEqual(15);
    expect(draft.notes.join(" ")).toContain("не компенсируется");
  });

  it.each([2, 3, 4])("builds explicit upper/lower cycles for %i days", (daysPerWeek) => {
    const source = input();
    source.config = { ...source.config, split: "upper_lower", daysPerWeek };
    expect(buildPlannerDraft(source).days.map((day) => day.sourceTemplateId)).toEqual(
      Array.from({ length: daysPerWeek }, (_, index) =>
        index % 2 === 0 ? "gym.upper.a" : "gym.lower.a",
      ),
    );
  });

  it("continues three-day upper/lower after a completed day but never advances from partial", () => {
    const source = input();
    source.config = { ...source.config, split: "upper_lower", daysPerWeek: 3 };
    source.previous = {
      revision: 1,
      confirmedAt: now.toISOString(),
      draft: buildPlannerDraft(source),
    };
    const last = history("strength.horizontal_press.machine");
    last.dayKey = "day-3";
    last.programRevision = 1;
    source.history = [last];
    expect(buildPlannerDraft(source).days[0].sourceTemplateId).toBe("gym.upper.a");
    last.status = "completed";
    expect(buildPlannerDraft(source).days[0].sourceTemplateId).toBe("gym.lower.a");
  });

  it("offers PPL as three sessions and explains that it is not a six-day cycle", () => {
    const source = input();
    source.config = { ...source.config, split: "push_pull_legs", daysPerWeek: 3 };
    const draft = buildPlannerDraft(source);
    expect(draft.days.map((day) => day.sourceTemplateId)).toEqual([
      "gym.push.a",
      "gym.pull.a",
      "gym.legs.a",
    ]);
    expect(draft.notes.join(" ")).toContain("не шестидневный");
    source.config.daysPerWeek = 4;
    expect(() => buildPlannerDraft(source)).toThrow("трёх занятий");
  });

  it("builds real home and calisthenics plans from available exact revisions", () => {
    const source = input();
    source.config.place = "home";
    const home = buildPlannerDraft(source);
    expect(home.days[0].sourceTemplateId).toBe("home.dumbbells.a");
    source.config.direction = "calisthenics";
    const bodyweight = buildPlannerDraft(source);
    expect(
      bodyweight.days
        .flatMap((day) => day.steps)
        .filter((step) => step.phase === "main")
        .every(
          (step) =>
            step.exercise.resistanceMode === "bodyweight" ||
            step.exercise.resistanceMode === "assisted_bodyweight",
        ),
    ).toBe(true);
  });

  it("keeps persistent exclusions and one-off omissions distinct without mutating preferences", () => {
    const source = input();
    source.preferences.excludedVariantIds = ["strength.horizontal_press.machine"];
    source.config.excludeVariantIds = ["strength.push_up.wall"];
    const before = structuredClone(source.preferences);
    const draft = buildPlannerDraft(source);
    expect(
      draft.days
        .flatMap((day) => day.steps)
        .some((step) =>
          ["strength.horizontal_press.machine", "strength.push_up.wall"].includes(
            step.exercise.variantId,
          ),
        ),
    ).toBe(false);
    expect(source.preferences).toEqual(before);
    expect(source.preferences.excludedVariantIds).not.toContain("strength.push_up.wall");
  });

  it("uses only recorded positive work for partial/aborted sessions and ignores future rows", () => {
    const partial = history("strength.squat.bodyweight");
    partial.sets.push({ ...partial.sets[0], reps: 0, durationSeconds: null });
    const stopped = history("strength.push_up.wall");
    stopped.status = "aborted";
    const future = history("strength.row.machine", "2026-10-11T12:00:00.000Z", 50);
    const summary = summarizePlannerHistory([partial, stopped, future], now);
    expect(summary.confirmedSets).toBe(2);
    expect(summary.recentPrimaryMuscles).toEqual(["chest", "quads"]);
  });

  it("excludes identified preparatory and cooldown sets from confirmed main work", () => {
    const performed = history("strength.squat.bodyweight");
    const records: PlannerHistory[] = [
      {
        ...performed,
        sets: [
          { ...performed.sets[0], phase: "warmup" },
          { ...performed.sets[0], phase: "cooldown" },
          { ...performed.sets[0], phase: "main" },
        ],
      },
    ];
    expect(summarizePlannerHistory(records, now).confirmedSets).toBe(1);
  });

  it("gives a one-off session a different priority after actual recent lower-body work", () => {
    const source = input();
    source.config.mode = "single";
    const fresh = buildPlannerDraft(source);
    source.history = [
      history("strength.squat.bodyweight", undefined, 8),
      history("strength.glute_bridge.bodyweight", undefined, 8),
      history("strength.calf_raise.standing_bodyweight", undefined, 8),
    ];
    const next = buildPlannerDraft(source);
    expect(next.days[0].sourceTemplateId).toBe("gym.upper.a");
    expect(next.days[0].sourceTemplateId).not.toBe(fresh.days[0].sourceTemplateId);
    expect(next.notes.join(" ")).toContain("фактическая работа");
  });

  it("returns conservatively after a pause and never transfers historical kilograms", () => {
    const source = input();
    source.config.intent = "develop";
    source.history = [history("strength.squat.bodyweight", "2026-08-01T12:00:00.000Z", 8)];
    const draft = buildPlannerDraft(source);
    expect(draft.historySummary.returningAfterPause).toBe(true);
    expect(mainSets(draft)).toBe(20);
    expect(
      draft.days
        .flatMap((day) => day.steps)
        .every((step) => step.exercise.difficulty === "beginner" && !("weightKg" in step)),
    ).toBe(true);
    expect(draft.notes.join(" ")).toContain("автоматически не продолжается");
  });

  it("offers replacements only with the same exact movement and primary focus", () => {
    const source = input();
    const options = getPlannerReplacements({
      ...source,
      dayKey: "day-1",
      slotKey: "vertical_pull",
    });
    expect(options.length).toBeGreaterThan(0);
    for (const option of options) {
      const exercise = catalog.find((entry) => entry.variantId === option.variantId);
      expect(exercise?.movementPattern).toBe("vertical_pull");
      expect(exercise?.focusMode).toBe("loading");
      expect(exercise?.primaryMuscles.map((muscle) => muscle.code)).toEqual(["back"]);
    }
    expect(options.some((option) => option.variantId === "strength.row.machine")).toBe(false);
    source.config.replacements = [
      { dayKey: "day-1", slotKey: "vertical_pull", variantId: "strength.row.machine" },
    ];
    expect(() => buildPlannerDraft(source)).toThrow("Замена не подходит");
  });

  it("does not assign skill mastery or advanced variants even if supplied and favorited", () => {
    const source = input();
    source.preferences.favoriteVariantIds = [
      "strength.front_lever.tuck_hold",
      "strength.pistol_squat.full",
    ];
    expect(
      buildPlannerDraft(source)
        .days.flatMap((day) => day.steps)
        .every(
          (step) =>
            CATALOG_SKILL_POLICY[step.exercise.variantId]?.kind !== "movement" &&
            step.exercise.difficulty !== "advanced",
        ),
    ).toBe(true);
  });

  it("keeps the ordinary gym gap explicit rather than replacing missing pulling work with any back tag", () => {
    const source = input();
    source.catalog = source.catalog.filter(
      (exercise) =>
        exercise.movementPattern !== "horizontal_pull" &&
        exercise.movementPattern !== "vertical_pull",
    );
    expect(() => buildPlannerDraft(source)).toThrow("нет цельного совместимого");
  });

  it.each(["home", "outdoor"] as const)(
    "offers explicit partial coverage for real %s inventory with only floor and clear space",
    (place) => {
      const source = input();
      source.config.place = place;
      source.config.intent = "start";
      source.experience = "beginner";
      source.catalog = noEquipmentCatalog(place);
      expect(
        source.catalog.some((exercise) =>
          ["horizontal_pull", "vertical_pull"].includes(exercise.movementPattern ?? ""),
        ),
      ).toBe(false);
      const draft = buildPlannerDraft(source);
      for (const day of draft.days) {
        expect(day.title).toContain("Ноги, жим и корпус");
        expect(day.title).not.toContain("Всё тело");
        expect(day.sourceTemplateId).toContain(".without-pull");
        expect(day.warnings.join(" ")).toContain("Нет тяги и основной работы для спины");
        expect(day.warnings.join(" ")).toContain("неполный охват тела");
        expect(day.warnings.join(" ")).toContain("гантель");
        expect(day.steps.filter((step) => step.phase === "main")).toHaveLength(4);
        expect(
          day.steps.filter((step) => step.phase === "main").every((step) => step.sets === 2),
        ).toBe(true);
        expect(
          day.steps
            .filter((step) => step.phase === "main")
            .some((step) => step.exercise.primaryMuscles.some((muscle) => muscle.code === "back")),
        ).toBe(false);
      }
      expect(mainSets(draft)).toBe(16);
      expect(draft.weeklyPrimarySets.some((entry) => entry.muscle === "back")).toBe(false);
    },
  );

  it("does not compensate omitted pulling work when frequency changes", () => {
    const source = input();
    source.config.place = "home";
    source.catalog = noEquipmentCatalog("home");
    const totals = [2, 3, 4].map((daysPerWeek) => {
      source.config.daysPerWeek = daysPerWeek;
      const draft = buildPlannerDraft(source);
      expect(
        draft.days.every((day) =>
          day.warnings.some((warning) => warning.includes("неполный охват тела")),
        ),
      ).toBe(true);
      return mainSets(draft);
    });
    expect(totals).toEqual([24, 24, 24]);
  });

  it("shows the same explicit coverage warning when adapting a preferred home fullbody source", () => {
    const source = input();
    source.config.place = "home";
    source.config.preferredTemplateId = "home.dumbbells.a";
    source.catalog = noEquipmentCatalog("home");
    const draft = buildPlannerDraft(source);
    expect(draft.days[0].sourceTemplateId).toBe("home.dumbbells.a.without-pull");
    expect(draft.days[0].warnings.join(" ")).toContain("неполный охват тела");
    expect(draft.config.preferredTemplateId).toBe("home.dumbbells.a");
  });

  it("keeps other critical missing coverage strict even in a home fallback", () => {
    const source = input();
    source.config.place = "home";
    source.catalog = noEquipmentCatalog("home").filter(
      (exercise) => exercise.movementPattern !== "horizontal_push",
    );
    expect(() => buildPlannerDraft(source)).toThrow("нет цельного совместимого");
  });

  it("does not omit a pull silently when all otherwise available pulls were explicitly excluded", () => {
    const source = input();
    source.config.place = "home";
    source.preferences.excludedVariantIds = source.catalog
      .filter((exercise) =>
        ["horizontal_pull", "vertical_pull"].includes(exercise.movementPattern ?? ""),
      )
      .map((exercise) => exercise.variantId);
    expect(() => buildPlannerDraft(source)).toThrow("нет цельного совместимого");
  });

  it("does not use missing or changed revision semantics as an equivalent substitute", () => {
    const source = input();
    source.catalog = source.catalog.map((exercise) => ({
      ...exercise,
      movementPattern: undefined,
    }));
    expect(() => buildPlannerDraft(source)).toThrow("нет цельного совместимого");
  });

  it("creates contiguous equal-set disjoint pairs with proper recovery and no final extra round", () => {
    const source = input();
    source.config.execution = "pairs";
    const draft = buildPlannerDraft(source);
    let pairs = 0;
    for (const day of draft.days)
      for (let index = 0; index < day.steps.length; index++) {
        const step = day.steps[index];
        if (!step.pairKey || day.steps[index - 1]?.pairKey === step.pairKey) continue;
        const other = day.steps[index + 1];
        expect(other.pairKey).toBe(step.pairKey);
        expect(other.sets).toBe(step.sets);
        expect(step.restSeconds).toBeGreaterThanOrEqual(60);
        const muscles = new Set(
          [...step.exercise.primaryMuscles, ...step.exercise.secondaryMuscles].map(
            (muscle) => muscle.code,
          ),
        );
        expect(
          [...other.exercise.primaryMuscles, ...other.exercise.secondaryMuscles].some((muscle) =>
            muscles.has(muscle.code),
          ),
        ).toBe(false);
        pairs++;
      }
    expect(pairs).toBeGreaterThan(0);
  });

  it("keeps strength anchors stable while allowing different accessories, and never reshuffles on reload", () => {
    const source = input();
    const first = buildPlannerDraft(source);
    expect(buildPlannerDraft(source)).toEqual(first);
    source.previous = { revision: 1, confirmedAt: now.toISOString(), draft: first };
    source.config.variety = "different";
    const changed = buildPlannerDraft(source);
    for (const day of first.days) {
      const revised = changed.days.find((entry) => entry.key === day.key);
      expect(
        revised?.steps
          .filter((step) => step.phase === "main")
          .slice(0, 3)
          .map((step) => step.exercise.variantId),
      ).toEqual(
        day.steps
          .filter((step) => step.phase === "main")
          .slice(0, 3)
          .map((step) => step.exercise.variantId),
      );
    }
    expect(changed.changes.length).toBeGreaterThan(0);
  });

  it("compares future program revisions without editing history or the previous snapshot", () => {
    const source = input();
    source.previous = {
      revision: 1,
      confirmedAt: now.toISOString(),
      draft: buildPlannerDraft(source),
    };
    source.history = [history("strength.squat.bodyweight")];
    const previous = structuredClone(source.previous);
    const records = structuredClone(source.history);
    source.config.daysPerWeek = 3;
    const draft = buildPlannerDraft(source);
    expect(
      draft.changes.find((change) => change.label === "Частота будущих занятий")?.after,
    ).toContain("3 дня");
    expect(source.previous).toEqual(previous);
    expect(source.history).toEqual(records);
  });

  it("keeps new yoga as a whole sequence and fails rather than pruning it to fit a tiny budget", () => {
    const source = input();
    source.config = {
      ...source.config,
      mode: "single",
      direction: "yoga",
      preferredTemplateId: "yoga.general",
      durationMinutes: 20,
    };
    const first = buildPlannerDraft(source);
    expect(
      getPlannerReplacements({
        ...source,
        dayKey: "single",
        slotKey: first.days[0].steps[1].slotKey,
      }),
    ).toEqual([]);
    source.config.durationMinutes = 5;
    expect(() => buildPlannerDraft(source)).toThrow("последовательность не обрезана");
    expect(first.days[0].steps).toHaveLength(9);
  });

  it("chooses a different complete yoga sequence after an explicit variety request", () => {
    const source = input();
    source.config = { ...source.config, mode: "single", direction: "yoga" };
    const first = buildPlannerDraft(source);
    source.previous = { revision: 1, confirmedAt: now.toISOString(), draft: first };
    source.config.variety = "different";
    const next = buildPlannerDraft(source);
    expect(next.days[0].sourceTemplateId).not.toBe(first.days[0].sourceTemplateId);
    const sequence = PLANNER_SUPPORT_TEMPLATES.find(
      (template) => template.id === next.days[0].sourceTemplateId,
    );
    expect(next.days[0].steps.map((step) => step.slotKey)).toEqual(
      sequence?.slots.map((slot) => slot.key),
    );
  });

  it("rejects a forged request to replace just one yoga posture", () => {
    const source = input();
    source.config = {
      ...source.config,
      mode: "single",
      direction: "yoga",
      replacements: [
        { dayKey: "single", slotKey: "corpse_6", variantId: "yoga.legs_up_wall.standard" },
      ],
    };
    expect(() => buildPlannerDraft(source)).toThrow("отдельные асаны не подменяются");
  });
});
