import { beforeEach, describe, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({ requireUser: vi.fn(), list: vi.fn(), get: vi.fn() }));
vi.mock("@/server/auth", () => ({ requireUser: mock.requireUser }));
vi.mock("@/server/domain/workouts", () => ({ listWorkouts: mock.list, getWorkout: mock.get }));
import { GET } from "./route";
describe("current workout private boundary", () => {
  const request = () => new Request("http://localhost:3000/api/workouts/current");
  beforeEach(() => {
    vi.clearAllMocks();
    mock.requireUser.mockResolvedValue({ id: "owner" });
    mock.get.mockResolvedValue({ id: "active" });
  });
  it("never treats any terminal outcome as an ongoing workout", async () => {
    mock.list.mockResolvedValue(
      ["partial", "aborted", "completed"].map((status) => ({ id: status, status })),
    );
    const response = await GET(request());
    expect(await response.json()).toEqual({ workout: null });
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(mock.get).not.toHaveBeenCalled();
  });
  it("selects the authenticated owner's ongoing workout behind newer finished history", async () => {
    mock.list.mockResolvedValue([
      { id: "partial", status: "partial" },
      { id: "active", status: "active" },
    ]);
    expect(await (await GET(request())).json()).toEqual({ workout: { id: "active" } });
    expect(mock.list).toHaveBeenCalledWith("owner");
    expect(mock.get).toHaveBeenCalledWith("owner", "active");
  });
  it("denies anonymous reads without querying workouts and without cacheable errors", async () => {
    mock.requireUser.mockRejectedValue(
      Object.assign(new Error("Войди в аккаунт."), { status: 401 }),
    );
    const response = await GET(request());
    expect(response.status).toBe(401);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(mock.list).not.toHaveBeenCalled();
  });
});
