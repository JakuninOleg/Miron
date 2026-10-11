import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import type {
  CatalogEditorialOverlay,
  CatalogSeedRow,
  SkillGraphDraft,
} from "../src/shared/catalog-taxonomy";
import {
  canEditCatalogDraft,
  CATALOG_RESOURCE_LABELS,
  loadCatalogSeed,
  loadSkillGraphs,
  mergeCatalogOverlay,
  validateCatalogRows,
} from "../src/server/db/catalog-input";
import {
  assertSkillGraphCoverage,
  validateSkillGraphs,
} from "../src/server/db/catalog-consistency";

function fixture(): CatalogSeedRow {
  return {
    id: "strength.curl.hammer",
    familyId: "strength.curl",
    familyNameRu: "Сгибание рук",
    aliasEn: "Hammer curl",
    discipline: "strength",
    pattern: "elbow_flexion",
    resistanceMode: "external_load",
    metric: "reps",
    equipmentRequirement: "dumbbell:2",
    supportRequirement: "none",
    spaceRequirement: "standing_clear_non_slip",
    editorial: {
      skillDemand: {
        kind: "none",
        requiresPriorSkill: false,
        rationale: "Обычное силовое движение без отдельного предварительного двигательного навыка.",
      },
      workoutRoles: ["accessory"],
      purposes: ["strength", "hypertrophy"],
      canonical: true,
      discoveryPriority: 90,
      priorityBasis: "editorial",
      searchKeywords: ["руки", "бицепс"],
      execution: {
        addedLoad: "required",
        assistance: "none",
        countSemantics: "total_reps",
        repetitionUnit: "movement",
        assignmentGate: "standard_review",
      },
      displayNameRu: "Молот",
      formalNameRu: "Сгибание рук с гантелями нейтральным хватом",
      aliases: ["Молотки", "Hammer curl"],
      contexts: ["home", "gym", "outdoor", "workout_park"],
      directions: ["strength"],
      difficulty: "beginner",
      sideMode: "bilateral",
      focusMode: "loading",
      cues: ["Держи локти рядом с корпусом."],
      mistakes: ["Раскачивание корпуса."],
      optionalEquipment: "none",
      sourceRefs: ["https://www.acefitness.org/resources/everyone/exercise-library/"],
      reviewStatus: "pending_expert_review",
      relations: { alternatives: [], regressions: [], progressions: [], status: "draft" },
    },
    muscles: [
      { group: "biceps", role: "primary" },
      { group: "forearms", role: "secondary" },
    ],
  };
}

