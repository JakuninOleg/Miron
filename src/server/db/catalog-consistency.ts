import { z } from "zod";
import type { CatalogSeedRow, SkillGraphDraft } from "../../shared/catalog-taxonomy";
import {
  CATALOG_SKILL_POLICY,
  VALID_SKILL_GRAPH_CODES,
  type ValidSkillGraphCode,
} from "./catalog-skill-policy";

type LoadMechanism =
  | "free_weight"
  | "elastic_resistance"
  | "machine_resistance"
  | "band_assistance"
  | "counterweight_assistance"
  | "fixture";

// The mechanism is explicit. A machine can supply resistance, assistance, or only a support.
export const RESOURCE_LOAD_REGISTRY: Readonly<Record<string, LoadMechanism>> = {
  dumbbell: "free_weight",
  barbell: "free_weight",
  barbell_with_plates_and_collars: "free_weight",
  kettlebell: "free_weight",
  ez_bar: "free_weight",
  ez_bar_with_plates_and_collars: "free_weight",
  plates: "free_weight",
  water_bottle: "free_weight",
  filled_water_bottle: "free_weight",
  backpack: "free_weight",
  resistance_band: "elastic_resistance",
  assistance_band: "band_assistance",
  assisted_pull_up_machine: "counterweight_assistance",
  assisted_dip_machine: "counterweight_assistance",
  cable_station: "machine_resistance",
  cable_station_with_handle: "machine_resistance",
  chest_press_machine: "machine_resistance",
  dual_cable_station_with_handles: "machine_resistance",
  high_cable_station_with_bar: "machine_resistance",
  high_cable_station_with_handle: "machine_resistance",
  high_cable_station_with_rope: "machine_resistance",
  hip_abduction_machine: "machine_resistance",
  lat_pulldown_machine_with_bar: "machine_resistance",
  lat_pulldown_machine_with_neutral_handle: "machine_resistance",
  leg_extension_machine: "machine_resistance",
  leg_press_machine: "machine_resistance",
  low_cable_station_with_ankle_cuff: "machine_resistance",
  low_cable_station_with_bar: "machine_resistance",
  low_cable_station_with_handle: "machine_resistance",
  lying_leg_curl_machine: "machine_resistance",
  pec_deck_machine: "machine_resistance",
  reverse_pec_deck_machine: "machine_resistance",
  seated_cable_row_station_with_handle: "machine_resistance",
  seated_calf_raise_machine: "machine_resistance",
  seated_leg_curl_machine: "machine_resistance",
  seated_row_machine: "machine_resistance",
  shoulder_press_machine: "machine_resistance",
  smith_machine: "machine_resistance",
  pull_up_bar: "fixture",
  neutral_grip_pull_up_bar: "fixture",
  low_horizontal_exercise_bar: "fixture",
  parallel_bars: "fixture",
  gymnastic_rings: "fixture",
  suspension_trainer: "fixture",
  back_extension_bench: "fixture",
  parallettes: "fixture",
  sliders: "fixture",
  nordic_foot_anchor: "fixture",
  leg_press_machine_single_leg_compatible: "machine_resistance",
  leg_extension_machine_single_leg_compatible: "machine_resistance",
  seated_leg_curl_machine_single_leg_compatible: "machine_resistance",
  leg_press_machine_calf_raise_compatible: "machine_resistance",
};

