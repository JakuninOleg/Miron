import { loadCatalogSeed, loadSkillGraphs } from "../src/server/db/catalog-input";

async function main() {
  const rows = await loadCatalogSeed();
  const graphs = await loadSkillGraphs(rows);
  const countBy = (values: string[]) =>
    Object.fromEntries(
      [...new Set(values)]
        .sort()
        .map((value) => [value, values.filter((item) => item === value).length]),
    );
  console.log(
    JSON.stringify(
      {
        status: "passed",
        draftVariants: rows.length,
        publishedByThisCheck: 0,
        reviewStatus: "pending_expert_review",
        disciplines: countBy(rows.map((row) => row.discipline)),
        directions: countBy(rows.flatMap((row) => row.editorial.directions)),
        difficulty: countBy(rows.map((row) => row.editorial.difficulty)),
        skillDemandKinds: countBy(rows.map((row) => row.editorial.skillDemand.kind)),
        canonicalEditorialCards: rows.filter((row) => row.editorial.canonical).length,
        skillReviewCards: rows.filter(
          (row) => row.editorial.execution.assignmentGate === "skill_review",
        ).length,
        skillGraphs: graphs.length,
        graphNodes: graphs.reduce((sum, graph) => sum + graph.nodes.length, 0),
        prerequisiteEdges: graphs.reduce(
          (sum, graph) => sum + graph.edges.filter((edge) => edge.kind === "prerequisite").length,
          0,
        ),
        preparationEdges: graphs.reduce(
          (sum, graph) => sum + graph.edges.filter((edge) => edge.kind === "preparation").length,
          0,
        ),
        checks: [
          "schema_and_stable_ids",
          "family_and_metric_preservation",
          "overlay_completeness",
          "resource_kinds_and_quantities",
          "normalized_required_optional_disjoint",
          "explicit_resistance_and_assistance",
          "count_and_side_semantics",
          "difficulty_independent_skill_demand",
          "skill_demand_gate_equivalence",
          "stable_id_skill_policy",
          "semantic_graph_membership",
          "preparation_reaches_gated_target",
          "active_v2_graph_coverage",
          "relation_integrity",
          "prerequisite_dag",
          "manual_assessment_only",
        ],
      },
      null,
      2,
    ),
  );
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Catalogue QA failed");
  process.exitCode = 1;
});
