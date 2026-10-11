CREATE TABLE "assistant_turns" (
	"user_id" uuid NOT NULL,
	"operation_id" uuid NOT NULL,
	"payload_hash" text NOT NULL,
	"companion" text NOT NULL,
	"text" text NOT NULL,
	"status" text DEFAULT 'running' NOT NULL,
	"lease_expires_at" timestamp with time zone NOT NULL,
	"reservation_id" uuid,
	"result" jsonb,
	"error_code" text,
	"error_status" integer,
	"usage" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	CONSTRAINT "assistant_turns_user_id_operation_id_pk" PRIMARY KEY("user_id","operation_id"),
	CONSTRAINT "assistant_turns_companion_check" CHECK ("assistant_turns"."companion" in ('max','lika')),
	CONSTRAINT "assistant_turns_status_check" CHECK ("assistant_turns"."status" in ('running','completed','failed','unknown')),
	CONSTRAINT "assistant_turns_text_check" CHECK (length("assistant_turns"."text") between 1 and 2000),
	CONSTRAINT "assistant_turns_result_check" CHECK (("assistant_turns"."status" = 'completed') = ("assistant_turns"."result" is not null)),
	CONSTRAINT "assistant_turns_error_check" CHECK ("assistant_turns"."error_status" is null or "assistant_turns"."error_status" between 400 and 599)
);
--> statement-breakpoint
ALTER TABLE "assistant_turns" ADD CONSTRAINT "assistant_turns_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assistant_turns" ADD CONSTRAINT "assistant_turns_reservation_id_ai_reply_reservations_id_fk" FOREIGN KEY ("reservation_id") REFERENCES "public"."ai_reply_reservations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "assistant_turns_owner_time_idx" ON "assistant_turns" USING btree ("user_id","companion","created_at");--> statement-breakpoint
CREATE INDEX "assistant_turns_running_idx" ON "assistant_turns" USING btree ("user_id","status","lease_expires_at");