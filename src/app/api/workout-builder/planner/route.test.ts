import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ requireUser: vi.fn(), state: vi.fn(), preview: vi.fn(), confirm: vi.fn(), preferences: vi.fn(), replacements: vi.fn(), start: vi.fn() }));
vi.mock("@/server/auth", () => ({ requireUser: mocks.requireUser }));
vi.mock("@/server/domain/workout-planner", () => ({ getPlannerState: mocks.state, previewPlanner: mocks.preview, confirmPlanner: mocks.confirm, savePlannerPreferences: mocks.preferences, plannerReplacementOptions: mocks.replacements }));
vi.mock("@/server/domain/planner-start", () => ({ startPlannerWorkout: mocks.start }));
import { GET } from "./state/route";
import { POST as preview } from "./preview/route";
import { POST as confirm } from "./confirm/route";
import { PUT as preferences } from "./preferences/route";
import { POST as replacements } from "./replacements/route";
import { POST as start } from "./start/route";
describe("planner routes authorize before private reads and writes", () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.requireUser.mockResolvedValue({ id: "alice" }); });
  it("denies a mismatched owner without invoking any private service", async () => {
    for (const handler of [GET, preview, confirm, preferences, replacements, start]) {
      const request = new Request("http://localhost/api/workout-builder/planner", { method: handler === GET ? "GET" : "POST", headers: { "x-miron-owner": "bob", "content-type": "application/json" }, ...(handler === GET ? {} : { body: "{}" }) });
      const response = await handler(request);
      expect(response.status).toBe(409);
      expect(response.headers.get("Cache-Control")).toBe("no-store");
    }
    for (const fn of [mocks.state, mocks.preview, mocks.confirm, mocks.preferences, mocks.replacements, mocks.start]) expect(fn).not.toHaveBeenCalled();
  });
  it("rejects unauthenticated requests and cross-site commands", async () => {
    mocks.requireUser.mockRejectedValueOnce(Object.assign(new Error("Войдите"), { status: 401 }));
    expect((await GET(new Request("http://localhost/api/workout-builder/planner/state"))).status).toBe(401);
    const request = new Request("http://localhost/api/workout-builder/planner/confirm", { method: "POST", headers: { "x-miron-owner": "alice", "content-type": "application/json", "sec-fetch-site": "cross-site" }, body: "{}" });
    expect((await confirm(request)).status).toBe(403);
    expect(mocks.confirm).not.toHaveBeenCalled();
  });
  it("bounds streamed command bodies and responds privately", async () => {
    const tooLarge = new Request("http://localhost/api/workout-builder/planner/preview", { method: "POST", headers: { "x-miron-owner": "alice", "content-type": "application/json" }, body: JSON.stringify({ message: "x".repeat(33000) }) });
    expect((await preview(tooLarge)).status).toBe(413);
    expect(mocks.preview).not.toHaveBeenCalled();
    mocks.state.mockResolvedValue({ program: null });
    const response = await GET(new Request("http://localhost/api/workout-builder/planner/state", { headers: { "x-miron-owner": "alice" } }));
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(mocks.state).toHaveBeenCalledWith("alice");
  });
});
