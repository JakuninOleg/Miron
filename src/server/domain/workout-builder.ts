import { createHash } from "node:crypto";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "../db";
import {
  builderCommands,
  builderInventories,
  builderInventoryResources,
  customWorkoutTemplates,
  customWorkoutTemplateSteps,
  equipmentProfiles,
  muscleGroups,
  profiles,
  profileResources,
  resourceTypes,
  user,
  variantRequirements,
  variantRevisionMuscles,
  variantRevisions,
  variants,
} from "../db/schema";
import { CATALOG_SKILL_POLICY } from "../db/catalog-skill-policy";
import {
  MUSCLE_GROUPS,
  type CatalogContext,
  type CatalogDirection,
  type MuscleGroup,
} from "../../shared/catalog-taxonomy";
import {
  estimateBuilderWorkout,
  builderPairError,
  type BuilderBootstrap,
  type BuilderCatalog,
  type BuilderExercise,
  type BuilderInventory,
  type BuilderResourceOption,
  type CustomWorkoutSummary,
  type CustomWorkoutTemplate,
} from "../../shared/workout-builder";
import { resourcesSatisfy, type ResourceFact } from "./catalog";
import { DomainError } from "./errors";
import { standardGymResources } from "../../shared/workout-inventory";

const placeInput = z.enum(["home", "gym", "outdoor", "workout_park"]);
const directionInput = z.enum(["strength", "calisthenics", "yoga", "stretch", "mobility"]);
const codeInput = z
  .string()
  .min(1)
  .max(100)
  .regex(/^[a-z][a-z0-9_]*$/);
const equipmentInput = z.enum(["all", "machines", "free_weights", "bodyweight", "bands", "cables"]);
const expectedRevision = z.number().int().min(0).max(1_000_000);
const operationId = z.uuid();
export const builderInventoryInput = z.strictObject({
  operationId,
  place: placeInput,
  expectedRevision,
  resources: z
    .array(
      z.strictObject({
        code: codeInput,
        quantity: z.number().int().min(1).max(100),
        isStable: z.boolean().nullable(),
      }),
    )
    .max(150)
    .refine((rows) => new Set(rows.map((row) => row.code)).size === rows.length),
});
export const customWorkoutInput = z.strictObject({
  operationId,
  id: z.uuid(),
  expectedRevision,
  name: z.string().trim().min(1).max(80),
  place: placeInput,
  direction: directionInput,
  inventoryRevision: z.number().int().min(1).max(1_000_000),
  steps: z
    .array(
      z.strictObject({
        revisionId: z.uuid(),
        sets: z.number().int().min(1).max(10),
        target: z.number().int().min(1).max(600),
        restSeconds: z.number().int().min(0).max(600),
        pairKey: z
          .string()
          .min(1)
          .max(80)
          .regex(/^[a-zA-Z0-9_.-]+$/)
          .optional(),
        transitionSeconds: z.number().int().min(0).max(120).optional(),
      }),
    )
    .min(1)
    .max(40),
});
export const builderDeleteInput = z.strictObject({
  operationId,
  expectedRevision: expectedRevision.min(1),
});
export const builderCatalogInput = z.strictObject({
  place: placeInput,
  direction: directionInput,
  search: z.string().trim().max(100).default(""),
  muscle: z.enum(Object.keys(MUSCLE_GROUPS) as [MuscleGroup, ...MuscleGroup[]]).optional(),
  equipment: equipmentInput.default("all"),
  page: z.coerce.number().int().min(1).max(100).default(1),
});

type Database = ReturnType<typeof getDb>;
type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];
type Reader = Pick<Database, "select">;
type CatalogQuery = z.infer<typeof builderCatalogInput>;
type InventoryResult = BuilderInventory;
type CommandResult = InventoryResult | CustomWorkoutTemplate | { deleted: true };

async function withOwnerTransaction<T>(
  owner: string,
  callback: (tx: Transaction) => Promise<T>,
): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await getDb().transaction(async (tx) => {
        const [principal] = await tx
          .select({ status: user.status })
          .from(user)
          .where(eq(user.id, owner))
          .for("update");
        if (!principal || principal.status !== "active")
          throw new DomainError("ACCOUNT_UNAVAILABLE", 403, "Аккаунт недоступен.");
        return callback(tx);
      });
    } catch (error) {
      const databaseError = error instanceof Error && "cause" in error ? error.cause : error;
      const code =
        typeof databaseError === "object" && databaseError && "code" in databaseError
          ? databaseError.code
          : undefined;
      if (attempt >= 2 || (code !== "40001" && code !== "40P01")) throw error;
    }
  }
}