const SUPPORT_CODES = new Set([
  "floor",
  "stable_bench",
  "bench",
  "bench_press_station_with_safeties",
  "incline_bench_press_station_with_safeties",
  "machine_integrated_seat_and_backrest",
  "machine_integrated_seat_and_foot_support",
  "machine_integrated_seat_and_pads",
  "machine_integrated_seat_and_platform",
  "machine_integrated_seat_and_thigh_pad",
  "machine_integrated_support",
  "preacher_bench",
  "secured_stable_bench",
  "secured_stable_exercise_bench",
  "solid_doorframe",
  "solid_wall",
  "squat_rack_with_safeties",
  "stable_adjustable_bench",
  "stable_balance_support",
  "stable_bench_with_backrest",
  "stable_exercise_chair",
  "stable_exercise_step",
  "stable_flat_bench",
  "verified_resistance_band_anchor",
  "verified_secure_bar_mounting",
  "verified_stable_exercise_machine",
  "verified_suspension_anchor",
  "chair",
  "stable_chair",
  "stable_step",
  "secure_anchor",
  "flat_non_slip_surface",
  "verified_secure_ring_anchor",
  "verified_stable_parallettes",
  "verified_secure_nordic_anchor",
  "stable_padded_knee_support",
]);

const SPACE_CODES = new Set([
  "clear_space",
  "bar_and_body_length_clear",
  "barbell_and_bench_clear",
  "barbell_clearance_non_slip",
  "bench_and_body_length_clear",
  "bench_and_kneeling_clear",
  "bench_and_load_clear",
  "cable_operating_clearance",
  "chair_and_leg_length_clear",
  "clear_hanging_area",
  "doorway_and_standing_clear_non_slip",
  "floor_and_bench_clear",
  "floor_body_and_arm_span_clear",
  "floor_body_and_leg_clear",
  "floor_body_and_limbs_clear",
  "floor_body_and_load_clear",
  "floor_body_length_clear",
  "floor_leg_span_clear",
  "kneeling_body_length_clear",
  "kneeling_leg_and_arm_span_clear",
  "kneeling_leg_span_clear",
  "kneeling_lunge_and_arm_span_clear",
  "kneeling_lunge_clear",
  "machine_operating_clearance",
  "quadruped_clear",
  "seated_clear",
  "seated_leg_and_arm_span_clear",
  "seated_leg_span_clear",
  "seated_overhead_load_clear",
  "standing_arm_span_clear",
  "standing_clear_non_slip",
  "standing_forward_fold_clear_non_slip",
  "standing_lateral_lunge_clear_non_slip",
  "standing_leg_and_arm_span_clear",
  "standing_load_clear_non_slip",
  "standing_lunge_and_arm_span_clear",
  "standing_lunge_clear_non_slip",
  "standing_overhead_clear",
  "standing_overhead_load_clear",
  "step_area_non_slip",
  "suspension_and_body_length_clear",
  "walking_path_clear_non_slip",
  "wall_and_arm_span_clear",
  "wall_and_body_length_clear",
  "wall_and_floor_body_length_clear",
  "wall_and_lunge_clear_non_slip",
  "wall_and_standing_clear_non_slip",
  "clear_hanging_and_turning_area",
  "wall_and_handstand_clear",
  "ring_and_body_length_clear",
  "floor_sliding_clear",
]);

type RequirementKind = "equipment" | "support" | "space";
interface ResourceToken {
  code: string;
  quantity: number;
}
export function parseCatalogResources(value: string): ResourceToken[] {
  if (value === "none") return [];
  return value.split(";").map((token) => {
    const [code, quantity = "1"] = token.split(":");
    return { code: code === "floor_support" ? "floor" : code, quantity: Number(quantity) };
  });
}

export interface CatalogConsistencyIssue {
  variantId: string;
  rule: string;
  message: string;
}

