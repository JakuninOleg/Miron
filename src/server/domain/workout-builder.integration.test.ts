import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { and, eq, inArray, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getDb, closeDb } from "../db";
import { loadCatalogSeed } from "../db/catalog-input";
import {
  builderCommands,
  customWorkoutTemplates,
  customWorkoutTemplateSteps,
  exercises,
  muscleGroups,
  resourceTypes,
  user,
  variantRequirements,
  variantRevisionMuscles,
  variantRevisions,
  variants,
} from "../db/schema";
import type { CatalogEditorial } from "../../shared/catalog-taxonomy";
import type { SaveCustomWorkout } from "../../shared/workout-builder";
import { getPublishedCatalog } from "./catalog";
import {
  deleteCustomWorkout,
  getBuilderBootstrap,
  getBuilderCatalog,
  getCustomWorkout,
  listCustomWorkouts,
  saveBuilderInventory,
  saveCustomWorkout,
} from "./workout-builder";

if (existsSync(".env.local")) process.loadEnvFile(".env.local");
const enabled = process.env.RUN_DB_TESTS === "true";

describe.runIf(enabled)("PostgreSQL manual workout ownership and catalogue gates", () => {
  const alice = randomUUID();
  const bob = randomUUID();
  const familyId = `builder-test.${randomUUID()}`;
  const ids = new Map<string, { variantId: string; revisionId: string }>();
  const insertedResources: string[] = [];
  const insertedMuscles: string[] = [];
  let editorial: CatalogEditorial;
  let inventoryRevision = 0;
  let saved: SaveCustomWorkout;

  beforeAll(async () => {
    const url = new URL(process.env.DATABASE_URL!);
    if (!["127.0.0.1", "localhost"].includes(url.hostname))
      throw new Error("Constructor fixtures require a local PostgreSQL database");
    const catalog = await loadCatalogSeed();
    editorial = catalog.find((row) => row.id === "strength.squat.bodyweight")!.editorial;
    await getDb()
      .insert(user)
      .values([
        { id: alice, name: "Builder Alice", email: `${alice}@example.test`, emailVerified: true },
        { id: bob, name: "Builder Bob", email: `${bob}@example.test`, emailVerified: true },
      ]);
    await getDb()
      .insert(exercises)
      .values({ id: familyId, nameRu: "Constructor fixture", discipline: "strength" });
    const resourceDefinitions = [
      { code: "floor", kind: "support" },
      { code: "clear_space", kind: "space" },
      { code: "dumbbell", kind: "equipment" },
      { code: "stable_exercise_bench", kind: "support" },
      { code: "chest_press_machine", kind: "equipment" },
      { code: "high_cable_station_with_bar", kind: "equipment" },
      { code: "resistance_band", kind: "equipment" },
      { code: "assisted_pull_up_machine", kind: "equipment" },
    ];
    for (const definition of resourceDefinitions) {
      const [existing] = await getDb()
        .select()
        .from(resourceTypes)
        .where(eq(resourceTypes.code, definition.code));
      if (!existing) {
        const [inserted] = await getDb()
          .insert(resourceTypes)
          .values({ ...definition, nameRu: definition.code })
          .returning();
        insertedResources.push(inserted.id);
      }
    }
    for (const code of ["quads", "back", "chest", "triceps"]) {
      const [existing] = await getDb()
        .select()
        .from(muscleGroups)
        .where(eq(muscleGroups.code, code));
      if (!existing) {
        await getDb().insert(muscleGroups).values({ code, nameRu: code });
        insertedMuscles.push(code);
      }
    }
    const types = await getDb().select().from(resourceTypes);
    const createVariant = async (
      key: string,
      resistanceMode: string,
      needed: { code: string; quantity?: number; confirmed?: boolean }[],
      skill = false,
    ) => {
      const variantId = `${familyId}.${key}`;
      await getDb().insert(variants).values({
        id: variantId,
        exerciseId: familyId,
        nameRu: key,
        aliasEn: key,
        pattern: "squat",
        resistanceMode,
        metric: "reps",
        sourceBasis: "integration_fixture",
      });
      const [revision] = await getDb()
        .insert(variantRevisions)
        .values({
          variantId,
          revision: 1,
          instructions: "Fixture technique explanation",
          editorial: {
            ...editorial,
            displayNameRu: `Тест ${key}`,
            contexts: ["home", "gym"],
            directions: ["strength"],
            aliases: [`alias ${key}`],
            searchKeywords: [`keyword ${key}`],
            skillDemand: skill
              ? {
                  kind: "movement",
                  requiresPriorSkill: true,
                  rationale: "Integration skill fixture",
                }
              : {
                  kind: "none",
                  requiresPriorSkill: false,
                  rationale: "Integration standard fixture",
                },
            execution: {
              ...editorial.execution,
              assignmentGate: skill ? "skill_review" : "standard_review",
            },
          },
        })
        .returning();
      await getDb()
        .insert(variantRequirements)
        .values([
          {
            variantId,
            resourceTypeId: types.find((type) => type.code === "floor")!.id,
            quantity: 1,
          },
          {
            variantId,
            resourceTypeId: types.find((type) => type.code === "clear_space")!.id,
            quantity: 1,
          },
          ...needed.map((item) => ({
            variantId,
            resourceTypeId: types.find((type) => type.code === item.code)!.id,
            quantity: item.quantity ?? 1,
            requiresConfirmation: item.confirmed ?? false,
          })),
        ]);
      await getDb()
        .insert(variantRevisionMuscles)
        .values([
          {
            variantRevisionId: revision.id,
            muscleGroupCode: key === "machine" ? "chest" : "quads",
            role: "primary",
          },
          { variantRevisionId: revision.id, muscleGroupCode: "back", role: "secondary" },
          { variantRevisionId: revision.id, muscleGroupCode: "triceps", role: "stabilizer" },
        ]);
      ids.set(key, { variantId, revisionId: revision.id });
    };
    await createVariant("bodyweight", "bodyweight", []);
    await createVariant("pair", "external_load", [{ code: "dumbbell", quantity: 2 }]);
    await createVariant("bench", "external_load", [
      { code: "dumbbell", quantity: 2 },
      { code: "stable_exercise_bench", confirmed: true },
    ]);
    await createVariant("machine", "machine_load", [{ code: "chest_press_machine" }]);
    await createVariant("cable", "machine_load", [{ code: "high_cable_station_with_bar" }]);
    await createVariant("band", "external_load", [{ code: "resistance_band" }]);
    await createVariant("assisted", "assisted_bodyweight", [{ code: "assisted_pull_up_machine" }]);
    await createVariant("skill", "bodyweight", [], true);
  }, 30_000);

  afterAll(async () => {
    await getDb()
      .delete(user)
      .where(inArray(user.id, [alice, bob]));
    const variantIds = [...ids.values()].map((row) => row.variantId);
    if (variantIds.length) {
      await getDb()
        .delete(variantRequirements)
        .where(inArray(variantRequirements.variantId, variantIds));
      await getDb().delete(variantRevisions).where(inArray(variantRevisions.variantId, variantIds));
      await getDb().delete(variants).where(inArray(variants.id, variantIds));
    }
    await getDb().delete(exercises).where(eq(exercises.id, familyId));
    if (insertedResources.length)
      await getDb().delete(resourceTypes).where(inArray(resourceTypes.id, insertedResources));
    if (insertedMuscles.length)
      await getDb().delete(muscleGroups).where(inArray(muscleGroups.code, insertedMuscles));
    await closeDb();
  });

  const inventory = (quantity: number, stable: boolean | null = null) => ({
    operationId: randomUUID(),
    place: "home",
    expectedRevision: inventoryRevision,
    resources: [
      { code: "dumbbell", quantity, isStable: null },
      { code: "stable_exercise_bench", quantity: 1, isStable: stable },
      { code: "chest_press_machine", quantity: 1, isStable: null },
      { code: "high_cable_station_with_bar", quantity: 1, isStable: null },
      { code: "resistance_band", quantity: 1, isStable: null },
      { code: "assisted_pull_up_machine", quantity: 1, isStable: null },
    ],
  });
  const query = (more: Record<string, string> = {}) => ({
    place: "home",
    direction: "strength",
    search: "Тест",
    ...more,
  });

  it("distinguishes unknown inventory from confirmed empty and scopes it to the place/account", async () => {
    expect((await getBuilderBootstrap(alice)).inventories).toEqual([]);
    await expect(getBuilderCatalog(alice, query())).rejects.toMatchObject({
      code: "INVENTORY_REQUIRED",
    });
    const input = { operationId: randomUUID(), place: "home", expectedRevision: 0, resources: [] };
    const [first, retry] = await Promise.all([
      saveBuilderInventory(alice, input),
      saveBuilderInventory(alice, input),
    ]);
    expect(first).toEqual(retry);
    inventoryRevision = first.revision;
    expect(
      (await getBuilderBootstrap(alice)).inventories[0].resources.map((row) => row.code),
    ).toEqual(expect.arrayContaining(["floor", "clear_space"]));
    expect((await getBuilderBootstrap(bob)).inventories).toEqual([]);
    await expect(getBuilderCatalog(alice, query({ place: "gym" }))).rejects.toMatchObject({
      code: "INVENTORY_REQUIRED",
    });
    expect(
      (await getBuilderCatalog(alice, query())).exercises.some(
        (row) => row.variantId === ids.get("bodyweight")!.variantId,
      ),
    ).toBe(true);
    await expect(
      saveBuilderInventory(alice, {
        ...input,
        resources: [{ code: "dumbbell", quantity: 2, isStable: null }],
      }),
    ).rejects.toMatchObject({ code: "OPERATION_REUSED" });
  });

  it("enforces resource quantities, explicit stable-support confirmation and skill gates", async () => {
    inventoryRevision = (await saveBuilderInventory(alice, inventory(1))).revision;
    let rows = (await getBuilderCatalog(alice, query())).exercises;
    expect(rows.some((row) => row.variantId === ids.get("pair")!.variantId)).toBe(false);
    inventoryRevision = (await saveBuilderInventory(alice, inventory(2))).revision;
    rows = (await getBuilderCatalog(alice, query())).exercises;
    expect(rows.some((row) => row.variantId === ids.get("pair")!.variantId)).toBe(true);
    expect(rows.some((row) => row.variantId === ids.get("bench")!.variantId)).toBe(false);
    inventoryRevision = (await saveBuilderInventory(alice, inventory(2, true))).revision;
    rows = (await getBuilderCatalog(alice, query())).exercises;
    expect(rows.some((row) => row.variantId === ids.get("bench")!.variantId)).toBe(true);
    expect(rows.some((row) => row.variantId === ids.get("skill")!.variantId)).toBe(false);
    expect(rows.find((row) => row.variantId === ids.get("bodyweight")!.variantId)?.status).toBe(
      "draft",
    );
    expect((await getPublishedCatalog()).some((row) => row.id.startsWith(familyId))).toBe(false);
  });

  it("filters DB muscle roles, actual resistance types, aliases and context/direction", async () => {
    const fixtures = async (more: Record<string, string>) =>
      (await getBuilderCatalog(alice, query(more))).exercises
        .filter((row) => row.variantId.startsWith(familyId))
        .map((row) => row.variantId);
    expect(await fixtures({ equipment: "free_weights" })).toEqual(
      expect.arrayContaining([ids.get("pair")!.variantId, ids.get("bench")!.variantId]),
    );
    expect(await fixtures({ equipment: "free_weights" })).not.toContain(ids.get("band")!.variantId);
    expect(await fixtures({ equipment: "machines" })).toEqual(
      expect.arrayContaining([ids.get("machine")!.variantId, ids.get("assisted")!.variantId]),
    );
    expect(await fixtures({ equipment: "cables" })).toEqual([ids.get("cable")!.variantId]);
    expect(await fixtures({ muscle: "back" })).toContain(ids.get("bodyweight")!.variantId);
    expect(await fixtures({ muscle: "triceps" })).toEqual([]);
    expect(await fixtures({ search: "alias pair" })).toEqual([ids.get("pair")!.variantId]);
    expect(await fixtures({ direction: "yoga" })).toEqual([]);
    const exercises = (await getBuilderCatalog(alice, query())).exercises;
    expect(
      exercises.find((row) => row.variantId === ids.get("machine")!.variantId)?.timing.setupSeconds,
    ).toEqual({ min: 30, max: 60 });
    expect(
      exercises.find((row) => row.variantId === ids.get("assisted")!.variantId)?.timing
        .setupSeconds,
    ).toEqual({ min: 30, max: 60 });
    expect(
      exercises.find((row) => row.variantId === ids.get("pair")!.variantId)?.timing.setupSeconds,
    ).toEqual({ min: 20, max: 45 });
  });

  it("saves a named private template exactly once under concurrent retries and blocks forged steps", async () => {
    saved = {
      operationId: randomUUID(),
      id: randomUUID(),
      expectedRevision: 0,
      name: "Мой вечер",
      place: "home",
      direction: "strength",
      inventoryRevision,
      steps: [
        { revisionId: ids.get("bodyweight")!.revisionId, sets: 3, target: 10, restSeconds: 60 },
      ],
    };
    const [first, retry] = await Promise.all([
      saveCustomWorkout(alice, saved),
      saveCustomWorkout(alice, saved),
    ]);
    expect(first).toEqual(retry);
    expect(first.name).toBe("Мой вечер");
    expect(first.estimate).toEqual({ minSeconds: 185, maxSeconds: 255, version: "planning-v1" });
    expect((await listCustomWorkouts(alice)).map((row) => row.id)).toContain(saved.id);
    expect(await listCustomWorkouts(bob)).toEqual([]);
    await expect(getCustomWorkout(bob, saved.id)).rejects.toMatchObject({
      code: "TEMPLATE_NOT_FOUND",
    });
    await expect(
      deleteCustomWorkout(bob, saved.id, { operationId: randomUUID(), expectedRevision: 1 }),
    ).rejects.toMatchObject({ code: "TEMPLATE_NOT_FOUND" });
    await expect(
      getDb()
        .insert(customWorkoutTemplateSteps)
        .values({
          userId: bob,
          templateId: saved.id,
          ordinal: 0,
          variantRevisionId: ids.get("bodyweight")!.revisionId,
          sets: 1,
          target: 10,
          restSeconds: 0,
          exercise: first.steps[0].exercise,
        }),
    ).rejects.toThrow();
    await expect(saveCustomWorkout(alice, { ...saved, name: "Other" })).rejects.toMatchObject({
      code: "OPERATION_REUSED",
    });
    await expect(
      saveCustomWorkout(alice, {
        ...saved,
        operationId: randomUUID(),
        id: randomUUID(),
        steps: [{ ...saved.steps[0], revisionId: ids.get("skill")!.revisionId }],
      }),
    ).rejects.toMatchObject({ code: "EXERCISE_UNAVAILABLE" });
    await expect(
      saveCustomWorkout(alice, {
        ...saved,
        operationId: randomUUID(),
        id: randomUUID(),
        steps: [{ ...saved.steps[0], target: 101 }],
      }),
    ).rejects.toMatchObject({ code: "INVALID_TARGET" });
    const count = await getDb()
      .select({ total: sql<number>`count(*)::int` })
      .from(customWorkoutTemplateSteps)
      .where(
        and(
          eq(customWorkoutTemplateSteps.userId, alice),
          eq(customWorkoutTemplateSteps.templateId, saved.id),
        ),
      );
    expect(count[0].total).toBe(1);
  });

  it("rejects a stale concurrent edit, permits a separate copy, and preserves the pinned old snapshot", async () => {
    const edits = await Promise.allSettled(
      ["Мой понедельник", "Мой вторник"].map((name) =>
        saveCustomWorkout(alice, {
          ...saved,
          operationId: randomUUID(),
          expectedRevision: 1,
          name,
        }),
      ),
    );
    expect(edits.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(edits.filter((result) => result.status === "rejected")).toHaveLength(1);
    const copy = await saveCustomWorkout(alice, {
      ...saved,
      id: randomUUID(),
      operationId: randomUUID(),
      name: "Копия",
    });
    expect(copy.id).not.toBe(saved.id);
    const [newRevision] = await getDb()
      .insert(variantRevisions)
      .values({
        variantId: ids.get("bodyweight")!.variantId,
        revision: 2,
        status: "revoked",
        instructions: "Revoked fixture",
        editorial,
      })
      .returning();
    expect(newRevision).toBeTruthy();
    expect((await getCustomWorkout(alice, saved.id)).steps[0].exercise.name).toBe(
      "Тест bodyweight",
    );
    expect(
      (await getBuilderCatalog(alice, query())).exercises.some(
        (row) => row.variantId === ids.get("bodyweight")!.variantId,
      ),
    ).toBe(false);
    await expect(
      saveCustomWorkout(alice, { ...saved, operationId: randomUUID(), expectedRevision: 2 }),
    ).rejects.toMatchObject({ code: "EXERCISE_UNAVAILABLE" });
    const command = { operationId: randomUUID(), expectedRevision: 1 };
    expect(await deleteCustomWorkout(alice, copy.id, command)).toEqual({ deleted: true });
    expect(await deleteCustomWorkout(alice, copy.id, command)).toEqual({ deleted: true });
    await expect(getCustomWorkout(alice, copy.id)).rejects.toMatchObject({
      code: "TEMPLATE_NOT_FOUND",
    });
  });

  it("rejects templates saved against a changed inventory without partial writes", async () => {
    const oldRevision = inventoryRevision;
    inventoryRevision = (await saveBuilderInventory(alice, inventory(1))).revision;
    const id = randomUUID();
    await expect(
      saveCustomWorkout(alice, {
        ...saved,
        id,
        operationId: randomUUID(),
        inventoryRevision: oldRevision,
        steps: [{ ...saved.steps[0], revisionId: ids.get("pair")!.revisionId }],
      }),
    ).rejects.toMatchObject({ code: "INVENTORY_CONFLICT" });
    expect(
      await getDb()
        .select()
        .from(customWorkoutTemplates)
        .where(and(eq(customWorkoutTemplates.userId, alice), eq(customWorkoutTemplates.id, id))),
    ).toEqual([]);
    const commands = await getDb()
      .select()
      .from(builderCommands)
      .where(eq(builderCommands.userId, alice));
    expect(commands.length).toBeGreaterThan(0);
  });

  it("persists standard gym equipment server-side and replays the update without another revision", async () => {
    const input = { operationId: randomUUID(), place: "gym", expectedRevision: 0, resources: [] };
    const inventory = await saveBuilderInventory(bob, input);
    expect(inventory.resources).toEqual(
      expect.arrayContaining([{ code: "dumbbell", quantity: 2, isStable: null }]),
    );
    expect(inventory.resources.some((item) => item.code === "yoga_block")).toBe(false);
    expect(await saveBuilderInventory(bob, input)).toEqual(inventory);
    const bootstrap = await getBuilderBootstrap(bob);
    expect(bootstrap.inventories.find((item) => item.place === "gym")?.revision).toBe(1);
    expect(
      (await getBuilderBootstrap(alice)).inventories.some((item) => item.place === "gym"),
    ).toBe(false);
  });
});
