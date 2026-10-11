import { describe, expect, it } from "vitest";
import { createTimer, transitionTimer } from "./timer-state";

describe("optional deadline timer", () => {
  it("starts only explicitly and catches up after a delayed tick", () => {
    const idle = createTimer(60);
    expect(transitionTimer(idle, "tick", 100000, 60)).toBe(idle);
    const running = transitionTimer(idle, "start", 1000, 60);
    expect(transitionTimer(running, "tick", 46000, 60).remainingMs).toBe(15000);
    const done = transitionTimer(running, "tick", 90000, 60);
    expect(done.phase).toBe("done");
    expect(transitionTimer(done, "tick", 100000, 60)).toBe(done);
    expect(transitionTimer(done, "start", 100000, 60).runId).toBe(2);
  });
  it("pauses without consuming paused time and resumes the same run", () => {
    const running = transitionTimer(createTimer(60), "start", 1000, 60);
    const paused = transitionTimer(running, "pause", 11000, 60);
    expect(paused).toMatchObject({ phase: "paused", remainingMs: 50000, deadline: null });
    expect(transitionTimer(paused, "tick", 100000, 60)).toBe(paused);
    const resumed = transitionTimer(paused, "start", 100000, 60);
    expect(resumed).toMatchObject({ deadline: 150000, runId: running.runId });
  });
  it.each(["stop", "reset"] as const)(
    "%s cancels expiry and restores the planned duration",
    (action) => {
      const running = transitionTimer(createTimer(60), "start", 1000, 60);
      const stopped = transitionTimer(running, action, 11000, 60);
      expect(stopped).toMatchObject({ phase: "idle", remainingMs: 60000, deadline: null });
      expect(transitionTimer(stopped, "tick", 100000, 60)).toBe(stopped);
    },
  );
  it("finishes once even when pause is pressed after the deadline", () => {
    const running = transitionTimer(createTimer(1), "start", 0, 1);
    const done = transitionTimer(running, "pause", 1001, 1);
    expect(done.phase).toBe("done");
    expect(transitionTimer(done, "pause", 2000, 1)).toBe(done);
  });
});