describe("Editorial catalogue input boundaries", () => {
  it("accepts short names, multiple places and primary/secondary emphasis", () => {
    expect(validateCatalogRows([fixture()])[0].editorial.displayNameRu).toBe("Молот");
  });
  it("rejects duplicate IDs and conflicting family labels", () => {
    const row = fixture();
    expect(() => validateCatalogRows([row, row])).toThrow("Duplicate catalog variant");
    expect(() =>
      validateCatalogRows([
        row,
        { ...row, id: "strength.curl.standard", familyNameRu: "Иное семейство" },
      ]),
    ).toThrow("Conflicting catalog family");
  });
  it("preserves historical identities rather than silently reassigning or dropping them", () => {
    expect(() =>
      validateCatalogRows(
        [fixture()],
        [{ id: "strength.curl.hammer", familyId: "strength.other" }],
      ),
    ).toThrow("Historic variant");
    expect(() =>
      validateCatalogRows(
        [fixture()],
        [{ id: "strength.curl.hammer", familyId: "strength.curl", metric: "time" }],
      ),
    ).toThrow("metric cannot change");
    expect(() =>
      validateCatalogRows(
        [fixture()],
        [{ id: "strength.curl.missing", familyId: "strength.curl" }],
      ),
    ).toThrow("Historic variant");
  });
  it("rejects self relations and references to absent variants", () => {
    const row = fixture();
    row.editorial.relations.alternatives = [row.id];
    expect(() => validateCatalogRows([row])).toThrow();
    row.editorial.relations.alternatives = ["strength.curl.missing"];
    expect(() => validateCatalogRows([row])).toThrow("Unknown relation");
  });
  it("rejects ambiguous muscle roles and missing emphasis outside relaxation", () => {
    const row = fixture();
    row.muscles.push({ group: "biceps", role: "secondary" });
    expect(() => validateCatalogRows([row])).toThrow();
    row.muscles = [{ group: "biceps", role: "secondary" }];
    expect(() => validateCatalogRows([row])).toThrow();
    row.muscles = [];
    row.editorial.focusMode = "relaxation";
    expect(validateCatalogRows([row])).toHaveLength(1);
  });
  it("rejects negative or zero resource quantities, duplicate tags and approved content", () => {
    expect(() =>
      validateCatalogRows([{ ...fixture(), equipmentRequirement: "dumbbell:0" }]),
    ).toThrow();
    expect(() =>
      validateCatalogRows([{ ...fixture(), equipmentRequirement: "dumbbell:-1" }]),
    ).toThrow();
    const row = fixture();
    row.editorial.contexts = ["home", "home"];
    expect(() => validateCatalogRows([row])).toThrow();
    expect(() =>
      validateCatalogRows([
        { ...fixture(), editorial: { ...fixture().editorial, reviewStatus: "approved" } },
      ]),
    ).toThrow();
  });
  it("does not allow a draft seed to edit an approved, retired or revoked revision", () => {
    expect(canEditCatalogDraft("draft", ["draft", "draft"])).toBe(true);
    for (const status of ["published", "retired", "revoked"]) {
      expect(canEditCatalogDraft(status, ["draft"])).toBe(false);
      expect(canEditCatalogDraft("draft", ["draft", status])).toBe(false);
    }
  });
  it("loads 300 draft cards and their manual skill graphs without publishing them", async () => {
    const rows = await loadCatalogSeed();
    expect(rows).toHaveLength(300);
    expect(rows.some((row) => row.editorial.displayNameRu === "Молот")).toBe(true);
    expect(rows.some((row) => row.editorial.contexts.includes("outdoor"))).toBe(true);
    expect(rows.some((row) => row.editorial.contexts.includes("workout_park"))).toBe(true);
    expect(rows.every((row) => row.editorial.reviewStatus === "pending_expert_review")).toBe(true);
    const graphs = await loadSkillGraphs(rows);
    expect(graphs.length).toBeGreaterThan(0);
    expect(
      graphs.every(
        (graph) => graph.status === "draft" && graph.reviewStatus === "pending_expert_review",
      ),
    ).toBe(true);
    expect(rows.find((row) => row.id === "strength.pull_up.neutral_grip")?.resistanceMode).toBe(
      "bodyweight",
    );
    for (const row of rows) {
      for (const value of [row.equipmentRequirement, row.supportRequirement]) {
        for (const token of value.split(";").filter((code) => code !== "none")) {
          const rawCode = token.split(":")[0];
          const code = rawCode === "floor_support" ? "floor" : rawCode;
          expect(CATALOG_RESOURCE_LABELS[code], `Russian resource label for ${code}`).toBeTruthy();
        }
      }
    }
  });
  it("requires an overlay for every baseline card and rejects unrelated overlay IDs", () => {
    const row = fixture();
    const overlay = overlayFixture();
    const base = withoutEnrichment(row);
    expect(() => mergeCatalogOverlay([base], {})).toThrow("Missing catalog overlay");
    expect(() =>
      mergeCatalogOverlay([base], { [row.id]: overlay, "strength.curl.unknown": overlay }),
    ).toThrow("Unknown catalog overlay");
  });
  it("preserves renamed search aliases and consumes helper fields instead of persisting them", () => {
    const row = fixture();
    const overlay = {
      ...overlayFixture(),
      displayNameRu: "Молот с гантелями",
      additionalAliases: ["Молотки", "Хаммер"],
    };
    const merged = mergeCatalogOverlay([withoutEnrichment(row)], { [row.id]: overlay });
    expect(merged[0].editorial.aliases).toEqual(["Молотки", "Hammer curl", "Молот", "Хаммер"]);
    expect(merged[0].editorial).not.toHaveProperty("additionalAliases");
    expect(validateCatalogRows(merged)[0].editorial.canonical).toBe(true);
    expect(merged[0].editorial.reviewStatus).toBe("pending_expert_review");
  });
  it("retains every v1 ID and family alongside the extension", async () => {
    const rows = await loadCatalogSeed();
    const baseline = [
      JSON.parse(await readFile("data/catalog/strength.v1.json", "utf8")) as unknown,
      JSON.parse(await readFile("data/catalog/flexibility.v1.json", "utf8")) as unknown,
    ];
    const overlay = JSON.parse(await readFile("data/catalog/editorial.v2.json", "utf8")) as unknown;
    const baseRows = mergeCatalogOverlay(baseline.flat(), overlay);
    expect(baseRows).toHaveLength(200);
    const byId = new Map(rows.map((row) => [row.id, row]));
    for (const row of baseRows)
      expect(byId.get(row.id)).toMatchObject({ familyId: row.familyId, metric: row.metric });
  });
  it("preserves the immutable v1 catalogue and graph snapshots", async () => {
    const snapshots = {
      "data/catalog/strength.v1.json":
        "64ec3ea2a18eebc1ba4ecf0ec4a9d6fee893f7ff234e3977d6c935d64f0ea8c1",
      "data/catalog/flexibility.v1.json":
        "c92a90166d24c7de5f6f05c96d8eb8fd82b6605789275cd99b7cee43ca4b8e61",
      "data/catalog/skill-graphs.v1.json":
        "df53a13680903f74feb08a1014d48d85d8ce101343a99972fd38dfbb7113864b",
      "data/catalog/seed-exercises.v0.csv":
        "d2005b6d89db3f247d085fff67cf53b2340301eab6f0352cb71f55344ea8b675",
    };
    for (const [path, digest] of Object.entries(snapshots))
      expect(
        createHash("sha256")
          .update(await readFile(path))
          .digest("hex"),
        path,
      ).toBe(digest);
  });
  it("overrides reviewed focus metadata without changing a v1 source row", () => {
    const base = withoutEnrichment(fixture());
    const merged = mergeCatalogOverlay([base], {
      [fixture().id]: { ...overlayFixture(), focusMode: "balance" },
    });
    expect(merged[0].editorial.focusMode).toBe("balance");
    expect(base).toMatchObject({ editorial: { focusMode: "loading" } });
  });
});

