import { and, eq, sql } from "drizzle-orm";
import { MUSCLE_GROUPS, type CatalogSeedRow } from "../../shared/catalog-taxonomy";
import {
  canEditCatalogDraft,
  CATALOG_RESOURCE_LABELS,
  loadCatalogSeed,
  loadSkillGraphs,
} from "./catalog-input";
import { getDb } from "./index";
import { canSeedDraftCatalog } from "./seed-policy";
import {
  exercises,
  muscleGroups,
  resourceTypes,
  skillGraphEdges,
  skillGraphNodes,
  skillGraphRevisions,
  templates,
  templateSteps,
  variantRequirements,
  variantRevisionMuscles,
  variantRevisions,
  variants,
} from "./schema";

const demoVariants: Record<string, string[]> = {
  strength: [
    "strength.squat.bodyweight",
    "strength.push_up.floor",
    "strength.glute_bridge.bodyweight",
  ],
  calisthenics: [
    "strength.squat.bodyweight",
    "strength.push_up.floor",
    "strength.glute_bridge.bodyweight",
  ],
  mobility: [
    "mobility.spinal_flexion_extension.quadruped",
    "mobility.thoracic_rotation.side_lying",
    "mobility.pelvic_tilt.supine",
  ],
  yoga: ["yoga.mountain.standing", "yoga.child.standard", "yoga.corpse.supine"],
};

type Requirement = { quantity: number; kind: string; confirm: boolean };
function requirementsFor(row: CatalogSeedRow) {
  const needed = new Map<string, Requirement>();
  for (const [value, kind] of [
    [row.equipmentRequirement, "equipment"],
    [row.supportRequirement, "support"],
    [row.spaceRequirement, "space"],
  ]) {
    for (const token of value.split(";").filter((item) => item !== "none")) {
      const [rawCode, quantity = "1"] = token.split(":");
      // Keep compatibility with the existing resource engine. Detailed space tags remain editorial inputs.
      const code =
        kind === "space" ? "clear_space" : rawCode === "floor_support" ? "floor" : rawCode;
      const previous = needed.get(code);
      if (previous && previous.kind !== kind) throw new Error(`Ambiguous resource kind: ${code}`);
      needed.set(code, {
        quantity: Math.max(previous?.quantity ?? 0, Number(quantity)),
        kind,
        confirm: kind === "support" && code !== "floor",
      });
    }
  }
  return needed;
}

