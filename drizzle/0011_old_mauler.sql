ALTER TABLE "profiles" ADD COLUMN "onboarding_interests" text[] DEFAULT ARRAY[]::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "onboarding_operation_id" uuid;--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "onboarding_payload_hash" text;