function skillDemandIssues(row: CatalogSeedRow): CatalogConsistencyIssue[] {
  const issues: CatalogConsistencyIssue[] = [];
  const issue = (rule: string, message: string) =>
    issues.push({ variantId: row.id, rule, message });
  const demand = row.editorial.skillDemand;
  const policy = CATALOG_SKILL_POLICY[row.id];
  if (demand.requiresPriorSkill !== (demand.kind === "movement"))
    issue("skill_demand", "Only movement demand can require a prior skill");
  const expectedGate =
    demand.kind === "movement" && demand.requiresPriorSkill ? "skill_review" : "standard_review";
  if (row.editorial.execution.assignmentGate !== expectedGate)
    issue(
      "skill_gate",
      `Declared skill demand requires ${expectedGate}; difficulty and training tags do not decide admission`,
    );
  if (policy ? demand.kind !== policy.kind : demand.kind !== "none")
    issue(
      "skill_policy",
      policy
        ? `Stable variant requires skillDemand.kind=${policy.kind}`
        : "Preparation and movement require explicit stable-ID policy registration",
    );
  if (
    demand.kind === "none" &&
    (row.editorial.workoutRoles.includes("skill") || row.editorial.purposes.includes("skill"))
  )
    issue("skill_tag", "Skill training tags require an explicit preparation or movement demand");
  return issues;
}