function payloadHash(action: string, input: unknown): string {
  return createHash("sha256").update(JSON.stringify({ action, input })).digest("hex");
}
async function replay(
  tx: Transaction,
  owner: string,
  id: string,
  hash: string,
): Promise<CommandResult | undefined> {
  const [saved] = await tx
    .select()
    .from(builderCommands)
    .where(and(eq(builderCommands.userId, owner), eq(builderCommands.operationId, id)))
    .limit(1);
  if (!saved) return undefined;
  if (saved.payloadHash !== hash)
    throw new DomainError(
      "OPERATION_REUSED",
      409,
      "Этот запрос уже использован для другого действия.",
    );
  return saved.result as CommandResult;
}
async function storeResult(
  tx: Transaction,
  owner: string,
  id: string,
  hash: string,
  result: CommandResult,
) {
  await tx
    .insert(builderCommands)
    .values({ userId: owner, operationId: id, payloadHash: hash, result });
}

async function resourceOptions(reader: Reader): Promise<BuilderResourceOption[]> {
  const [types, confirmations] = await Promise.all([
    reader.select().from(resourceTypes).orderBy(asc(resourceTypes.nameRu)),
    reader
      .select({ id: variantRequirements.resourceTypeId })
      .from(variantRequirements)
      .where(eq(variantRequirements.requiresConfirmation, true)),
  ]);
  const confirmedIds = new Set(confirmations.map((row) => row.id));
  return types.map((row) => ({
    code: row.code,
    name: row.nameRu,
    kind: z.enum(["equipment", "support", "space", "anchor"]).parse(row.kind),
    requiresConfirmation: confirmedIds.has(row.id) || row.kind === "anchor",
  }));
}
async function readInventories(owner: string, reader: Reader): Promise<BuilderInventory[]> {
  const [inventories, resources] = await Promise.all([
    reader.select().from(builderInventories).where(eq(builderInventories.userId, owner)),
    reader
      .select({
        place: builderInventoryResources.place,
        code: resourceTypes.code,
        quantity: builderInventoryResources.quantity,
        isStable: builderInventoryResources.isStable,
      })
      .from(builderInventoryResources)
      .innerJoin(resourceTypes, eq(resourceTypes.id, builderInventoryResources.resourceTypeId))
      .where(eq(builderInventoryResources.userId, owner)),
  ]);
  return inventories.map((row) => ({
    place: placeInput.parse(row.place),
    revision: row.revision,
    confirmedAt: row.confirmedAt.toISOString(),
    resources: resources
      .filter((resource) => resource.place === row.place)
      .map(({ code, quantity, isStable }) => ({ code, quantity, isStable })),
  }));
}
export async function getBuilderBootstrap(owner: string): Promise<BuilderBootstrap> {
  const reader = getDb();
  const [options, inventories, muscleRows, profile, legacy] = await Promise.all([
    resourceOptions(reader),
    readInventories(owner, reader),
    reader.select().from(muscleGroups),
    reader
      .select({ theme: profiles.theme })
      .from(profiles)
      .where(eq(profiles.userId, owner))
      .limit(1),
    reader
      .select({
        place: equipmentProfiles.place,
        code: resourceTypes.code,
        quantity: profileResources.quantity,
        isStable: profileResources.isStable,
        confirmedAt: profileResources.confirmedAt,
      })
      .from(equipmentProfiles)
      .innerJoin(
        profileResources,
        and(
          eq(profileResources.equipmentProfileId, equipmentProfiles.id),
          eq(profileResources.userId, owner),
        ),
      )
      .innerJoin(resourceTypes, eq(resourceTypes.id, profileResources.resourceTypeId))
      .where(eq(equipmentProfiles.userId, owner)),
  ]);
  const previousInventories: NonNullable<BuilderBootstrap["previousInventories"]> = [];
  for (const place of placeInput.options) {
    if (inventories.some((inventory) => inventory.place === place)) continue;
    const rows = legacy.filter(
      (row) => row.place === place && row.code !== "floor" && row.code !== "clear_space",
    );
    if (!rows.length) continue;
    const merged = new Map<string, BuilderInventory["resources"][number]>();
    let supportsConfirmed = true;
    for (const row of rows) {
      const requiresConfirmation = options.find(
        (option) => option.code === row.code,
      )?.requiresConfirmation;
      if (requiresConfirmation && !(row.isStable === true && row.confirmedAt))
        supportsConfirmed = false;
      const previous = merged.get(row.code);
      merged.set(row.code, {
        code: row.code,
        quantity: Math.max(row.quantity, previous?.quantity ?? 0),
        isStable: row.isStable === true && row.confirmedAt ? true : null,
      });
    }
    previousInventories.push({ place, resources: [...merged.values()], supportsConfirmed });
  }
  return {
    ownerId: owner,
    theme: profile[0]?.theme === "rose" ? "rose" : "dark",
    resources: options,
    inventories,
    previousInventories,
    muscles: muscleRows
      .filter((row) => row.code in MUSCLE_GROUPS)
      .map((row) => ({ code: row.code as MuscleGroup, name: row.nameRu })),
  };
}

