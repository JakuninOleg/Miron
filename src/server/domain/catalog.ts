import { and, eq, inArray, notInArray, sql } from "drizzle-orm";
import { getDb } from "../db";
import { variantRevisions, variants } from "../db/schema";
import { CATALOG_SKILL_POLICY } from "../db/catalog-skill-policy";

const skillMovementIds = Object.entries(CATALOG_SKILL_POLICY)
  .filter(([, entry]) => entry.kind === "movement")
  .map(([id]) => id);
const skillPreparationIds = Object.entries(CATALOG_SKILL_POLICY)
  .filter(([, entry]) => entry.kind === "preparation")
  .map(([id]) => id);

export type ResourceFact = {
  code: string;
  quantity: number;
  isStable?: boolean | null;
  confirmedAt?: Date | string | null;
};
export type ResourceRequirement = { code: string; quantity: number; requiresConfirmation: boolean };
export function resourcesSatisfy(required: ResourceRequirement[], available: ResourceFact[]) {
  return required.every((r) => {
    const fact = available.find((a) => a.code === r.code);
    return Boolean(
      fact &&
      fact.quantity >= r.quantity &&
      (!r.requiresConfirmation || (fact.isStable === true && fact.confirmedAt)),
    );
  });
}
// Safe public selector: draft seed rows must never enter the production planner.
export async function getPublishedCatalog() {
  return getDb()
    .select({
      id: variants.id,
      name: sql<string>`coalesce(${variantRevisions.editorial}->>'displayNameRu', ${variants.nameRu})`,
      metric: variants.metric,
      revisionId: variantRevisions.id,
      instructions: variantRevisions.instructions,
    })
    .from(variants)
    .innerJoin(variantRevisions, eq(variantRevisions.variantId, variants.id))
    .where(
      and(
        eq(variants.status, "published"),
        eq(variantRevisions.status, "published"),
        // No skill assessment engine exists yet; publication alone cannot bypass this gate.
        sql`${variantRevisions.editorial}->'execution'->>'assignmentGate' = 'standard_review'`,
        sql`${variantRevisions.editorial}->'skillDemand'->>'kind' in ('none', 'preparation')`,
        sql`${variantRevisions.editorial}->'skillDemand'->'requiresPriorSkill' = 'false'::jsonb`,
        notInArray(variants.id, skillMovementIds),
        sql`${variantRevisions.editorial}->'skillDemand'->>'kind' = case
          when ${inArray(variants.id, skillPreparationIds)} then 'preparation'
          else 'none' end`,
      ),
    );
}