export function collectCatalogConsistencyIssues(
  rows: CatalogSeedRow[],
  labels: Record<string, string>,
): CatalogConsistencyIssue[] {
  const issues: CatalogConsistencyIssue[] = [];
  const kindsByCode = new Map<string, RequirementKind>();
  for (const row of rows) {
    const issue = (rule: string, message: string) =>
      issues.push({ variantId: row.id, rule, message });
    const required = new Set<string>();
    const requiredMechanisms = new Set<LoadMechanism>();
    for (const [value, kind] of [
      [row.equipmentRequirement, "equipment"],
      [row.supportRequirement, "support"],
      [row.spaceRequirement, "space"],
    ] as const) {
      for (const resource of parseCatalogResources(value)) {
        const code = kind === "space" ? "clear_space" : resource.code;
        if (
          !Number.isInteger(resource.quantity) ||
          resource.quantity <= 0 ||
          resource.quantity > 999
        )
          issue("resource_quantity", `Invalid positive quantity for ${resource.code}`);
        if (kind === "space" ? !SPACE_CODES.has(resource.code) : !labels[code])
          issue("known_resource", `Unknown ${kind} resource: ${resource.code}`);
        if (
          (kind === "support" && !SUPPORT_CODES.has(code)) ||
          (kind === "equipment" && SUPPORT_CODES.has(code))
        )
          issue("resource_position", `${code} is not a declared ${kind} resource`);
        if (required.has(code))
          issue("unique_requirement", `Repeated normalized required resource: ${code}`);
        required.add(code);
        const previousKind = kindsByCode.get(code);
        if (previousKind && previousKind !== kind)
          issue("resource_kind", `${code} has both ${previousKind} and ${kind} positions`);
        kindsByCode.set(code, kind);
        const mechanism = RESOURCE_LOAD_REGISTRY[resource.code];
        if (mechanism && kind === "equipment") requiredMechanisms.add(mechanism);
      }
    }
    const optionalMechanisms = new Set<LoadMechanism>();
    for (const resource of parseCatalogResources(row.editorial.optionalEquipment)) {
      if (!labels[resource.code])
        issue("known_resource", `Unknown optional resource: ${resource.code}`);
      if (required.has(resource.code))
        issue("required_optional", `${resource.code} is both required and optional`);
      if (!Number.isInteger(resource.quantity) || resource.quantity <= 0 || resource.quantity > 999)
        issue("resource_quantity", `Invalid optional quantity for ${resource.code}`);
      const mechanism = RESOURCE_LOAD_REGISTRY[resource.code];
      if (mechanism) optionalMechanisms.add(mechanism);
    }
    const execution = row.editorial.execution;
    const hasExternal =
      requiredMechanisms.has("free_weight") || requiredMechanisms.has("elastic_resistance");
    const hasMachineLoad = requiredMechanisms.has("machine_resistance");
    const hasBandHelp = requiredMechanisms.has("band_assistance");
    const hasCounterweight = requiredMechanisms.has("counterweight_assistance");
    if (
      row.resistanceMode === "external_load" &&
      (!hasExternal ||
        hasMachineLoad ||
        hasBandHelp ||
        hasCounterweight ||
        execution.addedLoad !== "required" ||
        execution.assistance !== "none")
    )
      issue(
        "resistance_external",
        "external_load requires declared free weight/elastic resistance, addedLoad=required and no assistance",
      );
    if (
      row.resistanceMode === "machine_load" &&
      (!hasMachineLoad ||
        hasExternal ||
        hasBandHelp ||
        hasCounterweight ||
        execution.assistance !== "none" ||
        execution.addedLoad !== "required")
    )
      issue(
        "resistance_machine",
        "machine_load requires a resistance machine with addedLoad=required and no assistance",
      );
    if (
      row.resistanceMode === "assisted_bodyweight" &&
      (hasExternal ||
        hasMachineLoad ||
        execution.addedLoad !== "none" ||
        !(
          (execution.assistance === "band" && hasBandHelp && !hasCounterweight) ||
          (execution.assistance === "counterweight" && hasCounterweight && !hasBandHelp)
        ))
    )
      issue(
        "resistance_assisted",
        "assisted_bodyweight requires matching mandatory band or counterweight assistance",
      );
    if (row.resistanceMode === "bodyweight") {
      if (
        hasExternal ||
        hasMachineLoad ||
        hasBandHelp ||
        hasCounterweight ||
        execution.assistance !== "none" ||
        execution.addedLoad === "required"
      )
        issue(
          "resistance_bodyweight",
          "bodyweight cannot require external resistance or band/counterweight assistance",
        );
      const optionalLoad =
        optionalMechanisms.has("free_weight") || optionalMechanisms.has("elastic_resistance");
      if ((execution.addedLoad === "optional") !== optionalLoad)
        issue(
          "optional_load",
          "Optional added load must agree with a declared optional load resource",
        );
    }
    const perSide = row.editorial.sideMode === "per_side";
    const expectedCount =
      row.metric === "time"
        ? perSide
          ? "per_side_seconds"
          : "total_seconds"
        : perSide
          ? "per_side_reps"
          : "total_reps";
    if (execution.countSemantics !== expectedCount)
      issue("count_semantics", `${row.metric}/${row.editorial.sideMode} requires ${expectedCount}`);
    if ((row.metric === "time") !== (execution.repetitionUnit === "not_applicable"))
      issue(
        "repetition_unit",
        "Time uses seconds with not_applicable; reps require a declared movement or pair unit",
      );
    if (
      row.metric === "reps" &&
      row.editorial.sideMode !== "alternating" &&
      execution.repetitionUnit !== "movement"
    )
      issue("repetition_unit", "left_right_pair is only valid for alternating repetitions");
    issues.push(...skillDemandIssues(row));
    const bothRelations = row.editorial.relations.regressions.filter((id) =>
      row.editorial.relations.progressions.includes(id),
    );
    if (bothRelations.length)
      issue(
        "relation_direction",
        `Same variant is regression and progression: ${bothRelations.join(", ")}`,
      );
  }
  const progressionMap = new Map(rows.map((row) => [row.id, row.editorial.relations.progressions]));
  const cycle = findCycle(progressionMap);
  if (cycle)
    issues.push({
      variantId: cycle[0],
      rule: "progression_dag",
      message: `Cyclic progression: ${cycle.join(" -> ")}`,
    });
  return issues;
}

export function assertCatalogConsistency(
  rows: CatalogSeedRow[],
  labels: Record<string, string>,
): void {
  const issues = collectCatalogConsistencyIssues(rows, labels);
  if (issues.length)
    throw new Error(
      `Catalog consistency failed (${issues.length}):\n${issues
        .slice(0, 30)
        .map((issue) => `${issue.variantId} [${issue.rule}] ${issue.message}`)
        .join("\n")}`,
    );
}

