import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mock = vi.hoisted(() => ({
  requireUser: vi.fn(),
  save: vi.fn(),
  list: vi.fn(),
  catalog: vi.fn(),
}));
vi.mock("@/server/auth", () => ({ requireUser: mock.requireUser }));
vi.mock("@/server/domain/workout-builder", () => ({
  saveCustomWorkout: mock.save,
  listCustomWorkouts: mock.list,
  getBuilderCatalog: mock.catalog,
}));
import { POST, GET } from "./templates/route";
import { GET as catalogGET } from "./catalog/route";

describe("private constructor HTTP boundary", () => {
  const owner = randomUUID();
  beforeEach(() => {
    vi.clearAllMocks();
    mock.requireUser.mockResolvedValue({ id: owner });
    mock.save.mockResolvedValue({ id: randomUUID() });
    mock.list.mockResolvedValue([]);
  });
  const request = (header = owner, body = "{}", origin = "http://localhost:3000") =>
    new Request("http://localhost:3000/api/workout-builder/templates", {
      method: "POST",
      headers: { "content-type": "application/json", "x-miron-owner": header, origin },
      body,
    });
  it("rejects signed-out reads and mutations without entering the domain", async () => {
    mock.requireUser.mockRejectedValue(
      Object.assign(new Error("Войдите в аккаунт."), { status: 401 }),
    );
    const [read, write] = await Promise.all([GET(request()), POST(request())]);
    expect(read.status).toBe(401);
    expect(write.status).toBe(401);
    expect(read.headers.get("cache-control")).toBe("no-store");
    expect(write.headers.get("cache-control")).toBe("no-store");
    expect(mock.list).not.toHaveBeenCalled();
    expect(mock.save).not.toHaveBeenCalled();
  });
  it("rejects a stale tab owned by a different account before any domain operation", async () => {
    const response = await POST(request(randomUUID()));
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ error: { code: "OWNER_CHANGED" } });
    expect(mock.save).not.toHaveBeenCalled();
    expect(response.headers.get("cache-control")).toBe("no-store");
  });
  it("rejects cross-origin and oversized JSON before saving", async () => {
    expect((await POST(request(owner, "{}", "https://attacker.test"))).status).toBe(403);
    expect((await POST(request(owner, "x".repeat(32_769)))).status).toBe(413);
    expect(mock.save).not.toHaveBeenCalled();
  });
  it("keeps valid writes private and pins domain access to the authenticated owner", async () => {
    const response = await POST(request(owner, JSON.stringify({ name: "Моя тренировка" })));
    expect(response.status).toBe(201);
    expect(mock.save).toHaveBeenCalledWith(owner, { name: "Моя тренировка" });
    expect(response.headers.get("cache-control")).toBe("no-store");
  });
  it("requires the owner fence on catalog reads as well", async () => {
    const response = await catalogGET(
      new Request(
        "http://localhost:3000/api/workout-builder/catalog?place=home&direction=strength",
      ),
    );
    expect(response.status).toBe(409);
    expect(mock.catalog).not.toHaveBeenCalled();
  });
});
