ALTER TABLE "assistant_turns" ADD COLUMN "provider_admitted" boolean DEFAULT true NOT NULL;--> statement-breakpoint
UPDATE "assistant_turns" SET "provider_admitted" = false WHERE "status" = 'completed' AND "usage"->>'calls' = '0';--> statement-breakpoint
CREATE INDEX "assistant_turns_global_time_idx" ON "assistant_turns" USING btree ("provider_admitted","created_at");