function findCycle(adjacency: Map<string, string[]>): string[] | undefined {
  const visited = new Set<string>();
  const active = new Set<string>();
  const path: string[] = [];
  const visit = (node: string): string[] | undefined => {
    if (active.has(node)) return [...path.slice(path.indexOf(node)), node];
    if (visited.has(node)) return undefined;
    active.add(node);
    path.push(node);
    for (const target of adjacency.get(node) ?? []) {
      const cycle = visit(target);
      if (cycle) return cycle;
    }
    path.pop();
    active.delete(node);
    visited.add(node);
    return undefined;
  };
  for (const node of adjacency.keys()) {
    const cycle = visit(node);
    if (cycle) return cycle;
  }
  return undefined;
}

const key = z
  .string()
  .min(1)
  .max(160)
  .regex(/^[a-z][a-z0-9_]*(?:\.[a-z0-9_]+)*$/);
const variantId = z
  .string()
  .min(3)
  .max(160)
  .regex(/^[a-z][a-z0-9_]*(?:\.[a-z0-9_]+)+$/);
const sourceRefs = z
  .array(z.url().refine((url) => new URL(url).protocol === "https:"))
  .min(1)
  .max(10)
  .refine((refs) => new Set(refs).size === refs.length);
export const skillGraphSchema = z.strictObject({
  code: key,
  nameRu: z.string().trim().min(1).max(150),
  revision: z.int().min(1).max(10000),
  status: z.literal("draft"),
  reviewStatus: z.literal("pending_expert_review"),
  sourceRefs,
  nodes: z
    .array(
      z.strictObject({
        id: key,
        variantId,
        skillGroup: key,
        prerequisiteMode: z.enum(["all", "any"]),
        assessment: z.literal("manual_coach_review"),
        assessmentNotes: z.array(z.string().trim().min(1).max(1000)).min(1).max(8),
      }),
    )
    .min(1)
    .max(300),
  edges: z
    .array(
      z.strictObject({
        from: key,
        to: key,
        kind: z.enum(["prerequisite", "preparation"]),
        sourceRefs,
      }),
    )
    .max(2000),
});

export function validateSkillGraphs(input: unknown, rows: CatalogSeedRow[]): SkillGraphDraft[] {
  const graphs = z.array(skillGraphSchema).min(1).max(40).parse(input);
  const variants = new Map(rows.map((row) => [row.id, row]));
  const demandErrors = rows.flatMap(skillDemandIssues);
  if (demandErrors.length)
    throw new Error(
      `Skill demand consistency failed: ${demandErrors.map((issue) => `${issue.variantId} [${issue.rule}] ${issue.message}`).join("; ")}`,
    );
  const graphCodes = new Set<string>();
  for (const graph of graphs) {
    if (!(VALID_SKILL_GRAPH_CODES as readonly string[]).includes(graph.code))
      throw new Error(`Unregistered active skill graph: ${graph.code}`);
    if (graphCodes.has(graph.code)) throw new Error(`Duplicate skill graph: ${graph.code}`);
    graphCodes.add(graph.code);
    const nodeIds = new Set<string>();
    for (const node of graph.nodes) {
      if (nodeIds.has(node.id)) throw new Error(`Duplicate skill node ${node.id} in ${graph.code}`);
      nodeIds.add(node.id);
      if (!variants.has(node.variantId))
        throw new Error(`Unknown skill variant ${node.variantId} in ${graph.code}`);
      if (
        !CATALOG_SKILL_POLICY[node.variantId]?.allowedGraphCodes.includes(
          graph.code as ValidSkillGraphCode,
        )
      )
        throw new Error(`Invalid semantic graph membership: ${node.variantId} in ${graph.code}`);
    }
    const edgeKeys = new Set<string>();
    const prerequisites = new Map(graph.nodes.map((node) => [node.id, [] as string[]]));
    for (const edge of graph.edges) {
      if (!nodeIds.has(edge.from) || !nodeIds.has(edge.to))
        throw new Error(`Unknown skill edge endpoint in ${graph.code}: ${edge.from} -> ${edge.to}`);
      if (edge.from === edge.to) throw new Error(`Skill self-loop in ${graph.code}: ${edge.from}`);
      const edgeKey = `${edge.from}:${edge.to}:${edge.kind}`;
      if (edgeKeys.has(edgeKey))
        throw new Error(`Duplicate skill edge in ${graph.code}: ${edgeKey}`);
      edgeKeys.add(edgeKey);
      if (edge.kind === "prerequisite") prerequisites.get(edge.from)?.push(edge.to);
    }
    const cycle = findCycle(prerequisites);
    if (cycle)
      throw new Error(`Cyclic skill prerequisites in ${graph.code}: ${cycle.join(" -> ")}`);
    if (
      !graph.nodes.some(
        (node) => variants.get(node.variantId)?.editorial.skillDemand.kind === "movement",
      )
    )
      throw new Error(`Skill graph has no actual gated movement target: ${graph.code}`);
  }
  assertSkillGraphCoverage(graphs, rows);
  return graphs;
}