function overlayFixture(): CatalogEditorialOverlay {
  const editorial = fixture().editorial;
  return {
    skillDemand: editorial.skillDemand,
    workoutRoles: editorial.workoutRoles,
    purposes: editorial.purposes,
    canonical: editorial.canonical,
    discoveryPriority: editorial.discoveryPriority,
    priorityBasis: editorial.priorityBasis,
    searchKeywords: editorial.searchKeywords,
    execution: editorial.execution,
  };
}

function withoutEnrichment(row: CatalogSeedRow): unknown {
  const enrichment = new Set(Object.keys(overlayFixture()));
  return {
    ...row,
    editorial: Object.fromEntries(
      Object.entries(row.editorial).filter(([key]) => !enrichment.has(key)),
    ),
  };
}

function skillFixture(rows: CatalogSeedRow[]): SkillGraphDraft {
  return {
    code: "calisthenics.front_lever",
    nameRu: "Черновой навык",
    revision: 2,
    status: "draft",
    reviewStatus: "pending_expert_review",
    sourceRefs: ["https://www.acefitness.org/resources/everyone/exercise-library/"],
    nodes: rows.map((row, index) => ({
      id: `node_${index}`,
      variantId: row.id,
      skillGroup: "front_lever",
      prerequisiteMode: "all",
      assessment: "manual_coach_review",
      assessmentNotes: [
        "Тренер проверяет контроль исполнения вручную; автоматического порога нет.",
      ],
    })),
    edges: [],
  };
}

function demandFixture(id: string, kind: "preparation" | "movement"): CatalogSeedRow {
  const row = fixture();
  row.id = id;
  row.familyId = id.slice(0, id.lastIndexOf("."));
  row.familyNameRu = "Учебный двигательный навык";
  row.resistanceMode = "bodyweight";
  row.equipmentRequirement = "none";
  row.metric = "time";
  row.editorial.sideMode = "none";
  row.editorial.skillDemand =
    kind === "movement"
      ? {
          kind,
          requiresPriorSkill: true,
          rationale:
            "Это техническое движение требует отдельного контроля предварительного навыка тренером.",
        }
      : {
          kind,
          requiresPriorSkill: false,
          rationale:
            "Это доступный подготовительный компонент реального пути к двигательному навыку.",
        };
  row.editorial.workoutRoles = ["skill"];
  row.editorial.purposes = ["skill"];
  row.editorial.execution.addedLoad = "none";
  row.editorial.execution.countSemantics = "total_seconds";
  row.editorial.execution.repetitionUnit = "not_applicable";
  row.editorial.execution.assignmentGate = kind === "movement" ? "skill_review" : "standard_review";
  return row;
}