export async function saveBuilderInventory(
  owner: string,
  value: unknown,
): Promise<BuilderInventory> {
  const input = builderInventoryInput.parse(value);
  const hash = payloadHash("inventory", input);
  return withOwnerTransaction(owner, async (tx) => {
    const prior = await replay(tx, owner, input.operationId, hash);
    if (prior) return prior as BuilderInventory;
    const [existing] = await tx
      .select()
      .from(builderInventories)
      .where(and(eq(builderInventories.userId, owner), eq(builderInventories.place, input.place)))
      .limit(1);
    if ((existing?.revision ?? 0) !== input.expectedRevision)
      throw new DomainError("INVENTORY_CONFLICT", 409, "Инвентарь уже изменился. Обновите список.");
    const types = await tx.select().from(resourceTypes);
    const typeMap = new Map(types.map((row) => [row.code, row]));
    const selected = input.resources.filter(
      (row) => row.code !== "floor" && row.code !== "clear_space",
    );
    for (const resource of selected)
      if (!typeMap.has(resource.code))
        throw new DomainError("UNKNOWN_RESOURCE", 400, "В списке есть неизвестный инвентарь.");
    const standard = input.place === "gym" ? standardGymResources(await resourceOptions(tx)) : [];
    const normalized = [
      ...selected.filter((row) => !standard.some((item) => item.code === row.code)),
      ...standard,
    ];
    const basics = ["floor", "clear_space"]
      .filter((code) => typeMap.has(code))
      .map((code) => ({ code, quantity: 1, isStable: null }));
    const resources = [...normalized, ...basics];
    const confirmedAt = new Date();
    const revision = (existing?.revision ?? 0) + 1;
    if (existing)
      await tx
        .update(builderInventories)
        .set({ revision, confirmedAt })
        .where(
          and(eq(builderInventories.userId, owner), eq(builderInventories.place, input.place)),
        );
    else
      await tx
        .insert(builderInventories)
        .values({ userId: owner, place: input.place, revision, confirmedAt });
    await tx
      .delete(builderInventoryResources)
      .where(
        and(
          eq(builderInventoryResources.userId, owner),
          eq(builderInventoryResources.place, input.place),
        ),
      );
    if (resources.length)
      await tx.insert(builderInventoryResources).values(
        resources.map((resource) => ({
          userId: owner,
          place: input.place,
          resourceTypeId: typeMap.get(resource.code)!.id,
          quantity: resource.quantity,
          isStable: resource.isStable,
          confirmedAt: resource.isStable === true ? confirmedAt : null,
        })),
      );
    const result: BuilderInventory = {
      place: input.place,
      revision,
      confirmedAt: confirmedAt.toISOString(),
      resources,
    };
    await storeResult(tx, owner, input.operationId, hash, result);
    return result;
  });
}

