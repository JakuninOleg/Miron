import { sql } from "drizzle-orm";
import { getDb } from "../db";

/** Aggregate server-confirmed beta funnel, without chats, names or account identifiers. */
export async function readJourneyMetrics(days = 30) {
  if (!Number.isInteger(days) || days < 1 || days > 180)
    throw new Error("Период — от 1 до 180 дней.");
  const result = await getDb().execute<{
    registered: number;
    onboarded: number;
    with_ai_reply: number;
    started: number;
    with_result: number;
    returned: number;
    median_seconds_to_start: number | null;
    median_seconds_to_result: number | null;
  }>(sql`
    with cohort as (
      select u.id,u.created_at,p.onboarding_completed from users u
      left join profiles p on p.user_id=u.id
      where u.status='active' and u.created_at>=statement_timestamp()-(${days}*interval '1 day') and u.created_at<=statement_timestamp()
    ), milestones as (
      select c.*,
        exists(select 1 from assistant_turns a where a.user_id=c.id and a.status='completed') as ai_reply,
        (select min(w.started_at) from workouts w where w.user_id=c.id and not w.is_demo and w.started_at>=c.created_at) as first_start,
        (select min(w.completed_at) from workouts w where w.user_id=c.id and not w.is_demo
          and w.status in ('completed','partial') and w.completed_at>=c.created_at
          and exists(select 1 from recorded_sets s where s.user_id=c.id and s.workout_id=w.id)) as first_result,
        (select count(distinct coalesce(w.reward_day,(w.completed_at at time zone 'Europe/Moscow')::date)) from workouts w where w.user_id=c.id and not w.is_demo
          and w.status in ('completed','partial') and w.completed_at>=c.created_at
          and exists(select 1 from recorded_sets s where s.user_id=c.id and s.workout_id=w.id)) as activity_days
      from cohort c
    ) select count(*)::integer as registered,
      count(*) filter(where onboarding_completed)::integer as onboarded,
      count(*) filter(where ai_reply)::integer as with_ai_reply,
      count(first_start)::integer as started,count(first_result)::integer as with_result,
      count(*) filter(where activity_days>=2)::integer as returned,
      round((percentile_cont(0.5) within group(order by extract(epoch from first_start-created_at)))::numeric)::float8 as median_seconds_to_start,
      round((percentile_cont(0.5) within group(order by extract(epoch from first_result-created_at)))::numeric)::float8 as median_seconds_to_result
    from milestones
  `);
  return {
    version: "miron-cjm-v1",
    cohortDays: days,
    measuredAt: new Date().toISOString(),
    ...result.rows[0],
  };
}
