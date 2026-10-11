import type { BetterAuthOptions } from "better-auth";
import { memoryAdapter } from "better-auth/adapters/memory";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(async (): Promise<{ user: { id: string } } | null> => ({
    user: { id: "alice" },
  })),
  create: vi.fn(),
  select: vi.fn(),
  where: vi.fn(),
  sendMail: vi.fn(),
  mailer: vi.fn(),
  rows: [] as Record<string, unknown>[][],
}));
vi.mock("server-only", () => ({}));
vi.mock("better-auth", () => ({
  betterAuth: (options: BetterAuthOptions) => {
    mocks.create(options);
    return { api: { getSession: mocks.getSession } };
  },
}));
vi.mock("better-auth/adapters/drizzle", () => ({ drizzleAdapter: () => ({}) }));
vi.mock("@/server/db", () => ({ getDb: () => ({ select: mocks.select }) }));
vi.mock("@/server/domain/profile", () => ({ initializeAccount: vi.fn() }));
vi.mock("./mail", () => ({ createAuthMailer: mocks.mailer }));

const principal = {
  id: "alice",
  email: "alice@example.test",
  name: "Alice",
  emailVerified: false,
  status: "active",
};

describe("authoritative principal access and runtime configuration", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("BETTER_AUTH_SECRET", "unit-test-only-secret-with-at-least-32-characters");
    vi.stubEnv("DATABASE_URL", "postgresql://test:test@localhost:5432/test");
    vi.stubEnv("BETTER_AUTH_URL", "http://localhost:3000");
    vi.stubEnv("YANDEX_CLIENT_ID", "test-yandex-client");
    vi.stubEnv("YANDEX_CLIENT_SECRET", "test-yandex-secret");
    vi.stubEnv("VK_CLIENT_ID", "test-vk-client");
    vi.stubEnv("VK_CLIENT_SECRET", "test-vk-secret");
    vi.stubEnv("AUTH_EMAIL_PASSWORD_ENABLED", "false");
    mocks.create.mockClear();
    mocks.getSession.mockReset().mockResolvedValue({ user: { id: "alice" } });
    mocks.where
      .mockReset()
      .mockImplementation(() => ({ limit: async () => mocks.rows.shift() ?? [] }));
    mocks.select.mockReset().mockImplementation(() => ({ from: () => ({ where: mocks.where }) }));
    mocks.rows = [];
    mocks.sendMail.mockClear();
    mocks.mailer.mockReset().mockReturnValue(mocks.sendMail);
  });
  afterEach(() => vi.unstubAllEnvs());

  it.each(["yandex", "vk"])(
    "allows only the authenticated owner's %s subject without changing emailVerified",
    async (providerId) => {
      mocks.rows.push([principal], [{ userId: "alice", providerId, accountId: "123456" }]);
      const { requireUser } = await import("./index");
      const user = await requireUser(new Headers());
      expect(user).toMatchObject({ id: "alice", emailVerified: false });
      expect(mocks.select).toHaveBeenCalledTimes(2);
      const ownership = new PgDialect().sqlToQuery(mocks.where.mock.calls[1][0] as SQL);
      expect(ownership.params).toEqual(["alice", "yandex", "vk"]);
    },
  );

  it.each([
    { identities: [] },
    { identities: [{ userId: "alice", providerId: "credential", accountId: "123456" }] },
    { identities: [{ userId: "bob", providerId: "yandex", accountId: "123456" }] },
    { identities: [{ userId: "alice", providerId: "yandex", accountId: "" }] },
  ])("denies an unverified credential-only or mismatched identity %j", async (identities) => {
    mocks.rows.push([principal], identities.identities);
    const { requireUser } = await import("./index");
    await expect(requireUser(new Headers())).rejects.toMatchObject({ status: 403 });
  });

  it("uses verified password principals without querying provider accounts", async () => {
    mocks.rows.push([{ ...principal, emailVerified: true }]);
    const { requireUser } = await import("./index");
    expect((await requireUser(new Headers())).emailVerified).toBe(true);
    expect(mocks.select).toHaveBeenCalledOnce();
  });

  it("blocks deleted principals before checking any provider account", async () => {
    mocks.rows.push([{ ...principal, status: "deleted" }]);
    const { requireUser } = await import("./index");
    await expect(requireUser(new Headers())).rejects.toMatchObject({ status: 403 });
    expect(mocks.select).toHaveBeenCalledOnce();
  });

  it("requires a real auth session even when social identities exist", async () => {
    mocks.getSession.mockResolvedValue(null);
    const { requireUser } = await import("./index");
    await expect(requireUser(new Headers())).rejects.toMatchObject({ status: 401 });
    expect(mocks.select).not.toHaveBeenCalled();
  });

  it("disables email actions and avoids constructing an SMTP transport in social-only mode", async () => {
    const { getAuth } = await import("./index");
    getAuth();
    const options = mocks.create.mock.calls[0][0] as BetterAuthOptions;
    expect(options.emailAndPassword?.enabled).toBe(false);
    expect(options.emailAndPassword?.requireEmailVerification).toBe(true);
    expect(options.emailAndPassword?.sendResetPassword).toBeUndefined();
    expect(options.emailVerification).toBeUndefined();
    expect(options.account?.accountLinking?.enabled).toBe(false);
    expect(mocks.mailer).not.toHaveBeenCalled();
    const actual = await vi.importActual<typeof import("better-auth")>("better-auth");
    const isolated = actual.betterAuth({
      ...options,
      database: memoryAdapter({ user: [], account: [], session: [], verification: [] }),
      databaseHooks: undefined,
      rateLimit: { enabled: false },
    });
    for (const path of options.disabledPaths ?? []) {
      const response = await isolated.handler(
        new Request(`http://localhost:3000/api/auth${path}`, {
          method: path === "/verify-email" ? "GET" : "POST",
          headers: { origin: "http://localhost:3000", "Content-Type": "application/json" },
          ...(path === "/verify-email" ? {} : { body: "{}" }),
        }),
      );
      expect(response.status, path).toBe(404);
    }
  });

  it("preserves verified password auth and its mail sender when enabled", async () => {
    vi.stubEnv("AUTH_EMAIL_PASSWORD_ENABLED", "true");
    const { getAuth } = await import("./index");
    getAuth();
    const options = mocks.create.mock.calls[0][0] as BetterAuthOptions;
    expect(options.emailAndPassword?.enabled).toBe(true);
    expect(options.emailAndPassword?.requireEmailVerification).toBe(true);
    expect(options.emailAndPassword?.autoSignIn).toBe(false);
    expect(options.emailAndPassword?.sendResetPassword).toBeTypeOf("function");
    expect(options.emailVerification?.sendOnSignUp).toBeUndefined();
    expect(options.emailVerification?.sendOnSignIn).toBe(true);
    expect(options.emailVerification?.sendVerificationEmail).toBeTypeOf("function");
    expect(mocks.mailer).toHaveBeenCalledOnce();
  });
});
