import { sql } from "drizzle-orm";
import type {
  CompanionId,
  EnergyActivity,
  WorkoutEnergyEstimate,
  WorkoutReward,
  Workout,
} from "../../shared/contracts";
import type { WorkoutLoadFeedback } from "../../shared/workout-feedback";
import type { DropSetPlan, DropSetResult } from "../../shared/training-methods";
import type { CatalogEditorial } from "../../shared/catalog-taxonomy";
import type { BuilderExercise, BuilderEstimate } from "../../shared/workout-builder";
import type { PlannerDraft, PlannerStep } from "../../shared/workout-planner";
import type { AssistantReply, AssistantHistoryReceipt } from "../../shared/assistant";
import type { CalendarSnapshot, CalendarEntry } from "../../shared/calendar";
import type { CommunicationPreferences, MemoryScope } from "../../shared/communication-memory";
import type { Dish, MealPlanItem, FoodEntry, NutritionPreferences } from "../../shared/nutrition";
import {
  bigint,
  boolean,
  check,
  date,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

const created = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const updated = () => timestamp("updated_at", { withTimezone: true }).notNull().defaultNow();
const id = () => uuid("id").primaryKey().defaultRandom();

// The Better Auth principal is the application's sole account ID.
export const user = pgTable(
  "users",
  {
    id: id(),
    name: text("name").notNull(),
    email: text("email").notNull().unique(),
    emailVerified: boolean("email_verified").notNull().default(false),
    image: text("image"),
    status: text("status").notNull().default("active"),
    createdAt: created(),
    updatedAt: updated(),
  },
  (t) => [check("users_status_check", sql`${t.status} in ('active','deleting','deleted')`)],
);
export const session = pgTable(
  "auth_sessions",
  {
    id: id(),
    userId: uuid("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    token: text("token").notNull().unique(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    createdAt: created(),
    updatedAt: updated(),
  },
  (t) => [index("auth_sessions_user_idx").on(t.userId)],
);
export const account = pgTable(
  "auth_accounts",
  {
    id: id(),
    userId: uuid("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at", { withTimezone: true }),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at", { withTimezone: true }),
    scope: text("scope"),
    password: text("password"),
    createdAt: created(),
    updatedAt: updated(),
  },
  (t) => [
    unique("auth_accounts_provider_subject_uq").on(t.providerId, t.accountId),
    index("auth_accounts_user_idx").on(t.userId),
  ],
);
export const verification = pgTable(
  "auth_verifications",
  {
    id: id(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: created(),
    updatedAt: updated(),
  },
  (t) => [index("auth_verifications_identifier_idx").on(t.identifier)],
);
export const rateLimit = pgTable("auth_rate_limits", {
  id: id(),
  key: text("key").notNull().unique(),
  count: integer("count").notNull(),
  lastRequest: bigint("last_request", { mode: "number" }).notNull(),
});

export const profiles = pgTable(
  "profiles",
  {
    userId: uuid("user_id")
      .primaryKey()
      .references(() => user.id, { onDelete: "cascade" }),
    displayName: text("display_name").notNull().default(""),
    goal: text("goal").notNull().default("habit"),
    experience: text("experience").notNull().default("beginner"),
    weeklyDays: integer("weekly_days").notNull().default(3),
    defaultMinutes: integer("default_minutes").notNull().default(25),
    timezone: text("timezone").notNull().default("Europe/Moscow"),
    companion: text("companion").notNull().default("max"),
    revision: integer("revision").notNull().default(1),
    createdAt: created(),
    updatedAt: updated(),
    theme: text("theme").notNull().default("dark"),
    discipline: text("discipline").notNull().default("strength"),
    location: text("location").notNull().default("home"),
    onboardingCompleted: boolean("onboarding_completed").notNull().default(false),
    onboardingInterests: text("onboarding_interests")
      .array()
      .notNull()
      .default(sql`ARRAY[]::text[]`),
    onboardingOperationId: uuid("onboarding_operation_id"),
    onboardingPayloadHash: text("onboarding_payload_hash"),
    adultConfirmed: boolean("adult_confirmed").notNull().default(false),
    remindersEnabled: boolean("reminders_enabled").notNull().default(false),
    showWorkoutEnergy: boolean("show_workout_energy").notNull().default(true),
    trainingDays: integer("training_days")
      .array()
      .notNull()
      .default(sql`ARRAY[1,3,5]::integer[]`),
    reminderTime: text("reminder_time").notNull().default("19:00"),
  },
  (t) => [
    check("profiles_days_check", sql`${t.weeklyDays} between 1 and 7`),
    check("profiles_minutes_check", sql`${t.defaultMinutes} between 5 and 180`),
    check("profiles_revision_check", sql`${t.revision} >= 1`),
    check("profiles_companion_check", sql`${t.companion} in ('max','lika')`),
    check("profiles_experience_check", sql`${t.experience} in ('beginner','returning','regular')`),
    check(
      "profiles_settings_check",
      sql`${t.theme} in ('dark','rose') and ${t.goal} in ('habit','strength','energy') and ${t.discipline} in ('strength','calisthenics','mobility','yoga') and ${t.location} in ('home','gym','outdoor','workout_park')`,
    ),
    check(
      "profiles_schedule_check",
      sql`cardinality(${t.trainingDays}) between 1 and 7 and ${t.trainingDays} <@ ARRAY[0,1,2,3,4,5,6]::integer[] and ${t.reminderTime} ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'`,
    ),
  ],
);
export const resourceTypes = pgTable(
  "resource_types",
  {
    id: id(),
    code: text("code").notNull().unique(),
    nameRu: text("name_ru").notNull(),
    kind: text("kind").notNull(),
    createdAt: created(),
  },
  (t) => [
    check("resource_types_kind_check", sql`${t.kind} in ('equipment','support','space','anchor')`),
  ],
);
export const equipmentProfiles = pgTable(
  "equipment_profiles",
  {
    id: id(),
    userId: uuid("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    place: text("place").notNull(),
    revision: integer("revision").notNull().default(1),
    createdAt: created(),
    updatedAt: updated(),
  },
  (t) => [
    unique("equipment_profiles_owner_id_uq").on(t.userId, t.id),
    index("equipment_profiles_user_idx").on(t.userId),
    check(
      "equipment_profiles_place_check",
      sql`${t.place} in ('home','gym','outdoor','workout_park','other')`,
    ),
  ],
);
export const profileResources = pgTable(
  "profile_resources",
  {
    id: id(),
    userId: uuid("user_id").notNull(),
    equipmentProfileId: uuid("equipment_profile_id").notNull(),
    resourceTypeId: uuid("resource_type_id")
      .notNull()
      .references(() => resourceTypes.id, { onDelete: "restrict" }),
    quantity: integer("quantity").notNull(),
    maxLoadG: integer("max_load_g"),
    isStable: boolean("is_stable"),
    confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
    createdAt: created(),
  },
  (t) => [
    foreignKey({
      columns: [t.userId, t.equipmentProfileId],
      foreignColumns: [equipmentProfiles.userId, equipmentProfiles.id],
    }).onDelete("cascade"),
    unique("profile_resources_type_uq").on(t.equipmentProfileId, t.resourceTypeId),
    index("profile_resources_owner_idx").on(t.userId, t.equipmentProfileId),
    check("profile_resources_quantity_check", sql`${t.quantity} > 0`),
    check("profile_resources_load_check", sql`${t.maxLoadG} is null or ${t.maxLoadG} > 0`),
  ],
);

export const exercises = pgTable("exercises", {
  id: text("id").primaryKey(),
  nameRu: text("name_ru").notNull(),
  discipline: text("discipline").notNull(),
  createdAt: created(),
});
export const variants = pgTable(
  "exercise_variants",
  {
    id: text("id").primaryKey(),
    exerciseId: text("exercise_id")
      .notNull()
      .references(() => exercises.id, { onDelete: "restrict" }),
    nameRu: text("name_ru").notNull(),
    aliasEn: text("alias_en").notNull(),
    pattern: text("pattern").notNull(),
    resistanceMode: text("resistance_mode").notNull(),
    metric: text("metric").notNull(),
    status: text("status").notNull().default("draft"),
    sourceBasis: text("source_basis").notNull(),
    createdAt: created(),
  },
  (t) => [
    index("variants_exercise_idx").on(t.exerciseId),
    check("variants_status_check", sql`${t.status} in ('draft','published','retired','revoked')`),
  ],
);
export const variantRequirements = pgTable(
  "variant_requirements",
  {
    variantId: text("variant_id")
      .notNull()
      .references(() => variants.id, { onDelete: "cascade" }),
    resourceTypeId: uuid("resource_type_id")
      .notNull()
      .references(() => resourceTypes.id, { onDelete: "restrict" }),
    quantity: integer("quantity").notNull().default(1),
    requiresConfirmation: boolean("requires_confirmation").notNull().default(false),
  },
  (t) => [
    primaryKey({ columns: [t.variantId, t.resourceTypeId] }),
    check("variant_requirements_quantity_check", sql`${t.quantity} > 0`),
    index("variant_requirements_resource_idx").on(t.resourceTypeId),
  ],
);
export const variantRevisions = pgTable(
  "variant_revisions",
  {
    id: id(),
    variantId: text("variant_id")
      .notNull()
      .references(() => variants.id, { onDelete: "restrict" }),
    revision: integer("revision").notNull(),
    status: text("status").notNull().default("draft"),
    instructions: text("instructions").notNull(),
    editorial: jsonb("editorial").$type<CatalogEditorial>(),
    createdAt: created(),
  },
  (t) => [
    unique("variant_revisions_version_uq").on(t.variantId, t.revision),
    check(
      "variant_revisions_status_check",
      sql`${t.status} in ('draft','published','retired','revoked')`,
    ),
  ],
);
export const muscleGroups = pgTable("muscle_groups", {
  code: text("code").primaryKey(),
  nameRu: text("name_ru").notNull(),
});

export const variantRevisionMuscles = pgTable(
  "variant_revision_muscles",
  {
    variantRevisionId: uuid("variant_revision_id")
      .notNull()
      .references(() => variantRevisions.id, { onDelete: "cascade" }),
    muscleGroupCode: text("muscle_group_code")
      .notNull()
      .references(() => muscleGroups.code, { onDelete: "restrict" }),
    role: text("role").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.variantRevisionId, t.muscleGroupCode] }),
    index("variant_revision_muscles_group_role_idx").on(t.muscleGroupCode, t.role),
    check(
      "variant_revision_muscles_role_check",
      sql`${t.role} in ('primary','secondary','stabilizer')`,
    ),
  ],
);
// Skill content is versioned independently and pins exact exercise revisions.
export const skillGraphRevisions = pgTable(
  "skill_graph_revisions",
  {
    id: id(),
    code: text("code").notNull(),
    nameRu: text("name_ru").notNull(),
    revision: integer("revision").notNull(),
    status: text("status").notNull().default("draft"),
    reviewStatus: text("review_status").notNull().default("pending_expert_review"),
    sourceRefs: jsonb("source_refs").$type<string[]>().notNull(),
    createdAt: created(),
  },
  (t) => [
    unique("skill_graph_revisions_version_uq").on(t.code, t.revision),
    check("skill_graph_revision_check", sql`${t.revision} >= 1`),
    check(
      "skill_graph_status_check",
      sql`${t.status} in ('draft','published','retired','revoked')`,
    ),
    check(
      "skill_graph_review_check",
      sql`${t.reviewStatus} in ('pending_expert_review','approved')`,
    ),
  ],
);
export const skillGraphNodes = pgTable(
  "skill_graph_nodes",
  {
    graphRevisionId: uuid("graph_revision_id")
      .notNull()
      .references(() => skillGraphRevisions.id, { onDelete: "cascade" }),
    nodeKey: text("node_key").notNull(),
    variantRevisionId: uuid("variant_revision_id")
      .notNull()
      .references(() => variantRevisions.id, { onDelete: "restrict" }),
    skillGroup: text("skill_group").notNull(),
    prerequisiteMode: text("prerequisite_mode").notNull(),
    assessment: text("assessment").notNull(),
    assessmentNotes: jsonb("assessment_notes").$type<string[]>().notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.graphRevisionId, t.nodeKey] }),
    index("skill_graph_nodes_variant_idx").on(t.variantRevisionId),
    check("skill_graph_prerequisite_mode_check", sql`${t.prerequisiteMode} in ('all','any')`),
    check("skill_graph_assessment_check", sql`${t.assessment} = 'manual_coach_review'`),
  ],
);
export const skillGraphEdges = pgTable(
  "skill_graph_edges",
  {
    graphRevisionId: uuid("graph_revision_id").notNull(),
    fromNodeKey: text("from_node_key").notNull(),
    toNodeKey: text("to_node_key").notNull(),
    kind: text("kind").notNull(),
    sourceRefs: jsonb("source_refs").$type<string[]>().notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.graphRevisionId, t.fromNodeKey, t.toNodeKey, t.kind] }),
    foreignKey({
      columns: [t.graphRevisionId, t.fromNodeKey],
      foreignColumns: [skillGraphNodes.graphRevisionId, skillGraphNodes.nodeKey],
    }).onDelete("cascade"),
    foreignKey({
      columns: [t.graphRevisionId, t.toNodeKey],
      foreignColumns: [skillGraphNodes.graphRevisionId, skillGraphNodes.nodeKey],
    }).onDelete("cascade"),
    check("skill_graph_edge_kind_check", sql`${t.kind} in ('prerequisite','preparation')`),
    check("skill_graph_no_self_edge_check", sql`${t.fromNodeKey} <> ${t.toNodeKey}`),
  ],
);
export const mediaAssets = pgTable(
  "media_assets",
  {
    id: id(),
    variantRevisionId: uuid("variant_revision_id").references(() => variantRevisions.id, {
      onDelete: "restrict",
    }),
    companion: text("companion").notNull(),
    objectKey: text("object_key").notNull().unique(),
    mime: text("mime").notNull(),
    status: text("status").notNull().default("draft"),
    rightsStatus: text("rights_status").notNull().default("pending"),
    createdAt: created(),
  },
  (t) => [index("media_revision_idx").on(t.variantRevisionId)],
);
export const templates = pgTable(
  "program_templates",
  {
    id: id(),
    code: text("code").notNull().unique(),
    name: text("name").notNull(),
    rewardKind: text("reward_kind").notNull().default("main"),
    status: text("status").notNull().default("demo"),
    createdAt: created(),
  },
  (t) => [
    check("templates_status_check", sql`${t.status} in ('demo','published','retired')`),
    check("templates_reward_kind_check", sql`${t.rewardKind} in ('main','support')`),
  ],
);
export const templateSteps = pgTable(
  "template_steps",
  {
    id: id(),
    templateId: uuid("template_id")
      .notNull()
      .references(() => templates.id, { onDelete: "cascade" }),
    variantRevisionId: uuid("variant_revision_id")
      .notNull()
      .references(() => variantRevisions.id, { onDelete: "restrict" }),
    ordinal: integer("ordinal").notNull(),
    sets: integer("sets").notNull(),
    reps: integer("reps").notNull(),
  },
  (t) => [
    unique("template_steps_order_uq").on(t.templateId, t.ordinal),
    check("template_steps_targets_check", sql`${t.sets}>0 and ${t.reps}>0`),
  ],
);
// Private constructor data is kept outside the public program template catalogue.
export const builderInventories = pgTable(
  "workout_builder_inventories",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    place: text("place").notNull(),
    revision: integer("revision").notNull().default(1),
    confirmedAt: timestamp("confirmed_at", { withTimezone: true }).notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.place] }),
    check(
      "builder_inventory_place_check",
      sql`${t.place} in ('home','gym','outdoor','workout_park')`,
    ),
    check("builder_inventory_revision_check", sql`${t.revision} >= 1`),
  ],
);
export const builderInventoryResources = pgTable(
  "workout_builder_inventory_resources",
  {
    userId: uuid("user_id").notNull(),
    place: text("place").notNull(),
    resourceTypeId: uuid("resource_type_id")
      .notNull()
      .references(() => resourceTypes.id, { onDelete: "restrict" }),
    quantity: integer("quantity").notNull(),
    isStable: boolean("is_stable"),
    confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.place, t.resourceTypeId] }),
    foreignKey({
      columns: [t.userId, t.place],
      foreignColumns: [builderInventories.userId, builderInventories.place],
    }).onDelete("cascade"),
    check("builder_inventory_quantity_check", sql`${t.quantity} between 1 and 100`),
  ],
);
export const customWorkoutTemplates = pgTable(
  "custom_workout_templates",
  {
    id: uuid("id").notNull(),
    userId: uuid("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    revision: integer("revision").notNull().default(1),
    name: text("name").notNull(),
    place: text("place").notNull(),
    direction: text("direction").notNull(),
    inventoryRevision: integer("inventory_revision").notNull(),
    estimate: jsonb("estimate").$type<BuilderEstimate>().notNull(),
    createdAt: created(),
    updatedAt: updated(),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.id] }),
    index("custom_workout_templates_owner_updated_idx").on(t.userId, t.updatedAt),
    check("custom_workout_name_check", sql`length(${t.name}) between 1 and 80`),
    check("custom_workout_revision_check", sql`${t.revision} >= 1 and ${t.inventoryRevision} >= 1`),
    check(
      "custom_workout_context_check",
      sql`${t.place} in ('home','gym','outdoor','workout_park') and ${t.direction} in ('strength','calisthenics','yoga','stretch','mobility')`,
    ),
  ],
);
export const customWorkoutTemplateSteps = pgTable(
  "custom_workout_template_steps",
  {
    userId: uuid("user_id").notNull(),
    templateId: uuid("template_id").notNull(),
    ordinal: integer("ordinal").notNull(),
    phase: text("phase").$type<"warmup" | "main" | "cooldown">().notNull().default("main"),
    variantRevisionId: uuid("variant_revision_id")
      .notNull()
      .references(() => variantRevisions.id, { onDelete: "restrict" }),
    sets: integer("sets").notNull(),
    target: integer("target").notNull(),
    restSeconds: integer("rest_seconds").notNull(),
    pairKey: text("pair_key"),
    transitionSeconds: integer("transition_seconds"),
    dropSet: jsonb("drop_set").$type<DropSetPlan>(),
    exercise: jsonb("exercise").$type<BuilderExercise>().notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.templateId, t.ordinal] }),
    check(
      "custom_workout_phase_check",
      sql`${t.phase} in ('warmup','main','cooldown') and (${t.pairKey} is null or ${t.phase} = 'main') and (${t.dropSet} is null or ${t.phase} = 'main')`,
    ),
    check(
      "custom_workout_pair_check",
      sql`(${t.pairKey} is null and ${t.transitionSeconds} is null) or (${t.pairKey} is not null and ${t.transitionSeconds} is not null and length(${t.pairKey}) between 1 and 80 and ${t.transitionSeconds} between 0 and 120)`,
    ),
    foreignKey({
      columns: [t.userId, t.templateId],
      foreignColumns: [customWorkoutTemplates.userId, customWorkoutTemplates.id],
    }).onDelete("cascade"),
    check(
      "custom_workout_step_check",
      sql`${t.ordinal} between 0 and 39 and ${t.sets} between 1 and 10 and ${t.target} between 1 and 600 and ${t.restSeconds} between 0 and 600`,
    ),
  ],
);
export const builderCommands = pgTable(
  "workout_builder_commands",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    operationId: uuid("operation_id").notNull(),
    payloadHash: text("payload_hash").notNull(),
    result: jsonb("result").$type<unknown>().notNull(),
    createdAt: created(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.operationId] })],
);
export const plannerPreferences = pgTable(
  "workout_planner_preferences",
  {
    userId: uuid("user_id")
      .primaryKey()
      .references(() => user.id, { onDelete: "cascade" }),
    revision: integer("revision").notNull().default(1),
    excludedVariantIds: jsonb("excluded_variant_ids").$type<string[]>().notNull().default([]),
    favoriteVariantIds: jsonb("favorite_variant_ids").$type<string[]>().notNull().default([]),
    updatedAt: updated(),
  },
  (t) => [check("planner_preferences_revision_check", sql`${t.revision} >= 1`)],
);
export const workoutPlannerPrograms = pgTable(
  "workout_planner_programs",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    revision: integer("revision").notNull(),
    draft: jsonb("draft").$type<PlannerDraft>().notNull(),
    confirmedAt: timestamp("confirmed_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.revision] }),
    check("planner_program_revision_check", sql`${t.revision} >= 1`),
    index("planner_programs_owner_time_idx").on(t.userId, t.confirmedAt),
  ],
);
export const plannerCommands = pgTable(
  "workout_planner_commands",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    operationId: uuid("operation_id").notNull(),
    payloadHash: text("payload_hash").notNull(),
    result: jsonb("result").$type<unknown>().notNull(),
    createdAt: created(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.operationId] })],
);
export const plans = pgTable(
  "plans",
  {
    id: id(),
    userId: uuid("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    templateId: uuid("template_id").references(() => templates.id, { onDelete: "restrict" }),
    name: text("name").notNull(),
    createdAt: created(),
  },
  (t) => [unique("plans_owner_id_uq").on(t.userId, t.id), index("plans_user_idx").on(t.userId)],
);
export const workouts = pgTable(
  "workouts",
  {
    id: id(),
    userId: uuid("user_id").notNull(),
    planId: uuid("plan_id").notNull(),
    name: text("name").notNull(),
    status: text("status").notNull().default("ready"),
    revision: integer("revision").notNull().default(1),
    currentIndex: integer("current_index").notNull().default(0),
    rewardKind: text("reward_kind").notNull().default("main"),
    rewardDay: date("reward_day"),
    reward: jsonb("reward").$type<WorkoutReward>(),
    energyActivity: text("energy_activity").$type<EnergyActivity>(),
    energyEstimate: jsonb("energy_estimate").$type<WorkoutEnergyEstimate>(),
    loadFeedback: text("load_feedback").$type<WorkoutLoadFeedback>(),
    startedAt: timestamp("started_at", { withTimezone: true }),
    isDemo: boolean("is_demo").notNull().default(false),
    place: text("place").notNull(),
    availableSeconds: integer("available_seconds").notNull(),
    sourceProfileRevision: integer("source_profile_revision").notNull(),
    sourcePlannerRevision: integer("source_planner_revision"),
    savedSource: jsonb("saved_source").$type<Workout["source"]>(),
    sourcePlannerDayKey: text("source_planner_day_key"),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: created(),
    updatedAt: updated(),
  },
  (t) => [
    foreignKey({
      columns: [t.userId, t.planId],
      foreignColumns: [plans.userId, plans.id],
    }).onDelete("cascade"),
    unique("workouts_owner_id_uq").on(t.userId, t.id),
    foreignKey({
      columns: [t.userId, t.sourcePlannerRevision],
      foreignColumns: [workoutPlannerPrograms.userId, workoutPlannerPrograms.revision],
    }),
    check(
      "workouts_planner_source_check",
      sql`(${t.sourcePlannerRevision} is null and ${t.sourcePlannerDayKey} is null) or (${t.sourcePlannerRevision} is not null and ${t.sourcePlannerDayKey} is not null and ${t.sourcePlannerRevision} >= 1 and length(${t.sourcePlannerDayKey}) between 1 and 80)`,
    ),
    index("workouts_user_idx").on(t.userId, t.createdAt),
    check(
      "workouts_status_check",
      sql`${t.status} in ('ready','active','completed','partial','aborted')`,
    ),
    check("workouts_reward_kind_check", sql`${t.rewardKind} in ('main','support')`),
    check(
      "workouts_energy_activity_check",
      sql`${t.energyActivity} is null or ${t.energyActivity} in ('strength','calisthenics','yoga','stretch','mobility')`,
    ),
    check(
      "workouts_energy_outcome_check",
      sql`${t.energyEstimate} is null or ${t.status} in ('completed','partial')`,
    ),
    check("workouts_revision_check", sql`${t.revision}>=1`),
    check(
      "workouts_load_feedback_check",
      sql`${t.loadFeedback} is null or (${t.loadFeedback} in ('easy','just_right','hard','too_hard') and ${t.status} in ('completed','partial'))`,
    ),
  ],
);
export const nutritionProfiles = pgTable(
  "nutrition_profiles",
  {
    userId: uuid("user_id")
      .primaryKey()
      .references(() => user.id, { onDelete: "cascade" }),
    revision: integer("revision").notNull().default(1),
    preferences: jsonb("preferences").$type<NutritionPreferences>().notNull(),
    dishes: jsonb("dishes").$type<Dish[]>().notNull().default([]),
    updatedAt: updated(),
  },
  (t) => [check("nutrition_profile_revision_check", sql`${t.revision} >= 1`)],
);
export const nutritionDays = pgTable(
  "nutrition_days",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    date: date("date").notNull(),
    revision: integer("revision").notNull().default(1),
    planned: jsonb("planned").$type<MealPlanItem[]>().notNull().default([]),
    entries: jsonb("entries").$type<FoodEntry[]>().notNull().default([]),
    updatedAt: updated(),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.date] }),
    check("nutrition_day_revision_check", sql`${t.revision} >= 1`),
  ],
);