function matchesEquipment(exercise: BuilderExercise, filter: CatalogQuery["equipment"]): boolean {
  const codes = exercise.equipment.map((item) => item.code);
  switch (filter) {
    case "all":
      return true;
    case "machines":
      return (
        (exercise.resistanceMode === "machine_load" &&
          !codes.some((code) => code.includes("cable"))) ||
        (exercise.resistanceMode === "assisted_bodyweight" &&
          codes.some((code) => code.includes("machine")))
      );
    case "free_weights":
      return (
        exercise.resistanceMode === "external_load" &&
        codes.some((code) => /dumbbell|barbell|kettlebell|ez_bar|^plates$/.test(code)) &&
        !codes.some((code) => /cable|band|machine/.test(code))
      );
    case "bodyweight":
      return exercise.resistanceMode === "bodyweight";
    case "bands":
      return codes.some((code) => code.includes("band"));
    case "cables":
      return codes.some((code) => code.includes("cable") || code.startsWith("lat_pulldown"));
  }
}

export async function getAvailableBuilderCatalog(
  owner: string,
  place: CatalogContext,
  direction: CatalogDirection | undefined,
  reader: Reader,
): Promise<BuilderExercise[]> {
  const inventories = await readInventories(owner, reader);
  const inventory = inventories.find((row) => row.place === place);
  if (!inventory)
    throw new DomainError("INVENTORY_REQUIRED", 409, "Сначала укажи, что есть под рукой.");
  const facts: ResourceFact[] = inventory.resources.map((row) => ({
    ...row,
    confirmedAt: row.isStable === true ? inventory.confirmedAt : null,
  }));
  const rows = await reader
    .select({ variant: variants, revision: variantRevisions })
    .from(variants)
    .innerJoin(variantRevisions, eq(variantRevisions.variantId, variants.id))
    .where(
      and(
        inArray(variants.status, ["draft", "published"]),
        inArray(variantRevisions.status, ["draft", "published"]),
        sql`${variantRevisions.editorial}->'contexts' ? ${place}`,
        direction ? sql`${variantRevisions.editorial}->'directions' ? ${direction}` : undefined,
        sql`${variantRevisions.editorial}->'execution'->>'assignmentGate' = 'standard_review'`,
        sql`${variantRevisions.editorial}->'skillDemand'->>'kind' in ('none','preparation')`,
        sql`${variantRevisions.editorial}->'skillDemand'->'requiresPriorSkill' = 'false'::jsonb`,
        sql`(${variantRevisions.status} = 'published' or ${variantRevisions.editorial}->>'reviewStatus' = 'pending_expert_review')`,
        // A revoked/retired latest revision does not make an older draft selectable again.
        sql`not exists (select 1 from variant_revisions newer where newer.variant_id = ${variants.id} and newer.revision > ${variantRevisions.revision})`,
      ),
    )
    .limit(1000);
  if (!rows.length) return [];
  const [requirements, muscles] = await Promise.all([
    reader
      .select({
        variantId: variantRequirements.variantId,
        code: resourceTypes.code,
        name: resourceTypes.nameRu,
        quantity: variantRequirements.quantity,
        requiresConfirmation: variantRequirements.requiresConfirmation,
      })
      .from(variantRequirements)
      .innerJoin(resourceTypes, eq(resourceTypes.id, variantRequirements.resourceTypeId))
      .where(
        inArray(
          variantRequirements.variantId,
          rows.map((row) => row.variant.id),
        ),
      ),
    reader
      .select({
        revisionId: variantRevisionMuscles.variantRevisionId,
        code: muscleGroups.code,
        name: muscleGroups.nameRu,
        role: variantRevisionMuscles.role,
      })
      .from(variantRevisionMuscles)
      .innerJoin(muscleGroups, eq(muscleGroups.code, variantRevisionMuscles.muscleGroupCode))
      .where(
        inArray(
          variantRevisionMuscles.variantRevisionId,
          rows.map((row) => row.revision.id),
        ),
      ),
  ]);
  const exercises: BuilderExercise[] = [];
  for (const { variant, revision } of rows) {
    const editorial = revision.editorial;
    if (!editorial) continue;
    const policy = CATALOG_SKILL_POLICY[variant.id];
    if (policy?.kind === "movement" || (policy && policy.kind !== editorial.skillDemand.kind))
      continue;
    const needed = requirements.filter((row) => row.variantId === variant.id);
    if (!resourcesSatisfy(needed, facts)) continue;
    const muscleRows = muscles.filter(
      (row) => row.revisionId === revision.id && row.code in MUSCLE_GROUPS,
    );
    exercises.push({
      variantId: variant.id,
      revisionId: revision.id,
      name: editorial.displayNameRu,
      metric: z.enum(["reps", "time"]).parse(variant.metric),
      resistanceMode: z
        .enum(["bodyweight", "external_load", "machine_load", "assisted_bodyweight"])
        .parse(variant.resistanceMode),
      difficulty: editorial.difficulty,
      primaryMuscles: muscleRows
        .filter((row) => row.role === "primary")
        .map((row) => ({ code: row.code as MuscleGroup, name: row.name })),
      secondaryMuscles: muscleRows
        .filter((row) => row.role === "secondary")
        .map((row) => ({ code: row.code as MuscleGroup, name: row.name })),
      equipment: needed
        .filter((row) => row.code !== "floor" && row.code !== "clear_space")
        .map(({ code, name }) => ({ code, name })),
      instructions: editorial.cues.length
        ? editorial.cues
        : revision.instructions.split(/\r?\n/).filter(Boolean),
      status: revision.status === "published" ? "published" : "draft",
      timing: {
        secondsPerRep: { min: 2, max: 4 },
        setupSeconds:
          variant.resistanceMode === "machine_load" ||
          (variant.resistanceMode === "assisted_bodyweight" &&
            needed.some((row) => row.code.includes("machine")))
            ? { min: 30, max: 60 }
            : variant.resistanceMode === "external_load"
              ? { min: 20, max: 45 }
              : { min: 5, max: 15 },
        sideSwitchSeconds: { min: 5, max: 10 },
        perSide:
          editorial.execution.countSemantics === "per_side_reps" ||
          editorial.execution.countSemantics === "per_side_seconds",
      },
      movementPattern: variant.pattern,
      focusMode: editorial.focusMode,
    });
  }
  return exercises.sort((a, b) => a.name.localeCompare(b.name, "ru"));
}
export async function getBuilderCatalog(owner: string, value: unknown): Promise<BuilderCatalog> {
  const input = builderCatalogInput.parse(value);
  const catalog = await getAvailableBuilderCatalog(owner, input.place, input.direction, getDb());
  // Search aliases/keywords from the exact DB revisions, not unversioned display-only tags.
  const search = input.search.toLocaleLowerCase("ru");
  const revisions =
    search && catalog.length
      ? await getDb()
          .select({ id: variantRevisions.id, editorial: variantRevisions.editorial })
          .from(variantRevisions)
          .where(
            inArray(
              variantRevisions.id,
              catalog.map((row) => row.revisionId),
            ),
          )
      : [];
  const searchText = new Map(
    revisions.map((row) => [
      row.id,
      [
        row.editorial?.displayNameRu,
        ...(row.editorial?.aliases ?? []),
        ...(row.editorial?.searchKeywords ?? []),
      ]
        .join(" ")
        .toLocaleLowerCase("ru"),
    ]),
  );
  const filtered = catalog.filter(
    (row) =>
      (!search || searchText.get(row.revisionId)?.includes(search)) &&
      (!input.muscle ||
        [...row.primaryMuscles, ...row.secondaryMuscles].some(
          (muscle) => muscle.code === input.muscle,
        )) &&
      matchesEquipment(row, input.equipment),
  );
  return {
    exercises: filtered.slice((input.page - 1) * 24, input.page * 24),
    total: filtered.length,
    page: input.page,
    pageSize: 24,
  };
}