export async function seedCatalog() {
  canSeedDraftCatalog(process.env);
  const rows = await loadCatalogSeed();
  const graphs = await loadSkillGraphs(rows);
  return getDb().transaction(async (tx) => {
    // Serialize repeated seed invocations. Locked variant/revision rows also prevent publication races.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext('miron.catalog.seed.v1'))`);
    await tx
      .insert(muscleGroups)
      .values(Object.entries(MUSCLE_GROUPS).map(([code, nameRu]) => ({ code, nameRu })))
      .onConflictDoNothing();
    const resourceMap = new Map<string, { id: string; kind: string }>();
    const addResource = async (code: string, kind: string) => {
      const nameRu = CATALOG_RESOURCE_LABELS[code];
      if (!nameRu) throw new Error(`Missing Russian resource label: ${code}`);
      const cached = resourceMap.get(code);
      if (cached) {
        if (cached.kind !== kind) throw new Error(`Resource kind mismatch: ${code}`);
        return cached.id;
      }
      await tx.insert(resourceTypes).values({ code, nameRu, kind }).onConflictDoNothing();
      const [resource] = await tx.select().from(resourceTypes).where(eq(resourceTypes.code, code));
      if (!resource || resource.kind !== kind) throw new Error(`Resource kind mismatch: ${code}`);
      if (CATALOG_RESOURCE_LABELS[code] && resource.nameRu !== CATALOG_RESOURCE_LABELS[code])
        await tx
          .update(resourceTypes)
          .set({ nameRu: CATALOG_RESOURCE_LABELS[code] })
          .where(eq(resourceTypes.id, resource.id));
      resourceMap.set(code, { id: resource.id, kind });
      return resource.id;
    };
    for (const [code, kind] of [
      ["floor", "support"],
      ["clear_space", "space"],
      ["dumbbell", "equipment"],
      ["mat", "equipment"],
      ["yoga_block", "equipment"],
      ["yoga_strap", "equipment"],
      ["resistance_band", "equipment"],
      ["pull_up_bar", "equipment"],
      ["stable_bench", "support"],
      ["bench", "support"],
      ["barbell", "equipment"],
      ["kettlebell", "equipment"],
      ["weighted_vest", "equipment"],
      ["dip_belt", "equipment"],
    ])
      await addResource(code, kind);

    for (const row of [...new Map(rows.map((item) => [item.familyId, item])).values()]) {
      await tx
        .insert(exercises)
        .values({ id: row.familyId, nameRu: row.familyNameRu, discipline: row.discipline })
        .onConflictDoNothing();
      await tx
        .select({ id: exercises.id })
        .from(exercises)
        .where(eq(exercises.id, row.familyId))
        .for("update");
      const children = await tx
        .select({ status: variants.status, revisionStatus: variantRevisions.status })
        .from(variants)
        .leftJoin(variantRevisions, eq(variantRevisions.variantId, variants.id))
        .where(eq(variants.exerciseId, row.familyId));
      const pinnedGraphs = await tx
        .select({
          status: skillGraphRevisions.status,
          reviewStatus: skillGraphRevisions.reviewStatus,
        })
        .from(skillGraphNodes)
        .innerJoin(skillGraphRevisions, eq(skillGraphRevisions.id, skillGraphNodes.graphRevisionId))
        .innerJoin(variantRevisions, eq(variantRevisions.id, skillGraphNodes.variantRevisionId))
        .innerJoin(variants, eq(variants.id, variantRevisions.variantId))
        .where(eq(variants.exerciseId, row.familyId))
        .for("update", { of: skillGraphRevisions });
      // A family used by an approved revision is not relabelled by an editorial seed.
      if (
        pinnedGraphs.every(
          (graph) => graph.status === "draft" && graph.reviewStatus === "pending_expert_review",
        ) &&
        children.every(
          (child) =>
            child.status === "draft" &&
            (child.revisionStatus === null || child.revisionStatus === "draft"),
        )
      )
        await tx
          .update(exercises)
          .set({ nameRu: row.familyNameRu, discipline: row.discipline })
          .where(eq(exercises.id, row.familyId));
    }

    let skippedVariants = 0;
    for (const row of rows) {
      await tx
        .insert(variants)
        .values({
          id: row.id,
          exerciseId: row.familyId,
          nameRu: row.editorial.formalNameRu,
          aliasEn: row.aliasEn,
          pattern: row.pattern,
          resistanceMode: row.resistanceMode,
          metric: row.metric,
          status: "draft",
          sourceBasis: "editorial_v2_pending_expert_review",
        })
        .onConflictDoNothing();
      const [variant] = await tx
        .select()
        .from(variants)
        .where(eq(variants.id, row.id))
        .for("update");
      const revisions = await tx
        .select()
        .from(variantRevisions)
        .where(eq(variantRevisions.variantId, row.id))
        .for("update");
      const pinnedGraphs = await tx
        .select({
          status: skillGraphRevisions.status,
          reviewStatus: skillGraphRevisions.reviewStatus,
        })
        .from(skillGraphNodes)
        .innerJoin(skillGraphRevisions, eq(skillGraphRevisions.id, skillGraphNodes.graphRevisionId))
        .innerJoin(variantRevisions, eq(variantRevisions.id, skillGraphNodes.variantRevisionId))
        .where(eq(variantRevisions.variantId, row.id))
        .for("update", { of: skillGraphRevisions });
      if (
        pinnedGraphs.some(
          (graph) => graph.status !== "draft" || graph.reviewStatus !== "pending_expert_review",
        ) ||
        !canEditCatalogDraft(
          variant.status,
          revisions.map((revision) => revision.status),
        )
      ) {
        skippedVariants++;
        continue;
      }
      if (variant.exerciseId !== row.familyId)
        throw new Error(`Existing variant family mismatch: ${row.id}`);
      await tx
        .update(variants)
        .set({
          nameRu: row.editorial.formalNameRu,
          aliasEn: row.aliasEn,
          pattern: row.pattern,
          resistanceMode: row.resistanceMode,
          metric: row.metric,
          sourceBasis: "editorial_v2_pending_expert_review",
        })
        .where(and(eq(variants.id, row.id), eq(variants.status, "draft")));
      const instructions = [
        "Редакционный черновик. Техника, мышечные акценты и сложность ожидают экспертной проверки.",
        ...row.editorial.cues,
      ].join("\n");
      await tx
        .insert(variantRevisions)
        .values({
          variantId: row.id,
          revision: 1,
          status: "draft",
          instructions,
          editorial: row.editorial,
        })
        .onConflictDoNothing();
      const [revision] = await tx
        .update(variantRevisions)
        .set({ instructions, editorial: row.editorial })
        .where(
          and(
            eq(variantRevisions.variantId, row.id),
            eq(variantRevisions.revision, 1),
            eq(variantRevisions.status, "draft"),
          ),
        )
        .returning({ id: variantRevisions.id });
      if (!revision) throw new Error(`Missing editable revision: ${row.id}`);
      // Only the draft's classifications and requirements are replaced; identities and snapshots stay stable.
      await tx
        .delete(variantRevisionMuscles)
        .where(eq(variantRevisionMuscles.variantRevisionId, revision.id));
      if (row.muscles.length)
        await tx.insert(variantRevisionMuscles).values(
          row.muscles.map((muscle) => ({
            variantRevisionId: revision.id,
            muscleGroupCode: muscle.group,
            role: muscle.role,
          })),
        );
      await tx.delete(variantRequirements).where(eq(variantRequirements.variantId, row.id));
      for (const [code, requirement] of requirementsFor(row)) {
        const resourceTypeId = await addResource(code, requirement.kind);
        await tx.insert(variantRequirements).values({
          variantId: row.id,
          resourceTypeId,
          quantity: requirement.quantity,
          requiresConfirmation: requirement.confirm,
        });
      }
    }
    let skippedGraphs = 0;
    for (const graph of graphs) {
      await tx
        .insert(skillGraphRevisions)
        .values({
          code: graph.code,
          nameRu: graph.nameRu,
          revision: graph.revision,
          status: "draft",
          reviewStatus: graph.reviewStatus,
          sourceRefs: graph.sourceRefs,
        })
        .onConflictDoNothing();
      const [savedGraph] = await tx
        .select()
        .from(skillGraphRevisions)
        .where(
          and(
            eq(skillGraphRevisions.code, graph.code),
            eq(skillGraphRevisions.revision, graph.revision),
          ),
        )
        .for("update");
      if (!savedGraph) throw new Error(`Missing graph revision: ${graph.code}`);
      if (savedGraph.status !== "draft" || savedGraph.reviewStatus !== "pending_expert_review") {
        skippedGraphs++;
        continue;
      }
      await tx
        .update(skillGraphRevisions)
        .set({
          nameRu: graph.nameRu,
          reviewStatus: graph.reviewStatus,
          sourceRefs: graph.sourceRefs,
        })
        .where(eq(skillGraphRevisions.id, savedGraph.id));
      // Edges pin nodes within one graph revision; the revision ID survives repeated seeds.
      await tx.delete(skillGraphEdges).where(eq(skillGraphEdges.graphRevisionId, savedGraph.id));
      await tx.delete(skillGraphNodes).where(eq(skillGraphNodes.graphRevisionId, savedGraph.id));
      for (const node of graph.nodes) {
        const [revision] = await tx
          .select({ id: variantRevisions.id })
          .from(variantRevisions)
          .where(
            and(eq(variantRevisions.variantId, node.variantId), eq(variantRevisions.revision, 1)),
          );
        if (!revision)
          throw new Error(`Graph references missing exercise revision: ${node.variantId}`);
        await tx.insert(skillGraphNodes).values({
          graphRevisionId: savedGraph.id,
          nodeKey: node.id,
          variantRevisionId: revision.id,
          skillGroup: node.skillGroup,
          prerequisiteMode: node.prerequisiteMode,
          assessment: node.assessment,
          assessmentNotes: node.assessmentNotes,
        });
      }
      if (graph.edges.length)
        await tx.insert(skillGraphEdges).values(
          graph.edges.map((edge) => ({
            graphRevisionId: savedGraph.id,
            fromNodeKey: edge.from,
            toNodeKey: edge.to,
            kind: edge.kind,
            sourceRefs: edge.sourceRefs,
          })),
        );
    }
    for (const [discipline, wanted] of Object.entries(demoVariants)) {
      const chosen = wanted.filter((id) => rows.some((row) => row.id === id));
      if (chosen.length !== wanted.length) throw new Error(`Missing demo variant: ${discipline}`);
      await tx
        .insert(templates)
        .values({
          code: `demo-${discipline}`,
          name: "Демонстрация тренировки",
          status: "demo",
          rewardKind: discipline === "yoga" || discipline === "mobility" ? "support" : "main",
        })
        .onConflictDoNothing();
      const [template] = await tx
        .select()
        .from(templates)
        .where(eq(templates.code, `demo-${discipline}`))
        .for("update");
      if (!template || template.status !== "demo") continue;
      // Only local demo steps are refreshed. Existing workout snapshots and template IDs survive.
      await tx
        .delete(templateSteps)
        .where(
          and(
            eq(templateSteps.templateId, template.id),
            sql`${templateSteps.ordinal} >= ${chosen.length}`,
          ),
        );
      for (const [ordinal, variantId] of [...new Set(chosen)].slice(0, 3).entries()) {
        const [revision] = await tx
          .select()
          .from(variantRevisions)
          .where(and(eq(variantRevisions.variantId, variantId), eq(variantRevisions.revision, 1)));
        await tx
          .insert(templateSteps)
          .values({
            templateId: template.id,
            variantRevisionId: revision.id,
            ordinal,
            sets: 2,
            reps: 8,
          })
          .onConflictDoUpdate({
            target: [templateSteps.templateId, templateSteps.ordinal],
            set: { variantRevisionId: revision.id, sets: 2, reps: 8 },
          });
      }
    }
    const [counts] = await tx
      .select({
        draftVariants: sql<number>`count(*) filter (where ${variants.status} = 'draft')::integer`,
        publishedVariants: sql<number>`count(*) filter (where ${variants.status} = 'published')::integer`,
      })
      .from(variants);
    return {
      ...counts,
      skippedVariants,
      skillGraphs: graphs.length,
      skippedGraphs,
      demoTemplates: 4,
    };
  });
}
