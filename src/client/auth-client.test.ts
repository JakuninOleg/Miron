import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("provider login requests", () => {
  const fetcher = vi.fn<typeof fetch>(async () =>
    Response.json({ url: "https://oauth.yandex.ru/authorize", redirect: true }),
  );

  beforeEach(() => {
    vi.resetModules();
    fetcher.mockClear();
    vi.stubGlobal("fetch", fetcher);
  });
  afterEach(() => vi.unstubAllGlobals());

  it.each(["yandex", "vk"] as const)(
    "sends %s to the installed standard social endpoint",
    async (provider) => {
      const { signInWithProvider } = await import("./auth-client");
      const result = await signInWithProvider(provider, "/workout-builder");
      expect(result.error).toBeNull();
      expect(fetcher).toHaveBeenCalledOnce();
      const [url, init] = fetcher.mock.calls[0];
      expect(String(url)).toMatch(/\/api\/auth\/sign-in\/social$/);
      expect(init?.method).toBe("POST");
      expect(JSON.parse(String(init?.body))).toMatchObject({
        provider,
        callbackURL: "/auth/continue?next=/workout-builder",
        errorCallbackURL: "/sign-in?next=/workout-builder",
      });
    },
  );

  it.each([undefined, "https://attacker.example", "//attacker.example", "/dashboard"])(
    "bounds the post-login destination %s",
    async (next) => {
      const { signInWithProvider } = await import("./auth-client");
      await signInWithProvider("yandex", next);
      const [, init] = fetcher.mock.calls[0];
      expect(JSON.parse(String(init?.body))).toMatchObject({
        callbackURL: "/auth/continue",
        errorCallbackURL: "/sign-in",
      });
    },
  );
});