function summary(
  row: typeof customWorkoutTemplates.$inferSelect,
  exerciseCount: number,
): CustomWorkoutSummary {
  return {
    id: row.id,
    revision: row.revision,
    name: row.name,
    place: placeInput.parse(row.place),
    direction: directionInput.parse(row.direction),
    estimate: row.estimate,
    exerciseCount,
    updatedAt: row.updatedAt.toISOString(),
  };
}
export async function listCustomWorkouts(owner: string): Promise<CustomWorkoutSummary[]> {
  const rows = await getDb()
    .select({
      template: customWorkoutTemplates,
      exerciseCount: sql<number>`(select count(*)::int from custom_workout_template_steps s where s.user_id = ${customWorkoutTemplates.userId} and s.template_id = ${customWorkoutTemplates.id})`,
    })
    .from(customWorkoutTemplates)
    .where(eq(customWorkoutTemplates.userId, owner))
    .orderBy(desc(customWorkoutTemplates.updatedAt))
    .limit(100);
  return rows.map((row) => summary(row.template, row.exerciseCount));
}
async function readCustomWorkout(
  owner: string,
  id: string,
  reader: Reader,
): Promise<CustomWorkoutTemplate> {
  z.uuid().parse(id);
  const [row] = await reader
    .select()
    .from(customWorkoutTemplates)
    .where(and(eq(customWorkoutTemplates.userId, owner), eq(customWorkoutTemplates.id, id)))
    .limit(1);
  if (!row) throw new DomainError("TEMPLATE_NOT_FOUND", 404, "Тренировка не найдена.");
  const steps = await reader
    .select()
    .from(customWorkoutTemplateSteps)
    .where(
      and(
        eq(customWorkoutTemplateSteps.userId, owner),
        eq(customWorkoutTemplateSteps.templateId, id),
      ),
    )
    .orderBy(asc(customWorkoutTemplateSteps.ordinal));
  return {
    ...summary(row, steps.length),
    inventoryRevision: row.inventoryRevision,
    steps: steps.map((step) => ({
      revisionId: step.variantRevisionId,
      sets: step.sets,
      target: step.target,
      restSeconds: step.restSeconds,
      ...(step.pairKey
        ? { pairKey: step.pairKey, transitionSeconds: step.transitionSeconds ?? 30 }
        : {}),
      exercise: step.exercise,
    })),
  };
}
export async function getCustomWorkout(owner: string, id: string): Promise<CustomWorkoutTemplate> {
  z.uuid().parse(id);
  return withOwnerTransaction(owner, (tx) => readCustomWorkout(owner, id, tx));
}
export async function saveCustomWorkout(
  owner: string,
  value: unknown,
): Promise<CustomWorkoutTemplate> {
  const input = customWorkoutInput.parse(value);
  const pairError = builderPairError(input.steps);
  if (pairError) throw new DomainError("INVALID_PAIR", 400, pairError);
  const hash = payloadHash("save", input);
  return withOwnerTransaction(owner, async (tx) => {
    const prior = await replay(tx, owner, input.operationId, hash);
    if (prior) return prior as CustomWorkoutTemplate;
    const [existing] = await tx
      .select()
      .from(customWorkoutTemplates)
      .where(and(eq(customWorkoutTemplates.userId, owner), eq(customWorkoutTemplates.id, input.id)))
      .limit(1);
    if ((existing?.revision ?? 0) !== input.expectedRevision)
      throw new DomainError(
        "TEMPLATE_CONFLICT",
        409,
        "Тренировка уже изменилась. Открой её заново.",
      );
    const [inventory] = await tx
      .select()
      .from(builderInventories)
      .where(and(eq(builderInventories.userId, owner), eq(builderInventories.place, input.place)))
      .limit(1);
    if (!inventory || inventory.revision !== input.inventoryRevision)
      throw new DomainError(
        "INVENTORY_CONFLICT",
        409,
        "Инвентарь изменился. Проверь доступные упражнения.",
      );
    // Catalog publication/revocation cannot race validation of the pinned steps.
    await tx
      .select({ id: variants.id })
      .from(variants)
      .innerJoin(variantRevisions, eq(variantRevisions.variantId, variants.id))
      .where(
        inArray(
          variantRevisions.id,
          input.steps.map((step) => step.revisionId),
        ),
      )
      .orderBy(asc(variants.id))
      .for("update", { of: variants });
    await tx
      .select({ id: variantRevisions.id })
      .from(variantRevisions)
      .where(
        inArray(
          variantRevisions.id,
          input.steps.map((step) => step.revisionId),
        ),
      )
      .orderBy(asc(variantRevisions.id))
      .for("share");
    // A composed day may include admitted mobility warmup/cooldown alongside its main direction.
    const catalog = await getAvailableBuilderCatalog(owner, input.place, undefined, tx);
    const exerciseMap = new Map(catalog.map((exercise) => [exercise.revisionId, exercise]));
    const steps = input.steps.map((step) => {
      const exercise = exerciseMap.get(step.revisionId);
      if (!exercise)
        throw new DomainError(
          "EXERCISE_UNAVAILABLE",
          409,
          "Одно из упражнений больше не подходит выбранным условиям. Обнови список.",
        );
      if (exercise.metric === "reps" && step.target > 100)
        throw new DomainError(
          "INVALID_TARGET",
          400,
          "За один подход можно указать до 100 повторений.",
        );
      return { ...step, exercise };
    });
    const estimate = estimateBuilderWorkout(steps);
    if (estimate.maxSeconds > 14_400)
      throw new DomainError(
        "WORKOUT_TOO_LONG",
        400,
        "Сократи занятие: расчётная длительность превышает четыре часа.",
      );
    const now = new Date();
    const revision = (existing?.revision ?? 0) + 1;
    const values = {
      name: input.name,
      place: input.place,
      direction: input.direction,
      inventoryRevision: inventory.revision,
      estimate,
      revision,
      updatedAt: now,
    };
    if (existing)
      await tx
        .update(customWorkoutTemplates)
        .set(values)
        .where(
          and(eq(customWorkoutTemplates.userId, owner), eq(customWorkoutTemplates.id, input.id)),
        );
    else {
      const [{ count }] = await tx
        .select({ count: sql<number>`count(*)::int` })
        .from(customWorkoutTemplates)
        .where(eq(customWorkoutTemplates.userId, owner));
      if (count >= 100)
        throw new DomainError(
          "TEMPLATE_LIMIT",
          409,
          "Можно сохранить до 100 тренировок. Удали ненужную перед созданием новой.",
        );
      await tx.insert(customWorkoutTemplates).values({ ...values, id: input.id, userId: owner });
    }
    await tx
      .delete(customWorkoutTemplateSteps)
      .where(
        and(
          eq(customWorkoutTemplateSteps.userId, owner),
          eq(customWorkoutTemplateSteps.templateId, input.id),
        ),
      );
    await tx.insert(customWorkoutTemplateSteps).values(
      steps.map((step, ordinal) => ({
        userId: owner,
        templateId: input.id,
        ordinal,
        variantRevisionId: step.revisionId,
        sets: step.sets,
        target: step.target,
        restSeconds: step.restSeconds,
        pairKey: step.pairKey ?? null,
        transitionSeconds: step.pairKey ? (step.transitionSeconds ?? 30) : null,
        exercise: step.exercise,
      })),
    );
    const result: CustomWorkoutTemplate = {
      id: input.id,
      revision,
      name: input.name,
      place: input.place,
      direction: input.direction,
      inventoryRevision: input.inventoryRevision,
      estimate,
      exerciseCount: steps.length,
      steps,
      updatedAt: now.toISOString(),
    };
    await storeResult(tx, owner, input.operationId, hash, result);
    return result;
  });
}
export async function deleteCustomWorkout(
  owner: string,
  id: string,
  value: unknown,
): Promise<{ deleted: true }> {
  z.uuid().parse(id);
  const input = builderDeleteInput.parse(value);
  const hash = payloadHash("delete", { ...input, id });
  return withOwnerTransaction(owner, async (tx) => {
    const prior = await replay(tx, owner, input.operationId, hash);
    if (prior) return prior as { deleted: true };
    const [existing] = await tx
      .select()
      .from(customWorkoutTemplates)
      .where(and(eq(customWorkoutTemplates.userId, owner), eq(customWorkoutTemplates.id, id)))
      .limit(1);
    if (!existing) throw new DomainError("TEMPLATE_NOT_FOUND", 404, "Тренировка не найдена.");
    if (existing.revision !== input.expectedRevision)
      throw new DomainError(
        "TEMPLATE_CONFLICT",
        409,
        "Тренировка уже изменилась. Открой её заново.",
      );
    await tx
      .delete(customWorkoutTemplates)
      .where(and(eq(customWorkoutTemplates.userId, owner), eq(customWorkoutTemplates.id, id)));
    const result = { deleted: true } as const;
    await storeResult(tx, owner, input.operationId, hash, result);
    return result;
  });
}