function movementFixtures(): CatalogSeedRow[] {
  return [
    demandFixture("strength.front_lever.tuck_hold", "movement"),
    demandFixture("strength.front_lever.full_hold", "movement"),
  ];
}

describe("Catalogue semantic consistency", () => {
  it("catches neutral-grip pull-up classified as external load without an added weight", () => {
    const row = fixture();
    row.equipmentRequirement = "neutral_grip_pull_up_bar";
    row.supportRequirement = "verified_secure_bar_mounting";
    expect(() => validateCatalogRows([row])).toThrow("resistance_external");
    row.resistanceMode = "bodyweight";
    row.editorial.execution.addedLoad = "none";
    expect(validateCatalogRows([row])).toHaveLength(1);
  });
  it("distinguishes assistance machines and fixture-only apparatus from resistance machines", () => {
    const row = fixture();
    row.equipmentRequirement = "assisted_pull_up_machine";
    row.supportRequirement = "machine_integrated_support";
    row.resistanceMode = "assisted_bodyweight";
    row.editorial.execution.addedLoad = "none";
    row.editorial.execution.assistance = "counterweight";
    expect(validateCatalogRows([row])).toHaveLength(1);
    row.resistanceMode = "machine_load";
    expect(() => validateCatalogRows([row])).toThrow("resistance_machine");
    row.equipmentRequirement = "back_extension_bench";
    row.supportRequirement = "verified_stable_exercise_machine";
    row.resistanceMode = "bodyweight";
    row.editorial.execution.assistance = "none";
    expect(validateCatalogRows([row])).toHaveLength(1);
  });
  it("rejects normalized required/optional collisions and resource kind mistakes", () => {
    const row = fixture();
    row.editorial.optionalEquipment = "dumbbell:1";
    expect(() => validateCatalogRows([row])).toThrow("required_optional");
    row.editorial.optionalEquipment = "none";
    row.equipmentRequirement = "floor_support";
    expect(() => validateCatalogRows([row])).toThrow("resource_position");
    row.equipmentRequirement = "unknown_load";
    expect(() => validateCatalogRows([row])).toThrow("known_resource");
    row.equipmentRequirement = "dumbbell:2";
    row.supportRequirement = "floor_support";
    row.editorial.optionalEquipment = "floor";
    expect(() => validateCatalogRows([row])).toThrow("required_optional");
  });
  it("allows optional external load only when the bodyweight draft explicitly declares it", () => {
    const row = fixture();
    row.equipmentRequirement = "none";
    row.resistanceMode = "bodyweight";
    row.editorial.execution.addedLoad = "optional";
    expect(() => validateCatalogRows([row])).toThrow("optional_load");
    row.editorial.optionalEquipment = "dumbbell:1";
    expect(validateCatalogRows([row])).toHaveLength(1);
    row.editorial.execution.addedLoad = "none";
    expect(() => validateCatalogRows([row])).toThrow("optional_load");
  });
  it("requires seconds and explicit per-side or alternating repetition semantics", () => {
    const row = fixture();
    row.metric = "time";
    row.editorial.sideMode = "per_side";
    expect(() => validateCatalogRows([row])).toThrow("count_semantics");
    row.editorial.execution.countSemantics = "per_side_seconds";
    row.editorial.execution.repetitionUnit = "not_applicable";
    expect(validateCatalogRows([row])).toHaveLength(1);
    row.metric = "reps";
    row.editorial.sideMode = "alternating";
    row.editorial.execution.countSemantics = "total_reps";
    row.editorial.execution.repetitionUnit = "left_right_pair";
    expect(validateCatalogRows([row])).toHaveLength(1);
    row.editorial.sideMode = "bilateral";
    expect(() => validateCatalogRows([row])).toThrow("repetition_unit");
  });
  it("keeps ordinary advanced strength independent from skill admission", () => {
    const row = fixture();
    row.editorial.difficulty = "advanced";
    expect(validateCatalogRows([row])[0].editorial.execution.assignmentGate).toBe(
      "standard_review",
    );
    row.editorial.execution.assignmentGate = "skill_review";
    expect(() => validateCatalogRows([row])).toThrow("skill_gate");
  });
  it("requires an explicit consistent skill demand rather than inferring it from training tags", () => {
    const row = fixture();
    row.editorial.workoutRoles = ["skill"];
    expect(() => validateCatalogRows([row])).toThrow("skill_tag");
    row.editorial.workoutRoles = ["main"];
    row.editorial.skillDemand = {
      kind: "movement",
      requiresPriorSkill: true,
      rationale: "Проверить предыдущий технический навык.",
    };
    expect(() => validateCatalogRows([row])).toThrow("skill_gate");
    row.editorial.execution.assignmentGate = "skill_review";
    expect(() => validateCatalogRows([row])).toThrow("skill_policy");
    expect(() =>
      validateCatalogRows([
        {
          ...row,
          editorial: {
            ...row.editorial,
            skillDemand: { ...row.editorial.skillDemand, requiresPriorSkill: false },
          },
        },
      ]),
    ).toThrow();
    expect(() =>
      validateCatalogRows([
        {
          ...row,
          editorial: {
            ...row.editorial,
            skillDemand: { ...row.editorial.skillDemand, rationale: "  " },
          },
        },
      ]),
    ).toThrow();
  });
  it("guards technical movements by stable ID even after a display-name or difficulty change", () => {
    const row = movementFixtures()[0];
    row.editorial.displayNameRu = "Простое движение";
    row.editorial.difficulty = "beginner";
    row.editorial.workoutRoles = ["main"];
    row.editorial.purposes = ["strength"];
    expect(validateCatalogRows([row])[0].editorial.execution.assignmentGate).toBe("skill_review");
    row.editorial.skillDemand = {
      kind: "none",
      requiresPriorSkill: false,
      rationale: "Ошибочно снято требование навыка.",
    };
    row.editorial.execution.assignmentGate = "standard_review";
    expect(() => validateCatalogRows([row])).toThrow("skill_policy");
  });
  it.each([
    "strength.handstand.freestanding_hold",
    "strength.handstand.chest_to_wall_hold",
    "strength.handstand.back_to_wall_hold",
    "strength.handstand_push_up.strict_wall",
    "strength.muscle_up.strict_bar",
    "strength.muscle_up.strict_rings",
    "strength.front_lever.full_hold",
    "strength.back_lever.tuck_hold",
    "strength.planche.tuck_parallettes",
    "strength.l_sit.full_floor",
    "strength.l_sit.full_parallettes",
    "strength.l_sit.full_rings",
  ])("rejects a silent skill downgrade for the registered technical variant %s", (id) => {
    const row = demandFixture(id, "movement");
    expect(validateCatalogRows([row])).toHaveLength(1);
    row.editorial.skillDemand = {
      kind: "none",
      requiresPriorSkill: false,
      rationale: "Ошибочная попытка заменить навык обычным силовым движением.",
    };
    row.editorial.workoutRoles = ["main"];
    row.editorial.purposes = ["strength"];
    row.editorial.execution.assignmentGate = "standard_review";
    expect(() => validateCatalogRows([row])).toThrow("skill_policy");
  });
  it("requires movement graph coverage without treating graph membership as admission", () => {
    const rows = movementFixtures();
    expect(() => validateSkillGraphs([skillFixture([rows[0]])], rows)).toThrow(
      "missing from active draft graph",
    );
    expect(validateSkillGraphs([skillFixture(rows)], rows)).toHaveLength(1);
  });
  it("keeps the exported coverage guard fail closed on a gate/demand mismatch", () => {
    const row = fixture();
    row.editorial.execution.assignmentGate = "skill_review";
    expect(() => assertSkillGraphCoverage([], [row])).toThrow("skill_gate");
    const movement = movementFixtures()[0];
    expect(() => assertSkillGraphCoverage([], [movement])).toThrow(
      "missing from active draft graph",
    );
    movement.editorial.execution.assignmentGate = "standard_review";
    expect(() => assertSkillGraphCoverage([skillFixture([movement])], [movement])).toThrow(
      "skill_gate",
    );
    movement.editorial.execution.assignmentGate = "skill_review";
    const fake = skillFixture([movement]);
    fake.code = "strength.technique_review";
    expect(() => assertSkillGraphCoverage([fake], [movement])).toThrow(
      "Unregistered active skill graph",
    );
    const legPress = { ...fixture(), id: "strength.leg_press.single_leg_machine" };
    expect(() =>
      assertSkillGraphCoverage([skillFixture([legPress, movement])], [legPress, movement]),
    ).toThrow("Invalid semantic graph membership");
  });
  it("keeps the two ordinary advanced strength variants standard with no fabricated skill graph", async () => {
    const rows = await loadCatalogSeed();
    for (const id of ["strength.squat.barbell_front", "strength.leg_press.single_leg_machine"]) {
      const row = rows.find((candidate) => candidate.id === id);
      expect(row, id).toBeDefined();
      expect(row?.editorial.skillDemand.kind, id).toBe("none");
      expect(row?.editorial.execution.assignmentGate, id).toBe("standard_review");
      expect(row?.editorial.workoutRoles, id).not.toContain("skill");
      expect(row?.editorial.purposes, id).not.toContain("skill");
    }
    const graphs = await loadSkillGraphs(rows);
    expect(graphs.map((graph) => graph.code)).not.toContain("strength.technique_review");
    expect(graphs.every((graph) => graph.revision === 2)).toBe(true);
  });
  it("keeps discovery priority editorial and rejects duplicate roles or unsupported popularity claims", () => {
    const row = fixture();
    row.editorial.workoutRoles = ["accessory", "accessory"];
    expect(() => validateCatalogRows([row])).toThrow("Duplicate classification");
    row.editorial.workoutRoles = ["accessory"];
    expect(() =>
      validateCatalogRows([
        { ...row, editorial: { ...row.editorial, priorityBasis: "measured_popularity" } },
      ]),
    ).toThrow();
    expect(() =>
      validateCatalogRows([{ ...row, editorial: { ...row.editorial, popularity: 100 } }]),
    ).toThrow();
  });
  it("bounds keyword enrichment at 48 unique phrases while keeping aliases at 24", () => {
    const row = fixture();
    row.editorial.searchKeywords = Array.from(
      { length: 48 },
      (_, index) => `Поисковое слово ${index}`,
    );
    expect(validateCatalogRows([row])).toHaveLength(1);
    row.editorial.searchKeywords.push("Дополнительная фраза");
    expect(() => validateCatalogRows([row])).toThrow();
    row.editorial.searchKeywords = ["Бицепс", "Бицепс"];
    expect(() => validateCatalogRows([row])).toThrow("Duplicate search keywords");
    row.editorial.searchKeywords = ["Руки"];
    row.editorial.aliases = Array.from({ length: 25 }, (_, index) => `Алиас ${index}`);
    expect(() => validateCatalogRows([row])).toThrow();
  });
  it("rejects cyclic editorial progressions without turning difficulty labels into mastery thresholds", () => {
    const first = fixture();
    const second = structuredClone(first);
    second.id = "strength.curl.second";
    first.editorial.relations.progressions = [second.id];
    second.editorial.relations.progressions = [first.id];
    expect(() => validateCatalogRows([first, second])).toThrow("progression_dag");
    second.editorial.relations.progressions = [];
    expect(validateCatalogRows([first, second])).toHaveLength(2);
  });
});

