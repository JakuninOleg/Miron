CREATE TABLE "nutrition_days" (
	"user_id" uuid NOT NULL,
	"date" date NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"planned" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"entries" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "nutrition_days_user_id_date_pk" PRIMARY KEY("user_id","date"),
	CONSTRAINT "nutrition_day_revision_check" CHECK ("nutrition_days"."revision" >= 1)
);
--> statement-breakpoint
CREATE TABLE "nutrition_profiles" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"preferences" jsonb NOT NULL,
	"dishes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "nutrition_profile_revision_check" CHECK ("nutrition_profiles"."revision" >= 1)
);
--> statement-breakpoint
ALTER TABLE "nutrition_days" ADD CONSTRAINT "nutrition_days_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nutrition_profiles" ADD CONSTRAINT "nutrition_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;