CREATE TABLE "workout_builder_commands" (
	"user_id" uuid NOT NULL,
	"operation_id" uuid NOT NULL,
	"payload_hash" text NOT NULL,
	"result" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "workout_builder_commands_user_id_operation_id_pk" PRIMARY KEY("user_id","operation_id")
);
--> statement-breakpoint
CREATE TABLE "workout_builder_inventories" (
	"user_id" uuid NOT NULL,
	"place" text NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"confirmed_at" timestamp with time zone NOT NULL,
	CONSTRAINT "workout_builder_inventories_user_id_place_pk" PRIMARY KEY("user_id","place"),
	CONSTRAINT "builder_inventory_place_check" CHECK ("workout_builder_inventories"."place" in ('home','gym','outdoor','workout_park')),
	CONSTRAINT "builder_inventory_revision_check" CHECK ("workout_builder_inventories"."revision" >= 1)
);
--> statement-breakpoint
CREATE TABLE "workout_builder_inventory_resources" (
	"user_id" uuid NOT NULL,
	"place" text NOT NULL,
	"resource_type_id" uuid NOT NULL,
	"quantity" integer NOT NULL,
	"is_stable" boolean,
	"confirmed_at" timestamp with time zone,
	CONSTRAINT "workout_builder_inventory_resources_user_id_place_resource_type_id_pk" PRIMARY KEY("user_id","place","resource_type_id"),
	CONSTRAINT "builder_inventory_quantity_check" CHECK ("workout_builder_inventory_resources"."quantity" between 1 and 100)
);
--> statement-breakpoint
CREATE TABLE "custom_workout_template_steps" (
	"user_id" uuid NOT NULL,
	"template_id" uuid NOT NULL,
	"ordinal" integer NOT NULL,
	"variant_revision_id" uuid NOT NULL,
	"sets" integer NOT NULL,
	"target" integer NOT NULL,
	"rest_seconds" integer NOT NULL,
	"exercise" jsonb NOT NULL,
	CONSTRAINT "custom_workout_template_steps_user_id_template_id_ordinal_pk" PRIMARY KEY("user_id","template_id","ordinal"),
	CONSTRAINT "custom_workout_step_check" CHECK ("custom_workout_template_steps"."ordinal" between 0 and 39 and "custom_workout_template_steps"."sets" between 1 and 10 and "custom_workout_template_steps"."target" between 1 and 600 and "custom_workout_template_steps"."rest_seconds" between 0 and 600)
);
--> statement-breakpoint
CREATE TABLE "custom_workout_templates" (
	"id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"name" text NOT NULL,
	"place" text NOT NULL,
	"direction" text NOT NULL,
	"inventory_revision" integer NOT NULL,
	"estimate" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "custom_workout_templates_user_id_id_pk" PRIMARY KEY("user_id","id"),
	CONSTRAINT "custom_workout_name_check" CHECK (length("custom_workout_templates"."name") between 1 and 80),
	CONSTRAINT "custom_workout_revision_check" CHECK ("custom_workout_templates"."revision" >= 1 and "custom_workout_templates"."inventory_revision" >= 1),
	CONSTRAINT "custom_workout_context_check" CHECK ("custom_workout_templates"."place" in ('home','gym','outdoor','workout_park') and "custom_workout_templates"."direction" in ('strength','calisthenics','yoga','stretch','mobility'))
);
--> statement-breakpoint
ALTER TABLE "workout_builder_commands" ADD CONSTRAINT "workout_builder_commands_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workout_builder_inventories" ADD CONSTRAINT "workout_builder_inventories_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workout_builder_inventory_resources" ADD CONSTRAINT "workout_builder_inventory_resources_resource_type_id_resource_types_id_fk" FOREIGN KEY ("resource_type_id") REFERENCES "public"."resource_types"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workout_builder_inventory_resources" ADD CONSTRAINT "workout_builder_inventory_resources_user_id_place_workout_builder_inventories_user_id_place_fk" FOREIGN KEY ("user_id","place") REFERENCES "public"."workout_builder_inventories"("user_id","place") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "custom_workout_template_steps" ADD CONSTRAINT "custom_workout_template_steps_variant_revision_id_variant_revisions_id_fk" FOREIGN KEY ("variant_revision_id") REFERENCES "public"."variant_revisions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "custom_workout_template_steps" ADD CONSTRAINT "custom_workout_template_steps_user_id_template_id_custom_workout_templates_user_id_id_fk" FOREIGN KEY ("user_id","template_id") REFERENCES "public"."custom_workout_templates"("user_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "custom_workout_templates" ADD CONSTRAINT "custom_workout_templates_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "custom_workout_templates_owner_updated_idx" ON "custom_workout_templates" USING btree ("user_id","updated_at");