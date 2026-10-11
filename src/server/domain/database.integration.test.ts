import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { and, eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { closeDb, getDb } from "../db";
import { seedCatalog } from "../db/seed";
import {
  aiReservations,
  dailyXp,
  workouts,
  profileResources,
  recordedSets,
  resourceTypes,
  skillGraphEdges,
  skillGraphNodes,
  skillGraphRevisions,
  templates,
  templateSteps,
  trials,
  user,
  variantRevisions,
  variants,
  workoutResources,
  workoutSteps,
  xpEvents,
} from "../db/schema";
import { getPublishedCatalog } from "./catalog";
import { getProfile, initializeAccount, updateProfile } from "./profile";
import { applyWorkoutCommand, createWorkout, getWorkout } from "./workouts";
import { reserveAiReply, settleAiReply } from "./trial";

if (existsSync(".env.local")) process.loadEnvFile(".env.local");
const enabled = process.env.RUN_DB_TESTS === "true";
describe.runIf(enabled)("PostgreSQL ownership, retries and concurrent quota", () => {
  const alice = randomUUID();
  const bob = randomUUID();
  let workoutId = "";
  beforeAll(async () => {
    const url = new URL(process.env.DATABASE_URL!);
    if (!["127.0.0.1", "localhost"].includes(url.hostname))
      throw new Error("Integration fixtures require a local PostgreSQL database");
    process.env.ENABLE_DEMO_WORKOUTS = "true";
    await seedCatalog();
    await getDb()
      .insert(user)
      .values([
        {
          id: alice,
          name: "Integration Alice",
          email: `${alice}@example.test`,
          emailVerified: true,
        },
        { id: bob, name: "Integration Bob", email: `${bob}@example.test`, emailVerified: true },
      ]);
    await Promise.all([initializeAccount(alice), initializeAccount(bob)]);
    const initial = await getProfile(alice);
    await updateProfile(alice, {
      ...initial.profile,
      name: "Integration Alice",
      location: "workout_park",
      onboardingCompleted: true,
      adultConfirmed: true,
      equipment: [
        { code: "floor", quantity: 1 },
        { code: "clear_space", quantity: 1 },
      ],
    });
    const workout = await createWorkout(alice);
    workoutId = workout.id;
  }, 30000);
  afterAll(async () => {
    await getDb()
      .delete(user)
      .where(sql`${user.id} in (${alice},${bob})`);
    await closeDb();
  });
  it("keeps all 300 catalog cards draft and prevents production selector leakage", async () => {
    const rows = await getDb().select().from(variants);
    expect(rows).toHaveLength(300);
    expect(rows.every((v) => v.status === "draft")).toBe(true);
    expect(await getPublishedCatalog()).toEqual([]);
  });
  it("pins graph nodes to revisions and rejects edges across graph versions", async () => {
    const [revision] = await getDb()
      .select()
      .from(variantRevisions)
      .where(eq(variantRevisions.variantId, "strength.squat.bodyweight"))
      .limit(1);
    const ids = [randomUUID(), randomUUID()];
    try {
      await getDb()
        .insert(skillGraphRevisions)
        .values(
          ids.map((id) => ({
            id,
            code: `integration-${id}`,
            nameRu: "Integration graph",
            revision: 1,
            sourceRefs: ["https://example.test/graph"],
          })),
        );
      await getDb()
        .insert(skillGraphNodes)
        .values(
          ids.map((id, i) => ({
            graphRevisionId: id,
            nodeKey: `node-${i}`,
            variantRevisionId: revision.id,
            skillGroup: "integration",
            prerequisiteMode: "all",
            assessment: "manual_coach_review",
            assessmentNotes: ["Integration fixture"],
          })),
        );
      await expect(
        getDb()
          .insert(skillGraphEdges)
          .values({
            graphRevisionId: ids[0],
            fromNodeKey: "node-0",
            toNodeKey: "node-1",
            kind: "preparation",
            sourceRefs: ["https://example.test/graph"],
          }),
      ).rejects.toThrow();
      await expect(
        getDb()
          .insert(skillGraphNodes)
          .values({
            graphRevisionId: ids[0],
            nodeKey: "missing-revision",
            variantRevisionId: randomUUID(),
            skillGroup: "integration",
            prerequisiteMode: "all",
            assessment: "manual_coach_review",
            assessmentNotes: ["Integration fixture"],
          }),
      ).rejects.toThrow();
      await getDb()
        .update(skillGraphRevisions)
        .set({ status: "published", reviewStatus: "approved" })
        .where(eq(skillGraphRevisions.id, ids[0]));
      await getDb()
        .update(variantRevisions)
        .set({ instructions: "Frozen graph fixture" })
        .where(eq(variantRevisions.id, revision.id));
      const result = await seedCatalog();
      expect(result.skippedVariants).toBeGreaterThanOrEqual(1);
      const [pinned] = await getDb()
        .select()
        .from(variantRevisions)
        .where(eq(variantRevisions.id, revision.id));
      expect(pinned.instructions).toBe("Frozen graph fixture");
    } finally {
      await getDb()
        .delete(skillGraphRevisions)
        .where(sql`${skillGraphRevisions.id} in (${ids[0]},${ids[1]})`);
      await getDb()
        .update(variantRevisions)
        .set({ instructions: revision.instructions })
        .where(eq(variantRevisions.id, revision.id));
    }
  });
  it("blocks skill-only content even when a card and template are published", async () => {
    const [source] = await getDb()
      .select()
      .from(variantRevisions)
      .where(sql`${variantRevisions.editorial}->'execution'->>'assignmentGate' = 'skill_review'`)
      .limit(1);
    expect(source?.editorial).toBeTruthy();
    const [sourceVariant] = await getDb()
      .select()
      .from(variants)
      .where(eq(variants.id, source.variantId));
    const variantId = `integration.${randomUUID()}`;
    const templateId = randomUUID();
    try {
      await getDb().insert(variants).values({
        id: variantId,
        exerciseId: sourceVariant.exerciseId,
        nameRu: "Integration skill",
        aliasEn: "Integration skill",
        pattern: sourceVariant.pattern,
        resistanceMode: sourceVariant.resistanceMode,
        metric: sourceVariant.metric,
        status: "published",
        sourceBasis: "integration_fixture",
      });
      const [revision] = await getDb()
        .insert(variantRevisions)
        .values({
          variantId,
          revision: 1,
          status: "published",
          instructions: "Integration fixture",
          editorial: source.editorial,
        })
        .returning();
      await getDb().insert(templates).values({
        id: templateId,
        code: templateId,
        name: "Integration skill",
        status: "published",
      });
      await getDb()
        .insert(templateSteps)
        .values({ templateId, variantRevisionId: revision.id, ordinal: 0, sets: 1, reps: 1 });
      expect(await getPublishedCatalog()).toEqual([]);
      const profile = await getProfile(bob);
      await updateProfile(bob, {
        ...profile.profile,
        onboardingCompleted: true,
        adultConfirmed: true,
        equipment: [
          { code: "floor", quantity: 1 },
          { code: "clear_space", quantity: 1 },
        ],
      });
      await expect(createWorkout(bob, { templateCode: templateId })).rejects.toMatchObject({
        code: "SKILL_ASSESSMENT_REQUIRED",
      });
      // A published V1 card cannot bypass the gate by lacking the new field.
      await getDb()
        .update(variantRevisions)
        .set({ editorial: sql`${variantRevisions.editorial} - 'execution'` })
        .where(eq(variantRevisions.id, revision.id));
      expect(await getPublishedCatalog()).toEqual([]);
      await expect(createWorkout(bob, { templateCode: templateId })).rejects.toMatchObject({
        code: "CONTENT_NOT_PUBLISHED",
      });
      // Explicit standard gate still cannot bypass an absent or contradictory skill demand.
      await getDb()
        .update(variantRevisions)
        .set({
          editorial: sql`jsonb_set(${JSON.stringify(source.editorial)}::jsonb - 'skillDemand', '{execution,assignmentGate}', '"standard_review"'::jsonb)`,
        })
        .where(eq(variantRevisions.id, revision.id));
      expect(await getPublishedCatalog()).toEqual([]);
      await expect(createWorkout(bob, { templateCode: templateId })).rejects.toMatchObject({
        code: "CONTENT_NOT_PUBLISHED",
      });
      await getDb()
        .update(variantRevisions)
        .set({
          editorial: sql`jsonb_set(${JSON.stringify(source.editorial)}::jsonb, '{execution,assignmentGate}', '"standard_review"'::jsonb)`,
        })
        .where(eq(variantRevisions.id, revision.id));
      expect(await getPublishedCatalog()).toEqual([]);
      await expect(createWorkout(bob, { templateCode: templateId })).rejects.toMatchObject({
        code: "SKILL_ASSESSMENT_REQUIRED",
      });
      // Unknown preparation is closed until it has an explicit stable-ID policy entry.
      await getDb()
        .update(variantRevisions)
        .set({
          editorial: sql`jsonb_set(jsonb_set(${JSON.stringify(source.editorial)}::jsonb, '{execution,assignmentGate}', '"standard_review"'::jsonb), '{skillDemand}', '{"kind":"preparation","requiresPriorSkill":false,"rationale":"Unregistered preparation fixture"}'::jsonb)`,
        })
        .where(eq(variantRevisions.id, revision.id));
      expect(await getPublishedCatalog()).toEqual([]);
      await expect(createWorkout(bob, { templateCode: templateId })).rejects.toMatchObject({
        code: "CONTENT_NOT_PUBLISHED",
      });
      // A known movement remains blocked even if both stored demand and gate are downgraded.
      await getDb()
        .update(templateSteps)
        .set({ variantRevisionId: source.id })
        .where(eq(templateSteps.templateId, templateId));
      await getDb()
        .update(variants)
        .set({ status: "published" })
        .where(eq(variants.id, sourceVariant.id));
      await getDb()
        .update(variantRevisions)
        .set({
          status: "published",
          editorial: sql`jsonb_set(jsonb_set(${JSON.stringify(source.editorial)}::jsonb, '{execution,assignmentGate}', '"standard_review"'::jsonb), '{skillDemand}', '{"kind":"none","requiresPriorSkill":false,"rationale":"Integration downgrade fixture"}'::jsonb)`,
        })
        .where(eq(variantRevisions.id, source.id));
      expect(await getPublishedCatalog()).toEqual([]);
      await expect(createWorkout(bob, { templateCode: templateId })).rejects.toMatchObject({
        code: "SKILL_ASSESSMENT_REQUIRED",
      });
    } finally {
      await getDb()
        .update(variantRevisions)
        .set({ status: source.status, editorial: source.editorial })
        .where(eq(variantRevisions.id, source.id));
      await getDb()
        .update(variants)
        .set({ status: sourceVariant.status })
        .where(eq(variants.id, sourceVariant.id));
      await getDb().delete(templates).where(eq(templates.id, templateId));
      await getDb().delete(variantRevisions).where(eq(variantRevisions.variantId, variantId));
      await getDb().delete(variants).where(eq(variants.id, variantId));
    }
  });
  it("refreshes local demo composition without changing approved templates or step IDs", async () => {
    const [template] = await getDb()
      .select()
      .from(templates)
      .where(eq(templates.code, "demo-mobility"));
    const original = await getDb()
      .select()
      .from(templateSteps)
      .where(eq(templateSteps.templateId, template.id))
      .orderBy(templateSteps.ordinal);
    expect(original).toHaveLength(3);
    try {
      await getDb().delete(templateSteps).where(eq(templateSteps.id, original[2].id));
      await getDb()
        .update(templates)
        .set({ status: "published" })
        .where(eq(templates.id, template.id));
      await seedCatalog();
      expect(
        await getDb()
          .select()
          .from(templateSteps)
          .where(eq(templateSteps.templateId, template.id))
          .orderBy(templateSteps.ordinal),
      ).toEqual(original.slice(0, 2));
      const [saved] = await getDb().select().from(templates).where(eq(templates.id, template.id));
      expect(saved.status).toBe("published");
    } finally {
      await getDb()
        .update(templates)
        .set({ status: template.status })
        .where(eq(templates.id, template.id));
      await getDb().insert(templateSteps).values(original[2]).onConflictDoNothing();
    }
    await seedCatalog();
    expect(
      await getDb()
        .select()
        .from(templateSteps)
        .where(eq(templateSteps.templateId, template.id))
        .orderBy(templateSteps.ordinal),
    ).toEqual(original);
  });
  it("snapshots inventory and blocks another owner at query and composite FK", async () => {
    await expect(getWorkout(bob, workoutId)).rejects.toMatchObject({ status: 404 });
    const workout = await getWorkout(alice, workoutId);
    await expect(
      getDb().insert(recordedSets).values({
        userId: bob,
        workoutId,
        stepId: workout.exercises[0].id,
        setIndex: 0,
        reps: 8,
        weightG: 0,
      }),
    ).rejects.toThrow();
    const initial = await getProfile(alice);
    expect(initial.profile.location).toBe("workout_park");
    await updateProfile(alice, { ...initial.profile, equipment: [] });
    expect(
      await getDb().select().from(profileResources).where(eq(profileResources.userId, alice)),
    ).toHaveLength(0);
    expect(
      await getDb()
        .select()
        .from(workoutResources)
        .where(and(eq(workoutResources.userId, alice), eq(workoutResources.workoutId, workoutId))),
    ).toHaveLength(2);
    expect(await getDb().select().from(resourceTypes)).not.toHaveLength(0);
    // A nonempty workout reads its own copies when draft source content is revised and reseeded.
    const snapshot = await getWorkout(alice, workoutId);
    const copiedSteps = await getDb()
      .select()
      .from(workoutSteps)
      .where(eq(workoutSteps.workoutId, workoutId))
      .orderBy(workoutSteps.ordinal);
    const [source] = await getDb()
      .select()
      .from(variantRevisions)
      .where(eq(variantRevisions.id, copiedSteps[0].variantRevisionId));
    try {
      await getDb()
        .update(variantRevisions)
        .set({
          instructions: "Integration changed source instructions",
          editorial: sql`jsonb_set(${variantRevisions.editorial}, '{displayNameRu}', '"Изменённое имя источника"'::jsonb)`,
        })
        .where(eq(variantRevisions.id, source.id));
      expect(await getWorkout(alice, workoutId)).toEqual(snapshot);
      await seedCatalog();
      expect(await getWorkout(alice, workoutId)).toEqual(snapshot);
      expect(
        await getDb()
          .select()
          .from(workoutSteps)
          .where(eq(workoutSteps.workoutId, workoutId))
          .orderBy(workoutSteps.ordinal),
      ).toEqual(copiedSteps);
    } finally {
      await getDb()
        .update(variantRevisions)
        .set({ instructions: source.instructions, editorial: source.editorial })
        .where(eq(variantRevisions.id, source.id));
    }
  });
  it("serializes concurrent duplicate commands; finish credits exactly one XP event", async () => {
    let workout = await getWorkout(alice, workoutId);
    const duplicate = {
      operationId: randomUUID(),
      expectedRevision: workout.revision,
      command: {
        type: "record_set",
        exerciseId: workout.exercises[0].id,
        setId: randomUUID(),
        reps: 8,
        weightKg: 0,
      },
    };
    const acks = await Promise.all(
      Array.from({ length: 8 }, () => applyWorkoutCommand(alice, workoutId, duplicate)),
    );
    for (const ack of acks) expect(ack).toEqual(acks[0]);
    expect(acks[0].workout.recordedSets).toHaveLength(1);
    await expect(applyWorkoutCommand(bob, workoutId, duplicate)).rejects.toMatchObject({
      status: 404,
    });
    await expect(
      applyWorkoutCommand(alice, workoutId, {
        ...duplicate,
        command: { ...duplicate.command, reps: 9 },
      }),
    ).rejects.toMatchObject({ code: "OPERATION_REUSED" });
    await expect(
      applyWorkoutCommand(alice, workoutId, {
        operationId: randomUUID(),
        expectedRevision: 1,
        command: { type: "finish" },
      }),
    ).rejects.toMatchObject({ code: "REVISION_CONFLICT" });
    workout = acks[0].workout;
    for (let index = 0; index < workout.exercises.length; index++) {
      const exercise = workout.exercises[index];
      while (
        workout.recordedSets.filter((s) => s.exerciseId === exercise.id).length < exercise.sets
      ) {
        workout = (
          await applyWorkoutCommand(alice, workoutId, {
            operationId: randomUUID(),
            expectedRevision: workout.revision,
            command: {
              type: "record_set",
              exerciseId: exercise.id,
              setId: randomUUID(),
              reps: 8,
              weightKg: 0,
            },
          })
        ).workout;
      }
      if (index < workout.exercises.length - 1)
        workout = (
          await applyWorkoutCommand(alice, workoutId, {
            operationId: randomUUID(),
            expectedRevision: workout.revision,
            command: { type: "next_exercise" },
          })
        ).workout;
    }
    const finish = {
      operationId: randomUUID(),
      expectedRevision: workout.revision,
      command: { type: "finish" },
    };
    const results = await Promise.all([
      applyWorkoutCommand(alice, workoutId, finish),
      applyWorkoutCommand(alice, workoutId, finish),
    ]);
    expect(results[0]).toEqual(results[1]);
    expect(results[0].progress.xp).toBe(50);
    expect(await getDb().select().from(xpEvents).where(eq(xpEvents.userId, alice))).toHaveLength(1);
  }, 30000);
  it("grants trial once and atomically bounds 130 concurrent reservations to 100", async () => {
    const before = (await getProfile(alice)).trial;
    await Promise.all(Array.from({ length: 10 }, () => initializeAccount(alice)));
    expect((await getProfile(alice)).trial.startsAt).toBe(before.startsAt);
    const attempts = await Promise.allSettled(
      Array.from({ length: 130 }, () => reserveAiReply(alice, randomUUID())),
    );
    const accepted = attempts.filter((r) => r.status === "fulfilled");
    expect(accepted).toHaveLength(100);
    const [trial] = await getDb().select().from(trials).where(eq(trials.userId, alice));
    expect(trial.used + trial.reserved).toBe(100);
    const [reservation] = await getDb()
      .select()
      .from(aiReservations)
      .where(eq(aiReservations.userId, alice));
    await Promise.all([
      settleAiReply(alice, reservation.id, true),
      settleAiReply(alice, reservation.id, true),
    ]);
    const [settled] = await getDb().select().from(trials).where(eq(trials.userId, alice));
    expect(settled.used).toBe(1);
    expect(settled.reserved).toBe(99);
    await expect(settleAiReply(bob, reservation.id, true)).rejects.toMatchObject({ status: 404 });
    const [other] = await getDb()
      .select()
      .from(aiReservations)
      .where(and(eq(aiReservations.userId, alice), eq(aiReservations.status, "reserved")));
    await settleAiReply(alice, other.id, false);
    await reserveAiReply(alice, randomUUID());
    const [final] = await getDb().select().from(trials).where(eq(trials.userId, alice));
    expect(final.used + final.reserved).toBe(100);
  }, 30000);
  it("stores seconds exclusively, enforces SQL result shape and replays timed commands", async () => {
    const profile = (await getProfile(bob)).profile;
    await updateProfile(bob, {
      ...profile,
      onboardingCompleted: true,
      adultConfirmed: true,
      equipment: [
        { code: "floor", quantity: 1 },
        { code: "clear_space", quantity: 1 },
      ],
    });
    const workout = await createWorkout(bob);
    const stepId = workout.exercises[0].id;
    const command = {
      operationId: randomUUID(),
      expectedRevision: workout.revision,
      command: {
        type: "record_timed_set" as const,
        exerciseId: stepId,
        setId: randomUUID(),
        durationSeconds: 37,
      },
    };
    await getDb().update(workoutSteps).set({ metric: "reps" }).where(eq(workoutSteps.id, stepId));
    await expect(applyWorkoutCommand(bob, workout.id, command)).rejects.toMatchObject({
      code: "INVALID_METRIC",
    });
    await getDb().update(workoutSteps).set({ metric: "time" }).where(eq(workoutSteps.id, stepId));
    for (const invalid of [
      { reps: 8, durationSeconds: 20 },
      { reps: null, durationSeconds: null },
      { reps: null, durationSeconds: 0 },
      { reps: null, durationSeconds: 86401 },
    ])
      await expect(
        getDb()
          .insert(recordedSets)
          .values({
            userId: bob,
            workoutId: workout.id,
            stepId,
            setIndex: 0,
            weightG: 0,
            ...invalid,
          }),
      ).rejects.toThrow();
    const [first, replay] = await Promise.all([
      applyWorkoutCommand(bob, workout.id, command),
      applyWorkoutCommand(bob, workout.id, command),
    ]);
    expect(first).toEqual(replay);
    expect(first.workout.recordedSets).toHaveLength(1);
    expect(first.workout.recordedSets[0]).toMatchObject({
      reps: null,
      durationSeconds: 37,
      weightKg: 0,
    });
    await expect(applyWorkoutCommand(alice, workout.id, command)).rejects.toMatchObject({
      status: 404,
    });
    await expect(
      applyWorkoutCommand(bob, workout.id, {
        ...command,
        command: { ...command.command, durationSeconds: 38 },
      }),
    ).rejects.toMatchObject({ status: 409 });
  });
  it("preserves skipped results, derives terminal outcomes, and atomically tops up one daily award", async () => {
    const ownerId = randomUUID();
    await getDb()
      .insert(user)
      .values({
        id: ownerId,
        name: "XP fixture",
        email: `${ownerId}@example.test`,
        emailVerified: true,
      });
    try {
      await initializeAccount(ownerId);
      const initial = await getProfile(ownerId);
      await updateProfile(ownerId, {
        ...initial.profile,
        onboardingCompleted: true,
        adultConfirmed: true,
        equipment: [
          { code: "floor", quantity: 1 },
          { code: "clear_space", quantity: 1 },
        ],
      });
      const source = await createWorkout(ownerId);
      const [sourceRow] = await getDb().select().from(workouts).where(eq(workouts.id, source.id));
      const sourceSteps = await getDb()
        .select()
        .from(workoutSteps)
        .where(eq(workoutSteps.workoutId, source.id));
      const day = "2026-10-01";
      // Multiple admitted sessions intentionally simulate devices that finish concurrently.
      const fixture = async (kind: "main" | "support", dayValue = day) => {
        const id = randomUUID();
        await getDb()
          .insert(workouts)
          .values({
            ...sourceRow,
            id,
            status: "active",
            revision: 1,
            currentIndex: 0,
            rewardKind: kind,
            rewardDay: dayValue,
            reward: null,
            completedAt: null,
          });
        await getDb()
          .insert(workoutSteps)
          .values(
            sourceSteps.map((step, ordinal) => ({
              ...step,
              id: randomUUID(),
              workoutId: id,
              ordinal,
              sets: 1,
              skipped: false,
            })),
          );
        return getWorkout(ownerId, id);
      };
      const command = async (w: Awaited<ReturnType<typeof getWorkout>>, action: unknown) =>
        applyWorkoutCommand(ownerId, w.id, {
          operationId: randomUUID(),
          expectedRevision: w.revision,
          command: action,
        });
      const record = async (w: Awaited<ReturnType<typeof getWorkout>>) =>
        (
          await command(w, {
            type: "record_set",
            exerciseId: w.exercises[w.currentIndex].id,
            setId: randomUUID(),
            reps: 8,
            weightKg: 0,
          })
        ).workout;
      const full = async (kind: "main" | "support", date = day) => {
        let w = await fixture(kind, date);
        for (let i = 0; i < w.exercises.length; i++) {
          w = await record(w);
          if (i < w.exercises.length - 1) w = (await command(w, { type: "next_exercise" })).workout;
        }
        return w;
      };
      const support = await full("support");
      const supportAck = await command(support, { type: "finish" });
      expect(supportAck.workout.reward).toMatchObject({
        eligibleXp: 20,
        awardedXp: 20,
        dayTotalXp: 20,
        day,
      });
      let partial = await fixture("main");
      partial = await record(partial);
      // Fully logged current exercises cannot be called skipped.
      await expect(
        command(partial, { type: "skip_exercise", exerciseId: partial.exercises[0].id }),
      ).rejects.toMatchObject({ code: "INVALID_EXERCISE" });
      const end = {
        operationId: randomUUID(),
        expectedRevision: partial.revision,
        command: { type: "end_early" },
      };
      const partialAck = await applyWorkoutCommand(ownerId, partial.id, end);
      expect(partialAck.workout).toMatchObject({
        status: "partial",
        reward: { eligibleXp: 25, awardedXp: 5, dayTotalXp: 25 },
      });
      expect(await applyWorkoutCommand(ownerId, partial.id, end)).toEqual(partialAck);
      await expect(command(partialAck.workout, { type: "end_early" })).rejects.toMatchObject({
        code: "WORKOUT_FINISHED",
      });
      const mainA = await full("main");
      const mainB = await full("main");
      const results = await Promise.all([
        command(mainA, { type: "finish" }),
        command(mainB, { type: "finish" }),
      ]);
      expect(results.map((r) => r.workout.reward!.awardedXp).sort((a, b) => a - b)).toEqual([
        0, 25,
      ]);
      const [ledger] = await getDb()
        .select()
        .from(dailyXp)
        .where(and(eq(dailyXp.userId, ownerId), eq(dailyXp.day, day)));
      expect(ledger.amount).toBe(50);
      expect((await getProfile(ownerId)).progress).toMatchObject({ xp: 50, completedWorkouts: 3 });
      // Skipping a partially recorded exercise preserves rows and ends partial.
      let skipped = await fixture("support", "2026-10-02");
      await getDb()
        .update(workoutSteps)
        .set({ sets: 2 })
        .where(eq(workoutSteps.id, skipped.exercises[0].id));
      skipped = await getWorkout(ownerId, skipped.id);
      skipped = await record(skipped);
      skipped = (
        await command(skipped, { type: "skip_exercise", exerciseId: skipped.exercises[0].id })
      ).workout;
      expect(skipped.recordedSets).toHaveLength(1);
      while (skipped.currentIndex < skipped.exercises.length - 1)
        skipped = (
          await command(skipped, {
            type: "skip_exercise",
            exerciseId: skipped.exercises[skipped.currentIndex].id,
          })
        ).workout;
      skipped = (
        await command(skipped, {
          type: "skip_exercise",
          exerciseId: skipped.exercises[skipped.currentIndex].id,
        })
      ).workout;
      const skippedAck = await command(skipped, { type: "finish" });
      expect(skippedAck.workout).toMatchObject({
        status: "partial",
        reward: { awardedXp: 10, day: "2026-10-02" },
      });
      expect(skippedAck.workout.recordedSets).toHaveLength(1);
      const aborted = await fixture("main", "2026-10-03");
      const abortedAck = await command(aborted, { type: "end_early" });
      expect(abortedAck.workout).toMatchObject({ status: "aborted", reward: { awardedXp: 0 } });
      expect(
        (await getProfile(ownerId)).progress.history.some(
          (h) => h.id === aborted.id && h.status === "aborted",
        ),
      ).toBe(true);
      // Legacy cross-midnight events guard the admission bucket while original XP remains.
      let legacy = await fixture("main", "2026-09-30");
      await getDb()
        .update(workouts)
        .set({ startedAt: new Date("2026-09-30T20:59:00Z"), rewardDay: null })
        .where(eq(workouts.id, legacy.id));
      await getDb()
        .insert(xpEvents)
        .values({
          userId: ownerId,
          workoutId: legacy.id,
          event: "legacy_fixture",
          amount: 50,
          createdAt: new Date("2026-09-30T21:01:00Z"),
        });
      await getDb().execute(sql`
        INSERT INTO daily_xp (user_id, day, amount)
        SELECT e.user_id, COALESCE(w.reward_day, (COALESCE(w.started_at,w.created_at) AT TIME ZONE 'Europe/Moscow')::date), LEAST(50,SUM(e.amount))::integer
        FROM xp_events e JOIN workouts w ON w.id=e.workout_id AND w.user_id=e.user_id
        WHERE e.user_id=${ownerId} AND e.workout_id=${legacy.id}
        GROUP BY e.user_id, COALESCE(w.reward_day, (COALESCE(w.started_at,w.created_at) AT TIME ZONE 'Europe/Moscow')::date)
        ON CONFLICT (user_id,day) DO UPDATE SET amount=GREATEST(daily_xp.amount,EXCLUDED.amount)
      `);
      legacy = await record(legacy);
      const legacyAck = await command(legacy, { type: "end_early" });
      expect(legacyAck.workout.reward).toMatchObject({
        day: "2026-09-30",
        awardedXp: 0,
        dayTotalXp: 50,
      });
      expect((await getProfile(ownerId)).progress.xp).toBe(110);
      // An old admission is credited to its pinned day, not today's sync date.
      expect(skippedAck.workout.reward?.day).toBe("2026-10-02");
      await expect(
        getDb().update(dailyXp).set({ amount: 51 }).where(eq(dailyXp.userId, ownerId)),
      ).rejects.toThrow();
    } finally {
      await getDb().delete(user).where(eq(user.id, ownerId));
    }
  }, 30000);
});