export const communicationMemory = pgTable(
  "communication_memory",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    scope: text("scope").$type<MemoryScope>().notNull(),
    revision: integer("revision").notNull().default(1),
    preferences: jsonb("preferences").$type<CommunicationPreferences>().notNull(),
    updatedAt: updated(),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.scope] }),
    check(
      "communication_scope_check",
      sql`${t.scope} in ('shared','max','lika') and ${t.revision} >= 1`,
    ),
  ],
);

export const journeyReads = pgTable(
  "journey_reads",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    chapterId: text("chapter_id").notNull(),
    readAt: created(),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.chapterId] }),
    check(
      "journey_chapter_check",
      sql`${t.chapterId} in ('meeting','first-route','own-trail','further-together')`,
    ),
  ],
);

export const calendarEntries = pgTable(
  "calendar_entries",
  {
    id: id(),
    userId: uuid("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    revision: integer("revision").notNull().default(1),
    date: date("date").notNull(),
    timezone: text("timezone").notNull(),
    status: text("status").$type<CalendarEntry["status"]>().notNull().default("planned"),
    snapshot: jsonb("snapshot").$type<CalendarSnapshot>().notNull(),
    workoutId: uuid("workout_id"),
    createdAt: created(),
    updatedAt: updated(),
  },
  (t) => [
    index("calendar_owner_date_idx").on(t.userId, t.date),
    foreignKey({
      columns: [t.userId, t.workoutId],
      foreignColumns: [workouts.userId, workouts.id],
    }).onDelete("cascade"),
    check("calendar_revision_check", sql`${t.revision} >= 1`),
    check(
      "calendar_status_check",
      sql`${t.status} in ('planned','skipped','cancelled','started') and ((${t.status} = 'started') = (${t.workoutId} is not null))`,
    ),
  ],
);
export const workoutResources = pgTable(
  "workout_resources",
  {
    id: id(),
    userId: uuid("user_id").notNull(),
    workoutId: uuid("workout_id").notNull(),
    resourceTypeId: uuid("resource_type_id")
      .notNull()
      .references(() => resourceTypes.id, { onDelete: "restrict" }),
    quantity: integer("quantity").notNull(),
    maxLoadG: integer("max_load_g"),
    isStable: boolean("is_stable"),
    confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
    createdAt: created(),
  },
  (t) => [
    foreignKey({
      columns: [t.userId, t.workoutId],
      foreignColumns: [workouts.userId, workouts.id],
    }).onDelete("cascade"),
    unique("workout_resources_type_uq").on(t.workoutId, t.resourceTypeId),
    check("workout_resources_quantity_check", sql`${t.quantity}>0`),
  ],
);
export const workoutSteps = pgTable(
  "workout_steps",
  {
    id: id(),
    userId: uuid("user_id").notNull(),
    workoutId: uuid("workout_id").notNull(),
    variantRevisionId: uuid("variant_revision_id")
      .notNull()
      .references(() => variantRevisions.id, { onDelete: "restrict" }),
    ordinal: integer("ordinal").notNull(),
    name: text("name").notNull(),
    sets: integer("sets").notNull(),
    reps: integer("reps").notNull(),
    instructions: text("instructions").notNull(),
    createdAt: created(),
    metric: text("metric").notNull().default("reps"),
    skipped: boolean("skipped").notNull().default(false),
    snapshot: jsonb("snapshot").$type<PlannerStep>(),
  },
  (t) => [
    foreignKey({
      columns: [t.userId, t.workoutId],
      foreignColumns: [workouts.userId, workouts.id],
    }).onDelete("cascade"),
    unique("workout_steps_owner_id_uq").on(t.userId, t.workoutId, t.id),
    unique("workout_steps_order_uq").on(t.workoutId, t.ordinal),
    check(
      "workout_steps_values_check",
      sql`${t.ordinal}>=0 and ${t.sets}>0 and ${t.reps}>0 and ${t.metric} in ('reps','time')`,
    ),
  ],
);
export const recordedSets = pgTable(
  "recorded_sets",
  {
    id: id(),
    userId: uuid("user_id").notNull(),
    workoutId: uuid("workout_id").notNull(),
    stepId: uuid("step_id").notNull(),
    setIndex: integer("set_index").notNull(),
    reps: integer("reps"),
    durationSeconds: integer("duration_seconds"),
    weightG: integer("weight_g").notNull().default(0),
    drop: jsonb("drop_result").$type<DropSetResult>(),
    createdAt: created(),
  },
  (t) => [
    foreignKey({
      columns: [t.userId, t.workoutId, t.stepId],
      foreignColumns: [workoutSteps.userId, workoutSteps.workoutId, workoutSteps.id],
    }).onDelete("cascade"),
    unique("recorded_sets_index_uq").on(t.stepId, t.setIndex),
    check(
      "recorded_sets_drop_check",
      sql`${t.drop} is null or coalesce((
      ${t.reps} is not null and ${t.durationSeconds} is null and
      jsonb_typeof(${t.drop}) = 'object' and
      jsonb_typeof(${t.drop}->'reps') = 'number' and jsonb_typeof(${t.drop}->'weightKg') = 'number' and
      (${t.drop}->>'reps')::numeric between 1 and 100 and
      (${t.drop}->>'reps')::numeric = trunc((${t.drop}->>'reps')::numeric) and
      (${t.drop}->>'weightKg')::numeric > 0 and
      (${t.drop}->>'weightKg')::numeric * 1000 < ${t.weightG}
    ), false)`,
    ),
    check(
      "recorded_sets_values_check",
      sql`${t.setIndex}>=0 and ${t.weightG}>=0 and ((${t.reps} is not null and ${t.reps}>0 and ${t.durationSeconds} is null) or (${t.reps} is null and ${t.durationSeconds} is not null and ${t.durationSeconds} between 1 and 86400 and ${t.weightG}=0))`,
    ),
    index("recorded_sets_owner_idx").on(t.userId, t.workoutId),
  ],
);
export const workoutCommands = pgTable(
  "workout_commands",
  {
    userId: uuid("user_id").notNull(),
    operationId: uuid("operation_id").notNull(),
    workoutId: uuid("workout_id").notNull(),
    requestHash: text("request_hash").notNull(),
    result: jsonb("result").notNull(),
    createdAt: created(),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.operationId] }),
    foreignKey({
      columns: [t.userId, t.workoutId],
      foreignColumns: [workouts.userId, workouts.id],
    }).onDelete("cascade"),
    index("workout_commands_workout_idx").on(t.userId, t.workoutId),
  ],
);
export const xpEvents = pgTable(
  "xp_events",
  {
    id: id(),
    userId: uuid("user_id").notNull(),
    workoutId: uuid("workout_id").notNull(),
    event: text("event").notNull(),
    amount: integer("amount").notNull(),
    createdAt: created(),
  },
  (t) => [
    foreignKey({
      columns: [t.userId, t.workoutId],
      foreignColumns: [workouts.userId, workouts.id],
    }).onDelete("cascade"),
    unique("xp_events_workout_uq").on(t.userId, t.workoutId, t.event),
    check("xp_events_positive_check", sql`${t.amount}>0`),
  ],
);
export const dailyXp = pgTable(
  "daily_xp",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    day: date("day").notNull(),
    amount: integer("amount").notNull().default(0),
    updatedAt: updated(),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.day] }),
    check("daily_xp_amount_check", sql`${t.amount} between 0 and 50`),
  ],
);
export const trials = pgTable(
  "ai_trials",
  {
    userId: uuid("user_id")
      .primaryKey()
      .references(() => user.id, { onDelete: "cascade" }),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull().defaultNow(),
    endsAt: timestamp("ends_at", { withTimezone: true })
      .notNull()
      .default(sql`now()+interval '168 hours'`),
    limit: integer("reply_limit").notNull().default(100),
    used: integer("used").notNull().default(0),
    reserved: integer("reserved").notNull().default(0),
    createdAt: created(),
  },
  (t) => [
    check(
      "trials_usage_check",
      sql`${t.used}>=0 and ${t.reserved}>=0 and ${t.used}+${t.reserved}<=${t.limit}`,
    ),
    check("trials_period_check", sql`${t.endsAt}>${t.startsAt}`),
  ],
);
export const aiReservations = pgTable(
  "ai_reply_reservations",
  {
    id: id(),
    userId: uuid("user_id")
      .notNull()
      .references(() => trials.userId, { onDelete: "cascade" }),
    operationId: uuid("operation_id").notNull(),
    status: text("status").notNull().default("reserved"),
    expiresAt: timestamp("expires_at", { withTimezone: true })
      .notNull()
      .default(sql`now()+interval '5 minutes'`),
    createdAt: created(),
  },
  (t) => [
    unique("ai_reservations_operation_uq").on(t.userId, t.operationId),
    index("ai_reservations_expiry_idx").on(t.userId, t.status, t.expiresAt),
    check("ai_reservations_status_check", sql`${t.status} in ('reserved','consumed','released')`),
  ],
);

