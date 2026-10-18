ALTER TABLE "custom_workout_template_steps" ADD COLUMN "drop_set" jsonb;--> statement-breakpoint
ALTER TABLE "recorded_sets" ADD COLUMN "drop_result" jsonb;--> statement-breakpoint
ALTER TABLE "recorded_sets" ADD CONSTRAINT "recorded_sets_drop_check" CHECK ("recorded_sets"."drop_result" is null or coalesce((
      "recorded_sets"."reps" is not null and "recorded_sets"."duration_seconds" is null and
      jsonb_typeof("recorded_sets"."drop_result") = 'object' and
      jsonb_typeof("recorded_sets"."drop_result"->'reps') = 'number' and jsonb_typeof("recorded_sets"."drop_result"->'weightKg') = 'number' and
      ("recorded_sets"."drop_result"->>'reps')::numeric between 1 and 100 and
      ("recorded_sets"."drop_result"->>'reps')::numeric = trunc(("recorded_sets"."drop_result"->>'reps')::numeric) and
      ("recorded_sets"."drop_result"->>'weightKg')::numeric > 0 and
      ("recorded_sets"."drop_result"->>'weightKg')::numeric * 1000 < "recorded_sets"."weight_g"
    ), false));