describe("Draft skill graph integrity", () => {
  const sourceRefs = ["https://www.acefitness.org/resources/everyone/exercise-library/"];
  it("rejects absent variants, graph-local endpoints, duplicate edges and self-loops", () => {
    const rows = movementFixtures();
    const graph = skillFixture(rows);
    graph.nodes[0].variantId = "strength.curl.absent";
    expect(() => validateSkillGraphs([graph], rows)).toThrow("Unknown skill variant");
    graph.nodes[0].variantId = rows[0].id;
    graph.edges = [{ from: "other_graph.node", to: "node_1", kind: "prerequisite", sourceRefs }];
    expect(() => validateSkillGraphs([graph], rows)).toThrow("Unknown skill edge endpoint");
    graph.edges = [{ from: "node_0", to: "node_0", kind: "prerequisite", sourceRefs }];
    expect(() => validateSkillGraphs([graph], rows)).toThrow("Skill self-loop");
    graph.edges = [
      { from: "node_0", to: "node_1", kind: "preparation", sourceRefs },
      { from: "node_0", to: "node_1", kind: "preparation", sourceRefs },
    ];
    expect(() => validateSkillGraphs([graph], rows)).toThrow("Duplicate skill edge");
  });
  it("checks prerequisite cycles while keeping preparation outside admission requirements", () => {
    const rows = movementFixtures();
    const graph = skillFixture(rows);
    graph.edges = [
      { from: "node_0", to: "node_1", kind: "prerequisite", sourceRefs },
      { from: "node_1", to: "node_0", kind: "preparation", sourceRefs },
    ];
    graph.nodes[1].prerequisiteMode = "any";
    expect(validateSkillGraphs([graph], rows)[0].nodes[1].prerequisiteMode).toBe("any");
    graph.edges[1].kind = "prerequisite";
    expect(() => validateSkillGraphs([graph], rows)).toThrow("Cyclic skill prerequisites");
  });
  it("keeps all/any explicit and permits only manual assessments without invented mastery thresholds", () => {
    const rows = movementFixtures();
    const graph = skillFixture(rows);
    graph.nodes[1].prerequisiteMode = "any";
    const parsed = validateSkillGraphs([graph], rows);
    expect(parsed[0].nodes.map((node) => node.prerequisiteMode)).toEqual(["all", "any"]);
    expect(() =>
      validateSkillGraphs(
        [{ ...graph, nodes: [{ ...graph.nodes[0], prerequisiteMode: "majority" }] }],
        rows,
      ),
    ).toThrow();
    graph.nodes[0].assessmentNotes = [];
    expect(() => validateSkillGraphs([graph], rows)).toThrow();
    graph.nodes[0].assessmentNotes = ["Проверка тренером."];
    expect(() =>
      validateSkillGraphs([{ ...graph, automaticMasteryThreshold: 10 }], rows),
    ).toThrow();
  });
  it("accepts skill-only preparation as standard only when it leads to a genuine technical target", () => {
    const preparation = demandFixture("strength.handstand.elevated_l_support", "preparation");
    const movement = demandFixture("strength.handstand.freestanding_hold", "movement");
    const rows = [preparation, movement];
    expect(validateCatalogRows(rows)[0].editorial.execution.assignmentGate).toBe("standard_review");
    const graph = skillFixture(rows);
    graph.code = "calisthenics.handstand_wall_path";
    graph.edges = [{ from: "node_0", to: "node_1", kind: "preparation", sourceRefs }];
    expect(validateSkillGraphs([graph], rows)).toHaveLength(1);
    preparation.editorial.execution.assignmentGate = "skill_review";
    expect(() => validateCatalogRows(rows)).toThrow("skill_gate");
    preparation.editorial.execution.assignmentGate = "standard_review";
    graph.edges = [];
    expect(() => validateSkillGraphs([graph], rows)).toThrow("Preparation cannot reach");
    expect(() => validateSkillGraphs([{ ...graph, nodes: [graph.nodes[1]] }], rows)).toThrow(
      "missing from active draft graph",
    );
  });
  it("rejects preparation-only fake graphs and unrelated conditioning inserted into a real skill graph", () => {
    const preparation = demandFixture("strength.handstand.elevated_l_support", "preparation");
    const graph = skillFixture([preparation]);
    graph.code = "calisthenics.handstand_wall_path";
    expect(() => validateSkillGraphs([graph], [preparation])).toThrow(
      "no actual gated movement target",
    );
    const movement = movementFixtures()[0];
    const legPress = { ...fixture(), id: "strength.leg_press.single_leg_machine" };
    legPress.editorial.displayNameRu = "Подготовка к переднему вису";
    const fake = skillFixture([legPress, movement]);
    fake.edges = [{ from: "node_0", to: "node_1", kind: "preparation", sourceRefs }];
    expect(() => validateSkillGraphs([fake], [legPress, movement])).toThrow(
      "Invalid semantic graph membership",
    );
    fake.code = "strength.technique_review";
    expect(() => validateSkillGraphs([fake], [legPress, movement])).toThrow(
      "Unregistered active skill graph",
    );
  });
});
