CREATE TABLE "skill_graph_edges" (
	"graph_revision_id" uuid NOT NULL,
	"from_node_key" text NOT NULL,
	"to_node_key" text NOT NULL,
	"kind" text NOT NULL,
	"source_refs" jsonb NOT NULL,
	CONSTRAINT "skill_graph_edges_graph_revision_id_from_node_key_to_node_key_kind_pk" PRIMARY KEY("graph_revision_id","from_node_key","to_node_key","kind"),
	CONSTRAINT "skill_graph_edge_kind_check" CHECK ("skill_graph_edges"."kind" in ('prerequisite','preparation')),
	CONSTRAINT "skill_graph_no_self_edge_check" CHECK ("skill_graph_edges"."from_node_key" <> "skill_graph_edges"."to_node_key")
);
--> statement-breakpoint
CREATE TABLE "skill_graph_nodes" (
	"graph_revision_id" uuid NOT NULL,
	"node_key" text NOT NULL,
	"variant_revision_id" uuid NOT NULL,
	"skill_group" text NOT NULL,
	"prerequisite_mode" text NOT NULL,
	"assessment" text NOT NULL,
	"assessment_notes" jsonb NOT NULL,
	CONSTRAINT "skill_graph_nodes_graph_revision_id_node_key_pk" PRIMARY KEY("graph_revision_id","node_key"),
	CONSTRAINT "skill_graph_prerequisite_mode_check" CHECK ("skill_graph_nodes"."prerequisite_mode" in ('all','any')),
	CONSTRAINT "skill_graph_assessment_check" CHECK ("skill_graph_nodes"."assessment" = 'manual_coach_review')
);
--> statement-breakpoint
CREATE TABLE "skill_graph_revisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"name_ru" text NOT NULL,
	"revision" integer NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"review_status" text DEFAULT 'pending_expert_review' NOT NULL,
	"source_refs" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "skill_graph_revisions_version_uq" UNIQUE("code","revision"),
	CONSTRAINT "skill_graph_revision_check" CHECK ("skill_graph_revisions"."revision" >= 1),
	CONSTRAINT "skill_graph_status_check" CHECK ("skill_graph_revisions"."status" in ('draft','published','retired','revoked')),
	CONSTRAINT "skill_graph_review_check" CHECK ("skill_graph_revisions"."review_status" in ('pending_expert_review','approved'))
);
--> statement-breakpoint
ALTER TABLE "skill_graph_edges" ADD CONSTRAINT "skill_graph_edges_graph_revision_id_from_node_key_skill_graph_nodes_graph_revision_id_node_key_fk" FOREIGN KEY ("graph_revision_id","from_node_key") REFERENCES "public"."skill_graph_nodes"("graph_revision_id","node_key") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "skill_graph_edges" ADD CONSTRAINT "skill_graph_edges_graph_revision_id_to_node_key_skill_graph_nodes_graph_revision_id_node_key_fk" FOREIGN KEY ("graph_revision_id","to_node_key") REFERENCES "public"."skill_graph_nodes"("graph_revision_id","node_key") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "skill_graph_nodes" ADD CONSTRAINT "skill_graph_nodes_graph_revision_id_skill_graph_revisions_id_fk" FOREIGN KEY ("graph_revision_id") REFERENCES "public"."skill_graph_revisions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "skill_graph_nodes" ADD CONSTRAINT "skill_graph_nodes_variant_revision_id_variant_revisions_id_fk" FOREIGN KEY ("variant_revision_id") REFERENCES "public"."variant_revisions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "skill_graph_nodes_variant_idx" ON "skill_graph_nodes" USING btree ("variant_revision_id");