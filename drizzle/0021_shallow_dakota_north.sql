CREATE TABLE "journey_reads" (
	"user_id" uuid NOT NULL,
	"chapter_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "journey_reads_user_id_chapter_id_pk" PRIMARY KEY("user_id","chapter_id"),
	CONSTRAINT "journey_chapter_check" CHECK ("journey_reads"."chapter_id" in ('meeting','first-route','own-trail','further-together'))
);
--> statement-breakpoint
ALTER TABLE "journey_reads" ADD CONSTRAINT "journey_reads_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;