-- Correct the legacy cross-midnight guard without removing the conservative arrival-day guard.
INSERT INTO daily_xp (user_id, day, amount)
SELECT e.user_id, COALESCE(w.reward_day, (e.created_at AT TIME ZONE 'Europe/Moscow')::date), LEAST(50, SUM(e.amount))::integer
FROM xp_events e JOIN workouts w ON w.id = e.workout_id AND w.user_id = e.user_id
GROUP BY e.user_id, COALESCE(w.reward_day, (e.created_at AT TIME ZONE 'Europe/Moscow')::date)
ON CONFLICT (user_id,day) DO UPDATE SET amount=GREATEST(daily_xp.amount,EXCLUDED.amount);