// A paid intent is admitted once. Provider replies are persisted before they are shown.
export const assistantTurns = pgTable(
  "assistant_turns",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    operationId: uuid("operation_id").notNull(),
    payloadHash: text("payload_hash").notNull(),
    companion: text("companion").notNull(),
    text: text("text").notNull(),
    providerAdmitted: boolean("provider_admitted").notNull().default(true),
    status: text("status").notNull().default("running"),
    leaseExpiresAt: timestamp("lease_expires_at", { withTimezone: true }).notNull(),
    reservationId: uuid("reservation_id").references(() => aiReservations.id, {
      onDelete: "set null",
    }),
    result: jsonb("result").$type<AssistantReply>(),
    errorCode: text("error_code"),
    errorStatus: integer("error_status"),
    usage: jsonb("usage").$type<{
      model: string;
      policyVersion: string;
      calls: number;
      promptTokens: number;
      completionTokens: number;
      totalTokens: number;
      costHintRub: number | null;
    }>(),
    createdAt: created(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    userDeletedAt: timestamp("user_deleted_at", { withTimezone: true }),
    assistantDeletedAt: timestamp("assistant_deleted_at", { withTimezone: true }),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.operationId] }),
    index("assistant_turns_owner_time_idx").on(t.userId, t.companion, t.createdAt),
    index("assistant_turns_running_idx").on(t.userId, t.status, t.leaseExpiresAt),
    index("assistant_turns_global_time_idx").on(t.providerAdmitted, t.createdAt),
    check("assistant_turns_companion_check", sql`${t.companion} in ('max','lika')`),
    check(
      "assistant_turns_status_check",
      sql`${t.status} in ('running','completed','failed','unknown')`,
    ),
    check("assistant_turns_text_check", sql`length(${t.text}) between 1 and 2000`),
    check(
      "assistant_turns_result_check",
      sql`(${t.status} = 'completed') = (${t.result} is not null)`,
    ),
    check(
      "assistant_turns_error_check",
      sql`${t.errorStatus} is null or ${t.errorStatus} between 400 and 599`,
    ),
  ],
);

export const assistantConversations = pgTable(
  "assistant_conversations",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    companion: text("companion").$type<CompanionId>().notNull(),
    revision: integer("revision").notNull().default(0),
    updatedAt: updated(),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.companion] }),
    check("assistant_conversation_companion_check", sql`${t.companion} in ('max','lika')`),
    check("assistant_conversation_revision_check", sql`${t.revision} >= 0`),
  ],
);

export const assistantHistoryCommands = pgTable(
  "assistant_history_commands",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    operationId: uuid("operation_id").notNull(),
    payloadHash: text("payload_hash").notNull(),
    result: jsonb("result").$type<AssistantHistoryReceipt>().notNull(),
    createdAt: created(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.operationId] })],
);
