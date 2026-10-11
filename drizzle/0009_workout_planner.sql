CREATE TABLE "workout_planner_commands" (
	"user_id" uuid NOT NULL,
	"operation_id" uuid NOT NULL,
	"payload_hash" text NOT NULL,
	"result" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "workout_planner_commands_user_id_operation_id_pk" PRIMARY KEY("user_id","operation_id")
);
--> statement-breakpoint
CREATE TABLE "workout_planner_preferences" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"excluded_variant_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"favorite_variant_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "planner_preferences_revision_check" CHECK ("workout_planner_preferences"."revision" >= 1)
);
--> statement-breakpoint
CREATE TABLE "workout_planner_programs" (
	"user_id" uuid NOT NULL,
	"revision" integer NOT NULL,
	"draft" jsonb NOT NULL,
	"confirmed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "workout_planner_programs_user_id_revision_pk" PRIMARY KEY("user_id","revision"),
	CONSTRAINT "planner_program_revision_check" CHECK ("workout_planner_programs"."revision" >= 1)
);
--> statement-breakpoint
ALTER TABLE "plans" ALTER COLUMN "template_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "custom_workout_template_steps" ADD COLUMN "pair_key" text;--> statement-breakpoint
ALTER TABLE "custom_workout_template_steps" ADD COLUMN "transition_seconds" integer;--> statement-breakpoint
ALTER TABLE "workout_steps" ADD COLUMN "snapshot" jsonb;--> statement-breakpoint
ALTER TABLE "workouts" ADD COLUMN "source_planner_revision" integer;--> statement-breakpoint
ALTER TABLE "workouts" ADD COLUMN "source_planner_day_key" text;--> statement-breakpoint
ALTER TABLE "workout_planner_commands" ADD CONSTRAINT "workout_planner_commands_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workout_planner_preferences" ADD CONSTRAINT "workout_planner_preferences_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workout_planner_programs" ADD CONSTRAINT "workout_planner_programs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "planner_programs_owner_time_idx" ON "workout_planner_programs" USING btree ("user_id","confirmed_at");--> statement-breakpoint
ALTER TABLE "workouts" ADD CONSTRAINT "workouts_user_id_source_planner_revision_workout_planner_programs_user_id_revision_fk" FOREIGN KEY ("user_id","source_planner_revision") REFERENCES "public"."workout_planner_programs"("user_id","revision") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "custom_workout_template_steps" ADD CONSTRAINT "custom_workout_pair_check" CHECK (("custom_workout_template_steps"."pair_key" is null and "custom_workout_template_steps"."transition_seconds" is null) or (length("custom_workout_template_steps"."pair_key") between 1 and 80 and "custom_workout_template_steps"."transition_seconds" between 0 and 120));--> statement-breakpoint
ALTER TABLE "workouts" ADD CONSTRAINT "workouts_planner_source_check" CHECK (("workouts"."source_planner_revision" is null and "workouts"."source_planner_day_key" is null) or ("workouts"."source_planner_revision" >= 1 and length("workouts"."source_planner_day_key") between 1 and 80));