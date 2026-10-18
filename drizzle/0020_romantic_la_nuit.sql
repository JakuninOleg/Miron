CREATE TABLE "calendar_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"date" date NOT NULL,
	"timezone" text NOT NULL,
	"status" text DEFAULT 'planned' NOT NULL,
	"snapshot" jsonb NOT NULL,
	"workout_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "calendar_revision_check" CHECK ("calendar_entries"."revision" >= 1),
	CONSTRAINT "calendar_status_check" CHECK ("calendar_entries"."status" in ('planned','skipped','cancelled','started') and (("calendar_entries"."status" = 'started') = ("calendar_entries"."workout_id" is not null)))
);
--> statement-breakpoint
ALTER TABLE "calendar_entries" ADD CONSTRAINT "calendar_entries_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendar_entries" ADD CONSTRAINT "calendar_entries_user_id_workout_id_workouts_user_id_id_fk" FOREIGN KEY ("user_id","workout_id") REFERENCES "public"."workouts"("user_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "calendar_owner_date_idx" ON "calendar_entries" USING btree ("user_id","date");