export function assertSkillGraphCoverage(graphs: SkillGraphDraft[], rows: CatalogSeedRow[]): void {
  const demandErrors = rows.flatMap(skillDemandIssues);
  if (demandErrors.length)
    throw new Error(
      `Skill demand consistency failed: ${demandErrors.map((issue) => `${issue.variantId} [${issue.rule}] ${issue.message}`).join("; ")}`,
    );
  const variants = new Map(rows.map((row) => [row.id, row]));
  const covered = new Set<string>();
  const targetReachable = new Set<string>();
  for (const graph of graphs) {
    if (!(VALID_SKILL_GRAPH_CODES as readonly string[]).includes(graph.code))
      throw new Error(`Unregistered active skill graph: ${graph.code}`);
    for (const node of graph.nodes) {
      if (!variants.has(node.variantId))
        throw new Error(`Unknown skill variant ${node.variantId} in ${graph.code}`);
      if (
        !CATALOG_SKILL_POLICY[node.variantId]?.allowedGraphCodes.includes(
          graph.code as ValidSkillGraphCode,
        )
      )
        throw new Error(`Invalid semantic graph membership: ${node.variantId} in ${graph.code}`);
    }
    const targets = new Set(
      graph.nodes
        .filter((node) => variants.get(node.variantId)?.editorial.skillDemand.kind === "movement")
        .map((node) => node.id),
    );
    const outgoing = new Map(graph.nodes.map((node) => [node.id, [] as string[]]));
    if (!targets.size)
      throw new Error(`Skill graph has no actual gated movement target: ${graph.code}`);
    for (const edge of graph.edges) outgoing.get(edge.from)?.push(edge.to);
    const reachesTarget = (start: string): boolean => {
      const visited = new Set<string>([start]);
      const pending = [...(outgoing.get(start) ?? [])];
      while (pending.length) {
        const node = pending.pop()!;
        if (targets.has(node)) return true;
        if (visited.has(node)) continue;
        visited.add(node);
        pending.push(...(outgoing.get(node) ?? []));
      }
      return false;
    };
    for (const node of graph.nodes) {
      covered.add(node.variantId);
      if (reachesTarget(node.id)) targetReachable.add(node.variantId);
    }
  }
  for (const row of rows) {
    const demand = row.editorial.skillDemand;
    const skillTagged =
      row.editorial.workoutRoles.includes("skill") || row.editorial.purposes.includes("skill");
    if (
      (row.editorial.execution.assignmentGate === "skill_review" ||
        demand.kind !== "none" ||
        skillTagged) &&
      !covered.has(row.id)
    )
      throw new Error(`Skill demand variant is missing from active draft graph: ${row.id}`);
    if (demand.kind === "preparation" && !targetReachable.has(row.id))
      throw new Error(`Preparation cannot reach an actual gated movement target: ${row.id}`);
  }
}
