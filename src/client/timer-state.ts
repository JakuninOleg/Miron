export interface TimerState {
  phase: "idle" | "running" | "paused" | "done";
  remainingMs: number;
  deadline: number | null;
  runId: number;
}

export type TimerAction = "start" | "pause" | "tick" | "reset" | "stop";

export function createTimer(seconds: number): TimerState {
  return {
    phase: "idle",
    remainingMs: Math.max(1, Math.round(seconds)) * 1000,
    deadline: null,
    runId: 0,
  };
}

export function transitionTimer(
  state: TimerState,
  action: TimerAction,
  now: number,
  seconds: number,
): TimerState {
  if (action === "reset" || action === "stop")
    return { ...createTimer(seconds), runId: state.runId };
  if (action === "start") {
    if (state.phase === "running") return state;
    const resumed = state.phase === "paused";
    const remainingMs = resumed ? state.remainingMs : createTimer(seconds).remainingMs;
    return {
      phase: "running",
      remainingMs,
      deadline: now + remainingMs,
      runId: state.runId + (resumed ? 0 : 1),
    };
  }
  if (state.phase !== "running" || state.deadline === null) return state;
  const remainingMs = Math.max(0, state.deadline - now);
  if (remainingMs === 0) return { ...state, phase: "done", remainingMs: 0, deadline: null };
  if (action === "pause") return { ...state, phase: "paused", remainingMs, deadline: null };
  return remainingMs === state.remainingMs ? state : { ...state, remainingMs };
}
