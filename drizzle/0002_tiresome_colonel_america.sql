CREATE TABLE "muscle_groups" (
	"code" text PRIMARY KEY NOT NULL,
	"name_ru" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "variant_revision_muscles" (
	"variant_revision_id" uuid NOT NULL,
	"muscle_group_code" text NOT NULL,
	"role" text NOT NULL,
	CONSTRAINT "variant_revision_muscles_variant_revision_id_muscle_group_code_pk" PRIMARY KEY("variant_revision_id","muscle_group_code"),
	CONSTRAINT "variant_revision_muscles_role_check" CHECK ("variant_revision_muscles"."role" in ('primary','secondary','stabilizer'))
);
--> statement-breakpoint
ALTER TABLE "variant_revisions" ADD COLUMN "editorial" jsonb;--> statement-breakpoint
ALTER TABLE "variant_revision_muscles" ADD CONSTRAINT "variant_revision_muscles_variant_revision_id_variant_revisions_id_fk" FOREIGN KEY ("variant_revision_id") REFERENCES "public"."variant_revisions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "variant_revision_muscles" ADD CONSTRAINT "variant_revision_muscles_muscle_group_code_muscle_groups_code_fk" FOREIGN KEY ("muscle_group_code") REFERENCES "public"."muscle_groups"("code") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "variant_revision_muscles_group_role_idx" ON "variant_revision_muscles" USING btree ("muscle_group_code","role");