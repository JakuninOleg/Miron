CREATE TABLE "daily_xp" (
	"user_id" uuid NOT NULL,
	"day" date NOT NULL,
	"amount" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "daily_xp_user_id_day_pk" PRIMARY KEY("user_id","day"),
	CONSTRAINT "daily_xp_amount_check" CHECK ("daily_xp"."amount" between 0 and 50)
);
--> statement-breakpoint
ALTER TABLE "workouts" DROP CONSTRAINT "workouts_status_check";--> statement-breakpoint
ALTER TABLE "program_templates" ADD COLUMN "reward_kind" text DEFAULT 'main' NOT NULL;--> statement-breakpoint
ALTER TABLE "workout_steps" ADD COLUMN "skipped" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "workouts" ADD COLUMN "reward_kind" text DEFAULT 'main' NOT NULL;--> statement-breakpoint
ALTER TABLE "workouts" ADD COLUMN "reward_day" date;--> statement-breakpoint
ALTER TABLE "workouts" ADD COLUMN "reward" jsonb;--> statement-breakpoint
ALTER TABLE "daily_xp" ADD CONSTRAINT "daily_xp_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "program_templates" ADD CONSTRAINT "templates_reward_kind_check" CHECK ("program_templates"."reward_kind" in ('main','support'));--> statement-breakpoint
ALTER TABLE "workouts" ADD CONSTRAINT "workouts_reward_kind_check" CHECK ("workouts"."reward_kind" in ('main','support'));--> statement-breakpoint
ALTER TABLE "workouts" ADD CONSTRAINT "workouts_status_check" CHECK ("workouts"."status" in ('ready','active','completed','partial','aborted'));
--> statement-breakpoint
UPDATE program_templates SET reward_kind = 'support' WHERE code IN ('demo-yoga', 'demo-mobility');
--> statement-breakpoint
UPDATE workouts w SET reward_kind = t.reward_kind FROM plans p JOIN program_templates t ON t.id = p.template_id WHERE w.plan_id = p.id;
--> statement-breakpoint
UPDATE workouts SET reward_day = (COALESCE(started_at, created_at) AT TIME ZONE 'Europe/Moscow')::date WHERE started_at IS NOT NULL;
--> statement-breakpoint
-- Guard future grants without rewriting historical XP events or account totals.
INSERT INTO daily_xp (user_id, day, amount)
SELECT user_id, (created_at AT TIME ZONE 'Europe/Moscow')::date, LEAST(50, SUM(amount))::integer
FROM xp_events GROUP BY user_id, (created_at AT TIME ZONE 'Europe/Moscow')::date;
