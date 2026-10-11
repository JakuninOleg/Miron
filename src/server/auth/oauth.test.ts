import { randomUUID } from "node:crypto";
import { betterAuth } from "better-auth";
import { memoryAdapter } from "better-auth/adapters/memory";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
import { readAuthConfig } from "./config";
import { vkOAuth, yandexOAuth } from "./oauth";

const config = readAuthConfig({
  NODE_ENV: "test",
  BETTER_AUTH_URL: "http://localhost:3000",
  BETTER_AUTH_SECRET: "unit-test-only-secret-with-at-least-32-characters",
  DATABASE_URL: "postgresql://test:test@localhost:5432/test",
  YANDEX_CLIENT_ID: "test-yandex-client",
  YANDEX_CLIENT_SECRET: "test-yandex-secret",
  VK_CLIENT_ID: "test-vk-client",
  VK_CLIENT_SECRET: "test-vk-secret",
});

function cookieHeaders(response: Response) {
  return response.headers
    .getSetCookie()
    .map((cookie) => cookie.split(";")[0])
    .join("; ");
}

function testAuth() {
  const storage: Record<string, Record<string, unknown>[]> = {
    user: [],
    session: [],
    account: [],
    verification: [],
  };
  const sendMail = vi.fn();
  const auth = betterAuth({
    baseURL: config.baseURL,
    secret: config.secret,
    database: memoryAdapter(storage),
    socialProviders: vkOAuth(config),
    plugins: yandexOAuth(config),
    account: { storeStateStrategy: "database", accountLinking: { enabled: false } },
    emailAndPassword: { enabled: true, requireEmailVerification: true, autoSignIn: false },
    emailVerification: { sendOnSignIn: true, sendVerificationEmail: sendMail },
    rateLimit: { enabled: false },
    logger: { disabled: true },
  });
  const post = (path: string, body: Record<string, unknown>) =>
    auth.handler(
      new Request(`${config.baseURL}/api/auth/${path}`, {
        method: "POST",
        headers: { origin: config.baseURL, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
    );
  const login = async (provider: "yandex" | "vk") => {
    const start = await post("sign-in/social", {
      provider,
      callbackURL: "/auth/continue",
      errorCallbackURL: "/sign-in",
    });
    expect(start.status).toBe(200);
    const { url } = (await start.json()) as { url: string };
    const authorization = new URL(url);
    expect(authorization.searchParams.get("code_challenge_method")).toBe("S256");
    expect(authorization.searchParams.get("code_challenge")).toBeTruthy();
    const callback = new URL(`/api/auth/callback/${provider}`, config.baseURL);
    callback.searchParams.set("code", "test-provider-code");
    callback.searchParams.set("state", authorization.searchParams.get("state")!);
    if (provider === "vk") callback.searchParams.set("device_id", "test-vk-device");
    return {
      authorization,
      response: await auth.handler(
        new Request(callback, { headers: { cookie: cookieHeaders(start) } }),
      ),
    };
  };
  return { auth, storage, sendMail, post, login };
}

function providerFetch(profile: () => unknown) {
  const fetcher = vi.fn<typeof fetch>(async (input) => {
    const url = String(input);
    if (url === "https://oauth.yandex.ru/token" || url === "https://id.vk.com/oauth2/auth") {
      return Response.json({
        access_token: "test-access-token",
        token_type: "bearer",
        expires_in: 3600,
      });
    }
    if (
      url === "https://login.yandex.ru/info?format=json" ||
      url === "https://id.vk.com/oauth2/user_info"
    ) {
      return Response.json(profile());
    }
    throw new Error("Unexpected provider endpoint in isolated OAuth test.");
  });
  vi.stubGlobal("fetch", fetcher);
  return fetcher;
}

describe("Yandex/VK OAuth with isolated provider responses", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("registers and signs in Yandex by stable subject without verifying email or sending mail", async () => {
    let email = "alice@example.test";
    const fetcher = providerFetch(() => ({
      id: "1000034426",
      client_id: config.yandex!.clientId,
      default_email: email,
      display_name: "Alice",
    }));
    const test = testAuth();
    const first = await test.login("yandex");
    expect(first.response.status).toBe(302);
    expect(first.response.headers.get("location")).toBe("/auth/continue");
    const principal = await test.auth.api.getSession({
      headers: new Headers({ cookie: cookieHeaders(first.response) }),
    });
    expect(principal?.user.emailVerified).toBe(false);
    expect(test.storage.account).toHaveLength(1);
    expect(test.storage.account[0]).toMatchObject({
      providerId: "yandex",
      accountId: "1000034426",
      userId: principal?.user.id,
    });
    expect(test.sendMail).not.toHaveBeenCalled();
    const tokenCall = fetcher.mock.calls.find(
      ([url]) => String(url) === "https://oauth.yandex.ru/token",
    );
    expect(new URLSearchParams(String(tokenCall?.[1]?.body)).get("code_verifier")).toBeTruthy();

    // A changed provider contact email cannot move this identity to another owner.
    email = "bob@example.test";
    test.storage.user.push({
      id: randomUUID(),
      name: "Bob",
      email,
      emailVerified: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const second = await test.login("yandex");
    const repeated = await test.auth.api.getSession({
      headers: new Headers({ cookie: cookieHeaders(second.response) }),
    });
    expect(repeated?.user.id).toBe(principal?.user.id);
    expect(repeated?.user.email).toBe("alice@example.test");
  });

  it("preserves VK PKCE/device_id exchange and the unverified contact-email claim", async () => {
    const fetcher = providerFetch(() => ({
      user: { user_id: "123456", first_name: "Лика", last_name: "", email: "lika@example.test" },
    }));
    const test = testAuth();
    const { authorization, response } = await test.login("vk");
    expect(authorization.searchParams.get("scope")).toBe("email");
    expect(response.headers.get("location")).toBe("/auth/continue");
    expect(test.storage.user[0].emailVerified).toBe(false);
    expect(test.storage.account[0]).toMatchObject({ providerId: "vk", accountId: "123456" });
    expect(test.sendMail).not.toHaveBeenCalled();
    const tokenCall = fetcher.mock.calls.find(
      ([url]) => String(url) === "https://id.vk.com/oauth2/auth",
    );
    const body = new URLSearchParams(String(tokenCall?.[1]?.body));
    expect(body.get("device_id")).toBe("test-vk-device");
    expect(body.get("code_verifier")).toBeTruthy();
    expect(body.get("redirect_uri")).toBe(`${config.baseURL}/api/auth/callback/vk`);
  });

  it("rejects matching-email credentials without silently linking a provider", async () => {
    providerFetch(() => ({
      id: "1000034426",
      client_id: config.yandex!.clientId,
      default_email: "existing@example.test",
    }));
    const test = testAuth();
    const id = randomUUID();
    test.storage.user.push({
      id,
      name: "Existing",
      email: "existing@example.test",
      emailVerified: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    test.storage.account.push({
      id: randomUUID(),
      userId: id,
      providerId: "credential",
      accountId: id,
      password: "stored-credential",
    });
    const { response } = await test.login("yandex");
    expect(
      new URL(response.headers.get("location")!, config.baseURL).searchParams.get("error"),
    ).toBe("account_not_linked");
    expect(test.storage.account).toHaveLength(1);
    expect(test.storage.session).toHaveLength(0);
  });

  it.each(["yandex", "vk"] as const)(
    "fails closed when %s does not share an email",
    async (provider) => {
      providerFetch(() =>
        provider === "yandex"
          ? { id: "1000034426", client_id: config.yandex!.clientId }
          : { user: { user_id: "123456", first_name: "Лика" } },
      );
      const test = testAuth();
      const { response } = await test.login(provider);
      expect(
        new URL(response.headers.get("location")!, config.baseURL).searchParams.get("error"),
      ).toBe("email_not_found");
      expect(test.storage.user).toHaveLength(0);
      expect(test.storage.account).toHaveLength(0);
    },
  );

  it.each([
    { id: "1000034426", client_id: "another-app", default_email: "alice@example.test" },
    { id: "", client_id: config.yandex!.clientId, default_email: "alice@example.test" },
    { id: "1000034426", client_id: config.yandex!.clientId, default_email: "invalid-mail" },
  ])("rejects invalid or other-app Yandex profile %j", async (profile) => {
    providerFetch(() => profile);
    const test = testAuth();
    const { response } = await test.login("yandex");
    expect(
      new URL(response.headers.get("location")!, config.baseURL).searchParams.get("error"),
    ).toBe("unable_to_get_user_info");
    expect(test.storage.user).toHaveLength(0);
  });
});
