CREATE TABLE "communication_memory" (
	"user_id" uuid NOT NULL,
	"scope" text NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"preferences" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "communication_memory_user_id_scope_pk" PRIMARY KEY("user_id","scope"),
	CONSTRAINT "communication_scope_check" CHECK ("communication_memory"."scope" in ('shared','max','lika') and "communication_memory"."revision" >= 1)
);
--> statement-breakpoint
ALTER TABLE "communication_memory" ADD CONSTRAINT "communication_memory_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;