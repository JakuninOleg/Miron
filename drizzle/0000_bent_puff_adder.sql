CREATE TABLE "auth_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp with time zone,
	"refresh_token_expires_at" timestamp with time zone,
	"scope" text,
	"password" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "auth_accounts_provider_subject_uq" UNIQUE("provider_id","account_id")
);
--> statement-breakpoint
CREATE TABLE "ai_reply_reservations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"operation_id" uuid NOT NULL,
	"status" text DEFAULT 'reserved' NOT NULL,
	"expires_at" timestamp with time zone DEFAULT now()+interval '5 minutes' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ai_reservations_operation_uq" UNIQUE("user_id","operation_id"),
	CONSTRAINT "ai_reservations_status_check" CHECK ("ai_reply_reservations"."status" in ('reserved','consumed','released'))
);
--> statement-breakpoint
CREATE TABLE "equipment_profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"place" text NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "equipment_profiles_owner_id_uq" UNIQUE("user_id","id"),
	CONSTRAINT "equipment_profiles_place_check" CHECK ("equipment_profiles"."place" in ('home','gym','outdoor','other'))
);
--> statement-breakpoint
CREATE TABLE "exercises" (
	"id" text PRIMARY KEY NOT NULL,
	"name_ru" text NOT NULL,
	"discipline" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "media_assets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"variant_revision_id" uuid,
	"companion" text NOT NULL,
	"object_key" text NOT NULL,
	"mime" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"rights_status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "media_assets_object_key_unique" UNIQUE("object_key")
);
--> statement-breakpoint
CREATE TABLE "plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"template_id" uuid NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "plans_owner_id_uq" UNIQUE("user_id","id")
);
--> statement-breakpoint
CREATE TABLE "profile_resources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"equipment_profile_id" uuid NOT NULL,
	"resource_type_id" uuid NOT NULL,
	"quantity" integer NOT NULL,
	"max_load_g" integer,
	"is_stable" boolean,
	"confirmed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "profile_resources_type_uq" UNIQUE("equipment_profile_id","resource_type_id"),
	CONSTRAINT "profile_resources_quantity_check" CHECK ("profile_resources"."quantity" > 0),
	CONSTRAINT "profile_resources_load_check" CHECK ("profile_resources"."max_load_g" is null or "profile_resources"."max_load_g" > 0)
);
--> statement-breakpoint
CREATE TABLE "profiles" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"display_name" text DEFAULT '' NOT NULL,
	"goal" text DEFAULT 'habit' NOT NULL,
	"experience" text DEFAULT 'beginner' NOT NULL,
	"weekly_days" integer DEFAULT 3 NOT NULL,
	"default_minutes" integer DEFAULT 25 NOT NULL,
	"timezone" text DEFAULT 'Europe/Moscow' NOT NULL,
	"companion" text DEFAULT 'max' NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"theme" text DEFAULT 'dark' NOT NULL,
	"discipline" text DEFAULT 'strength' NOT NULL,
	"location" text DEFAULT 'home' NOT NULL,
	"onboarding_completed" boolean DEFAULT false NOT NULL,
	"adult_confirmed" boolean DEFAULT false NOT NULL,
	"reminders_enabled" boolean DEFAULT false NOT NULL,
	"training_days" integer[] DEFAULT ARRAY[1,3,5]::integer[] NOT NULL,
	"reminder_time" text DEFAULT '19:00' NOT NULL,
	CONSTRAINT "profiles_days_check" CHECK ("profiles"."weekly_days" between 1 and 7),
	CONSTRAINT "profiles_minutes_check" CHECK ("profiles"."default_minutes" between 5 and 180),
	CONSTRAINT "profiles_revision_check" CHECK ("profiles"."revision" >= 1),
	CONSTRAINT "profiles_companion_check" CHECK ("profiles"."companion" in ('max','lika')),
	CONSTRAINT "profiles_experience_check" CHECK ("profiles"."experience" in ('beginner','returning','regular')),
	CONSTRAINT "profiles_settings_check" CHECK ("profiles"."theme" in ('dark','rose') and "profiles"."discipline" in ('strength','calisthenics','mobility','yoga') and "profiles"."location" in ('home','gym','outdoor'))
);
--> statement-breakpoint
CREATE TABLE "auth_rate_limits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"count" integer NOT NULL,
	"last_request" bigint NOT NULL,
	CONSTRAINT "auth_rate_limits_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "recorded_sets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"workout_id" uuid NOT NULL,
	"step_id" uuid NOT NULL,
	"set_index" integer NOT NULL,
	"reps" integer NOT NULL,
	"weight_g" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "recorded_sets_index_uq" UNIQUE("step_id","set_index"),
	CONSTRAINT "recorded_sets_values_check" CHECK ("recorded_sets"."set_index">=0 and "recorded_sets"."reps">0 and "recorded_sets"."weight_g">=0)
);
--> statement-breakpoint
CREATE TABLE "resource_types" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"name_ru" text NOT NULL,
	"kind" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "resource_types_code_unique" UNIQUE("code"),
	CONSTRAINT "resource_types_kind_check" CHECK ("resource_types"."kind" in ('equipment','support','space','anchor'))
);
--> statement-breakpoint
CREATE TABLE "auth_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "auth_sessions_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "template_steps" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"template_id" uuid NOT NULL,
	"variant_revision_id" uuid NOT NULL,
	"ordinal" integer NOT NULL,
	"sets" integer NOT NULL,
	"reps" integer NOT NULL,
	CONSTRAINT "template_steps_order_uq" UNIQUE("template_id","ordinal"),
	CONSTRAINT "template_steps_targets_check" CHECK ("template_steps"."sets">0 and "template_steps"."reps">0)
);
--> statement-breakpoint
CREATE TABLE "program_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"status" text DEFAULT 'demo' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "program_templates_code_unique" UNIQUE("code"),
	CONSTRAINT "templates_status_check" CHECK ("program_templates"."status" in ('demo','published','retired'))
);
--> statement-breakpoint
CREATE TABLE "ai_trials" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"starts_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ends_at" timestamp with time zone DEFAULT now()+interval '168 hours' NOT NULL,
	"reply_limit" integer DEFAULT 100 NOT NULL,
	"used" integer DEFAULT 0 NOT NULL,
	"reserved" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "trials_usage_check" CHECK ("ai_trials"."used">=0 and "ai_trials"."reserved">=0 and "ai_trials"."used"+"ai_trials"."reserved"<="ai_trials"."reply_limit"),
	CONSTRAINT "trials_period_check" CHECK ("ai_trials"."ends_at">"ai_trials"."starts_at")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email"),
	CONSTRAINT "users_status_check" CHECK ("users"."status" in ('active','deleting','deleted'))
);
--> statement-breakpoint
CREATE TABLE "variant_requirements" (
	"variant_id" text NOT NULL,
	"resource_type_id" uuid NOT NULL,
	"quantity" integer DEFAULT 1 NOT NULL,
	"requires_confirmation" boolean DEFAULT false NOT NULL,
	CONSTRAINT "variant_requirements_variant_id_resource_type_id_pk" PRIMARY KEY("variant_id","resource_type_id"),
	CONSTRAINT "variant_requirements_quantity_check" CHECK ("variant_requirements"."quantity" > 0)
);
--> statement-breakpoint
CREATE TABLE "variant_revisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"variant_id" text NOT NULL,
	"revision" integer NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"instructions" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "variant_revisions_version_uq" UNIQUE("variant_id","revision"),
	CONSTRAINT "variant_revisions_status_check" CHECK ("variant_revisions"."status" in ('draft','published','retired','revoked'))
);
--> statement-breakpoint
CREATE TABLE "exercise_variants" (
	"id" text PRIMARY KEY NOT NULL,
	"exercise_id" text NOT NULL,
	"name_ru" text NOT NULL,
	"alias_en" text NOT NULL,
	"pattern" text NOT NULL,
	"resistance_mode" text NOT NULL,
	"metric" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"source_basis" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "variants_status_check" CHECK ("exercise_variants"."status" in ('draft','published','retired','revoked'))
);
--> statement-breakpoint
CREATE TABLE "auth_verifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workout_commands" (
	"user_id" uuid NOT NULL,
	"operation_id" uuid NOT NULL,
	"workout_id" uuid NOT NULL,
	"request_hash" text NOT NULL,
	"result" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "workout_commands_user_id_operation_id_pk" PRIMARY KEY("user_id","operation_id")
);
--> statement-breakpoint
CREATE TABLE "workout_resources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"workout_id" uuid NOT NULL,
	"resource_type_id" uuid NOT NULL,
	"quantity" integer NOT NULL,
	"max_load_g" integer,
	"is_stable" boolean,
	"confirmed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "workout_resources_type_uq" UNIQUE("workout_id","resource_type_id"),
	CONSTRAINT "workout_resources_quantity_check" CHECK ("workout_resources"."quantity">0)
);
--> statement-breakpoint
CREATE TABLE "workout_steps" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"workout_id" uuid NOT NULL,
	"variant_revision_id" uuid NOT NULL,
	"ordinal" integer NOT NULL,
	"name" text NOT NULL,
	"sets" integer NOT NULL,
	"reps" integer NOT NULL,
	"instructions" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "workout_steps_owner_id_uq" UNIQUE("user_id","workout_id","id"),
	CONSTRAINT "workout_steps_order_uq" UNIQUE("workout_id","ordinal")
);
--> statement-breakpoint
CREATE TABLE "workouts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"plan_id" uuid NOT NULL,
	"name" text NOT NULL,
	"status" text DEFAULT 'ready' NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"current_index" integer DEFAULT 0 NOT NULL,
	"started_at" timestamp with time zone,
	"is_demo" boolean DEFAULT false NOT NULL,
	"place" text NOT NULL,
	"available_seconds" integer NOT NULL,
	"source_profile_revision" integer NOT NULL,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "workouts_owner_id_uq" UNIQUE("user_id","id"),
	CONSTRAINT "workouts_status_check" CHECK ("workouts"."status" in ('ready','active','completed')),
	CONSTRAINT "workouts_revision_check" CHECK ("workouts"."revision">=1)
);
--> statement-breakpoint
CREATE TABLE "xp_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"workout_id" uuid NOT NULL,
	"event" text NOT NULL,
	"amount" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "xp_events_workout_uq" UNIQUE("user_id","workout_id","event"),
	CONSTRAINT "xp_events_positive_check" CHECK ("xp_events"."amount">0)
);
--> statement-breakpoint
ALTER TABLE "auth_accounts" ADD CONSTRAINT "auth_accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_reply_reservations" ADD CONSTRAINT "ai_reply_reservations_user_id_ai_trials_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."ai_trials"("user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "equipment_profiles" ADD CONSTRAINT "equipment_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_variant_revision_id_variant_revisions_id_fk" FOREIGN KEY ("variant_revision_id") REFERENCES "public"."variant_revisions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plans" ADD CONSTRAINT "plans_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plans" ADD CONSTRAINT "plans_template_id_program_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."program_templates"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profile_resources" ADD CONSTRAINT "profile_resources_resource_type_id_resource_types_id_fk" FOREIGN KEY ("resource_type_id") REFERENCES "public"."resource_types"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profile_resources" ADD CONSTRAINT "profile_resources_user_id_equipment_profile_id_equipment_profiles_user_id_id_fk" FOREIGN KEY ("user_id","equipment_profile_id") REFERENCES "public"."equipment_profiles"("user_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recorded_sets" ADD CONSTRAINT "recorded_sets_user_id_workout_id_step_id_workout_steps_user_id_workout_id_id_fk" FOREIGN KEY ("user_id","workout_id","step_id") REFERENCES "public"."workout_steps"("user_id","workout_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth_sessions" ADD CONSTRAINT "auth_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "template_steps" ADD CONSTRAINT "template_steps_template_id_program_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."program_templates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "template_steps" ADD CONSTRAINT "template_steps_variant_revision_id_variant_revisions_id_fk" FOREIGN KEY ("variant_revision_id") REFERENCES "public"."variant_revisions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_trials" ADD CONSTRAINT "ai_trials_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "variant_requirements" ADD CONSTRAINT "variant_requirements_variant_id_exercise_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."exercise_variants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "variant_requirements" ADD CONSTRAINT "variant_requirements_resource_type_id_resource_types_id_fk" FOREIGN KEY ("resource_type_id") REFERENCES "public"."resource_types"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "variant_revisions" ADD CONSTRAINT "variant_revisions_variant_id_exercise_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."exercise_variants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exercise_variants" ADD CONSTRAINT "exercise_variants_exercise_id_exercises_id_fk" FOREIGN KEY ("exercise_id") REFERENCES "public"."exercises"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workout_commands" ADD CONSTRAINT "workout_commands_user_id_workout_id_workouts_user_id_id_fk" FOREIGN KEY ("user_id","workout_id") REFERENCES "public"."workouts"("user_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workout_resources" ADD CONSTRAINT "workout_resources_resource_type_id_resource_types_id_fk" FOREIGN KEY ("resource_type_id") REFERENCES "public"."resource_types"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workout_resources" ADD CONSTRAINT "workout_resources_user_id_workout_id_workouts_user_id_id_fk" FOREIGN KEY ("user_id","workout_id") REFERENCES "public"."workouts"("user_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workout_steps" ADD CONSTRAINT "workout_steps_variant_revision_id_variant_revisions_id_fk" FOREIGN KEY ("variant_revision_id") REFERENCES "public"."variant_revisions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workout_steps" ADD CONSTRAINT "workout_steps_user_id_workout_id_workouts_user_id_id_fk" FOREIGN KEY ("user_id","workout_id") REFERENCES "public"."workouts"("user_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workouts" ADD CONSTRAINT "workouts_user_id_plan_id_plans_user_id_id_fk" FOREIGN KEY ("user_id","plan_id") REFERENCES "public"."plans"("user_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "xp_events" ADD CONSTRAINT "xp_events_user_id_workout_id_workouts_user_id_id_fk" FOREIGN KEY ("user_id","workout_id") REFERENCES "public"."workouts"("user_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "auth_accounts_user_idx" ON "auth_accounts" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "ai_reservations_expiry_idx" ON "ai_reply_reservations" USING btree ("user_id","status","expires_at");--> statement-breakpoint
CREATE INDEX "equipment_profiles_user_idx" ON "equipment_profiles" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "media_revision_idx" ON "media_assets" USING btree ("variant_revision_id");--> statement-breakpoint
CREATE INDEX "plans_user_idx" ON "plans" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "profile_resources_owner_idx" ON "profile_resources" USING btree ("user_id","equipment_profile_id");--> statement-breakpoint
CREATE INDEX "recorded_sets_owner_idx" ON "recorded_sets" USING btree ("user_id","workout_id");--> statement-breakpoint
CREATE INDEX "auth_sessions_user_idx" ON "auth_sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "variant_requirements_resource_idx" ON "variant_requirements" USING btree ("resource_type_id");--> statement-breakpoint
CREATE INDEX "variants_exercise_idx" ON "exercise_variants" USING btree ("exercise_id");--> statement-breakpoint
CREATE INDEX "auth_verifications_identifier_idx" ON "auth_verifications" USING btree ("identifier");--> statement-breakpoint
CREATE INDEX "workout_commands_workout_idx" ON "workout_commands" USING btree ("user_id","workout_id");--> statement-breakpoint
CREATE INDEX "workouts_user_idx" ON "workouts" USING btree ("user_id","created_at");