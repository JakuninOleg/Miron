import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DomainError } from "@/server/domain/errors";
const mock = vi.hoisted(() => ({
  requireUser: vi.fn(),
  ensure: vi.fn(),
  complete: vi.fn(),
  profile: vi.fn(),
}));
vi.mock("@/server/auth", () => ({ requireUser: mock.requireUser }));
vi.mock("@/server/domain/profile", () => ({
  ensureAccount: mock.ensure,
  getProfile: mock.profile,
}));
vi.mock("@/server/domain/onboarding", () => ({ completeOnboarding: mock.complete }));
import { POST } from "./route";
import { GET } from "../account-entry/route";

describe("private account entry and acquaintance HTTP", () => {
  const owner = randomUUID();
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("BETTER_AUTH_URL", "http://localhost:3000");
    mock.requireUser.mockResolvedValue({ id: owner });
    mock.ensure.mockResolvedValue(undefined);
    mock.profile.mockResolvedValue({ profile: { onboardingCompleted: false } });
    mock.complete.mockResolvedValue({ profile: { onboardingCompleted: true } });
  });
  const request = (body = "{}", accountOwner = owner, origin = "http://localhost:3000") =>
    new Request("http://localhost:3000/api/onboarding", {
      method: "POST",
      headers: { "content-type": "application/json", "x-miron-owner": accountOwner, origin },
      body,
    });
  it("denies anonymous reads/writes and never enters private domain services", async () => {
    mock.requireUser.mockRejectedValue(
      Object.assign(new Error("Войди в аккаунт."), { status: 401 }),
    );
    for (const response of await Promise.all([
      GET(new Request("http://localhost:3000/api/account-entry")),
      POST(request()),
    ])) {
      expect(response.status).toBe(401);
      expect(response.headers.get("cache-control")).toBe("no-store");
    }
    expect(mock.ensure).not.toHaveBeenCalled();
    expect(mock.complete).not.toHaveBeenCalled();
  });
  it("fences an old owner before any account creation or mutation", async () => {
    const response = await POST(request("{}", randomUUID()));
    expect(response.status).toBe(409);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(mock.ensure).not.toHaveBeenCalled();
    expect(mock.complete).not.toHaveBeenCalled();
  });
  it("bounds and validates transport and rejects a foreign Origin", async () => {
    for (const [body, origin, status] of [
      ["{}", "https://foreign.test", 403],
      ["x".repeat(4097), "http://localhost:3000", 413],
      ["invalid", "http://localhost:3000", 400],
    ] as const) {
      const response = await POST(request(body, owner, origin));
      expect(response.status).toBe(status);
      expect(response.headers.get("cache-control")).toBe("no-store");
    }
    expect(mock.complete).not.toHaveBeenCalled();
  });
  it("uses the authenticated account and preserves operation payload for retry", async () => {
    const payload = {
      operationId: randomUUID(),
      companion: "lika",
      interests: ["yoga"],
      adultConfirmed: true,
    };
    const response = await POST(request(JSON.stringify(payload)));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(mock.complete).toHaveBeenCalledWith(owner, payload);
    mock.complete.mockRejectedValue(
      new DomainError("IDEMPOTENCY_CONFLICT", 409, "Изменилось действие."),
    );
    const rejected = await POST(request(JSON.stringify(payload)));
    expect(rejected.status).toBe(409);
    expect(rejected.headers.get("cache-control")).toBe("no-store");
  });
  it("chooses the persisted path with a strict internal destination allowlist", async () => {
    for (const completed of [false, true]) {
      mock.profile.mockResolvedValue({ profile: { onboardingCompleted: completed } });
      for (const next of [
        "/workout-builder",
        "https://foreign.test",
        "//foreign.test",
        "/dashboard",
      ]) {
        const response = await GET(
          new Request(`http://localhost:3000/api/account-entry?next=${encodeURIComponent(next)}`),
        );
        expect(response.headers.get("cache-control")).toBe("no-store");
        expect(await response.json()).toEqual({
          destination: completed
            ? next === "/workout-builder"
              ? "/workout-builder"
              : "/dashboard"
            : next === "/workout-builder"
              ? "/onboarding?next=/workout-builder"
              : "/onboarding",
        });
      }
    }
    expect(mock.profile).toHaveBeenCalledWith(owner);
  });
});
