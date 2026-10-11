ALTER TABLE "profiles" ADD COLUMN "show_workout_energy" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "workouts" ADD COLUMN "energy_activity" text;--> statement-breakpoint
ALTER TABLE "workouts" ADD COLUMN "energy_estimate" jsonb;--> statement-breakpoint
ALTER TABLE "workouts" ADD CONSTRAINT "workouts_energy_activity_check" CHECK ("workouts"."energy_activity" is null or "workouts"."energy_activity" in ('strength','calisthenics','yoga','stretch','mobility'));--> statement-breakpoint
ALTER TABLE "workouts" ADD CONSTRAINT "workouts_energy_outcome_check" CHECK ("workouts"."energy_estimate" is null or "workouts"."status" in ('completed','partial'));