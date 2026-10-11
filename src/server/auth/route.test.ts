import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const mocked = vi.hoisted(() => ({
  authHandler: vi.fn(async (request: Request) => Response.json({ payload: await request.json() })),
  rateLimit: vi.fn(async () => ({ allowed: true, retryAfter: 60 })),
}));
vi.mock("@/server/auth", () => ({ getAuth: () => ({ handler: mocked.authHandler }) }));
vi.mock("@/server/auth/rate-limit", () => ({ consumeAuthRateLimit: mocked.rateLimit }));
import { POST } from "@/app/api/auth/[...all]/route";

describe("auth HTTP boundary", () => {
  beforeEach(() => {
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("BETTER_AUTH_SECRET", "unit-test-only-secret-with-at-least-32-characters");
    vi.stubEnv("BETTER_AUTH_URL", "http://localhost:3000");
    vi.stubEnv("DATABASE_URL", "postgresql://test:test@localhost:55432/test");
    vi.stubEnv("YANDEX_CLIENT_ID", "");
    vi.stubEnv("YANDEX_CLIENT_SECRET", "");
    vi.stubEnv("VK_CLIENT_ID", "");
    vi.stubEnv("VK_CLIENT_SECRET", "");
    mocked.authHandler.mockClear();
    mocked.rateLimit.mockReset().mockResolvedValue({ allowed: true, retryAfter: 60 });
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  const request = (
    body = "{}",
    origin = "http://localhost:3000",
    extra: Record<string, string> = {},
  ) =>
    new Request("http://localhost:3000/api/auth/sign-in/email", {
      method: "POST",
      headers: { "content-type": "application/json", origin, ...extra },
      body,
    });

  it("rejects cross-origin requests before contacting auth or PostgreSQL", async () => {
    const response = await POST(request("{}", "https://attacker.example"));
    expect(response.status).toBe(403);
    expect(mocked.authHandler).not.toHaveBeenCalled();
    expect(mocked.rateLimit).not.toHaveBeenCalled();
  });
  it("rejects oversized bodies even without a Content-Length header", async () => {
    const response = await POST(request("x".repeat(16_385)));
    expect(response.status).toBe(413);
    expect(mocked.authHandler).not.toHaveBeenCalled();
  });
  it("retains JSON input and prevents caching on a valid request", async () => {
    const response = await POST(
      request(JSON.stringify({ email: "test@example.test", password: "test-password" })),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({
      payload: { email: "test@example.test", password: "test-password" },
    });
  });
  it("returns Retry-After and does not run auth after rate limit exhaustion", async () => {
    mocked.rateLimit.mockResolvedValue({ allowed: false, retryAfter: 42 });
    const response = await POST(request());
    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("42");
    expect(mocked.authHandler).not.toHaveBeenCalled();
  });
  it("fails closed without database configuration and exposes no exception details", async () => {
    vi.stubEnv("DATABASE_URL", "");
    const response = await POST(request());
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain("DATABASE_URL");
    expect(mocked.authHandler).not.toHaveBeenCalled();
  });
});
