CREATE TABLE "assistant_conversations" (
	"user_id" uuid NOT NULL,
	"companion" text NOT NULL,
	"revision" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "assistant_conversations_user_id_companion_pk" PRIMARY KEY("user_id","companion"),
	CONSTRAINT "assistant_conversation_companion_check" CHECK ("assistant_conversations"."companion" in ('max','lika')),
	CONSTRAINT "assistant_conversation_revision_check" CHECK ("assistant_conversations"."revision" >= 0)
);
--> statement-breakpoint
CREATE TABLE "assistant_history_commands" (
	"user_id" uuid NOT NULL,
	"operation_id" uuid NOT NULL,
	"payload_hash" text NOT NULL,
	"result" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "assistant_history_commands_user_id_operation_id_pk" PRIMARY KEY("user_id","operation_id")
);
--> statement-breakpoint
ALTER TABLE "assistant_turns" ADD COLUMN "user_deleted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "assistant_turns" ADD COLUMN "assistant_deleted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "assistant_conversations" ADD CONSTRAINT "assistant_conversations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assistant_history_commands" ADD CONSTRAINT "assistant_history_commands_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;