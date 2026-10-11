import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { VOICE_MAX_AUDIO_BYTES } from "@/shared/voice";
import { AuthError } from "@/server/auth";
vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({
  user: vi.fn(),
  authorize: vi.fn(),
  rate: vi.fn(),
  fetch: vi.fn(),
}));
vi.mock("@/server/auth", () => ({
  getCurrentUser: mocks.user,
  requireUser: mocks.authorize,
  AuthError: class extends Error {
    constructor(
      readonly status: 401 | 403,
      message: string,
    ) {
      super(message);
    }
  },
}));
vi.mock("@/server/auth/rate-limit", () => ({ consumeAuthRateLimit: mocks.rate }));
import { establishVoiceSession, transcribeVoice } from "./gateway";
const origin = "http://127.0.0.1:3074";
const id = "8a6d9860-035a-4d86-90f4-833d8a3b44a2";
function session(preview = false, cookie?: string) {
  return new Request(`${origin}/api/voice/session`, {
    method: "POST",
    headers: { origin, "content-type": "application/json", ...(cookie ? { cookie } : {}) },
    body: JSON.stringify({ preview }),
  });
}
function upload(
  options: {
    cookie?: string;
    origin?: string;
    bytes?: number;
    duplicate?: boolean;
    mime?: string;
  } = {},
) {
  const form = new FormData();
  form.set(
    "audio",
    new Blob([new Uint8Array(options.bytes ?? 32)], {
      type: options.mime ?? "audio/webm;codecs=opus",
    }),
    "voice.webm",
  );
  form.set("operationId", id);
  form.set("companion", "lika");
  form.set("recordingMs", "1000");
  if (options.duplicate) form.append("operationId", id);
  return new Request(`${origin}/api/voice/transcribe`, {
    method: "POST",
    body: form,
    headers: {
      origin: options.origin ?? origin,
      ...(options.cookie ? { cookie: options.cookie } : {}),
    },
  });
}
beforeEach(() => {
  vi.stubEnv("NODE_ENV", "development");
  vi.stubEnv("BETTER_AUTH_URL", origin);
  vi.stubEnv("ENABLE_VOICE_PREVIEW", "true");
  vi.stubEnv("VOICE_WORKER_SECRET", "unit-only-secret-32-characters-long");
  vi.stubEnv("VOICE_WORKER_URL", "http://127.0.0.1:3075");
  mocks.user.mockReset().mockResolvedValue({ id: "user-a", emailVerified: true });
  mocks.authorize.mockReset().mockResolvedValue({ id: "user-a", emailVerified: true });
  mocks.rate.mockReset().mockResolvedValue({ allowed: true, retryAfter: 42 });
  mocks.fetch.mockReset().mockResolvedValue(
    Response.json({
      operationId: id,
      text: "Хочу тренировку дома.",
      provider: "groq",
      model: "whisper-large-v3",
      durationMs: 1000,
    }),
  );
  vi.stubGlobal("fetch", mocks.fetch);
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
describe("voice private HTTP boundary", () => {
  it("requires an account before reading audio or calling a provider", async () => {
    mocks.user.mockResolvedValue(null);
    const response = await transcribeVoice(upload());
    expect(response.status).toBe(401);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(mocks.fetch).not.toHaveBeenCalled();
    expect(mocks.rate).not.toHaveBeenCalled();
    expect(mocks.authorize).not.toHaveBeenCalled();
  });
  it("rejects cross-origin before authentication", async () => {
    expect((await transcribeVoice(upload({ origin: "https://other.test" }))).status).toBe(403);
    expect(mocks.user).not.toHaveBeenCalled();
    expect(mocks.authorize).not.toHaveBeenCalled();
    expect(mocks.fetch).not.toHaveBeenCalled();
  });
  it("permits the Next dev loopback alias but not a different port", async () => {
    expect((await transcribeVoice(upload({ origin: "http://localhost:3074" }))).status).toBe(200);
    expect((await transcribeVoice(upload({ origin: "http://localhost:3073" }))).status).toBe(403);
  });
  it("never permits preview access in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    mocks.user.mockResolvedValue(null);
    expect((await establishVoiceSession(session(true))).status).toBe(401);
    expect(mocks.fetch).not.toHaveBeenCalled();
  });
  it("issues a signed HttpOnly local preview cookie and reuses its owner", async () => {
    mocks.user.mockResolvedValue(null);
    const response = await establishVoiceSession(session(true));
    expect(response.status).toBe(200);
    const fullCookie = response.headers.get("set-cookie")!;
    expect(fullCookie).toContain("HttpOnly; SameSite=Strict");
    const cookie = fullCookie.split(";", 1)[0];
    expect(
      (await establishVoiceSession(session(true, cookie))).headers.get("set-cookie"),
    ).toBeNull();
    expect((await transcribeVoice(upload({ cookie }))).status).toBe(200);
    expect(mocks.rate.mock.calls.some(([key]) => String(key).includes("preview:"))).toBe(true);
    expect((await transcribeVoice(upload({ cookie: `${cookie}tampered` }))).status).toBe(401);
  });
  it("rejects an expired preview cookie", async () => {
    mocks.user.mockResolvedValue(null);
    const response = await establishVoiceSession(session(true));
    const cookie = response.headers.get("set-cookie")!.split(";", 1)[0];
    const realNow = Date.now();
    vi.spyOn(Date, "now").mockReturnValue(realNow + 901_000);
    expect((await transcribeVoice(upload({ cookie }))).status).toBe(401);
    vi.restoreAllMocks();
  });
  it("does not downgrade an unverified password account into a signed preview", async () => {
    mocks.user.mockResolvedValue(null);
    const preview = await establishVoiceSession(session(true));
    const cookie = preview.headers.get("set-cookie")!.split(";", 1)[0];
    mocks.user.mockResolvedValue({ id: "user-a", emailVerified: false });
    mocks.authorize.mockRejectedValue(new AuthError(403, "Подтвердите адрес почты."));
    expect((await establishVoiceSession(session(true, cookie))).status).toBe(403);
    expect((await transcribeVoice(upload({ cookie }))).status).toBe(403);
    expect(mocks.fetch).not.toHaveBeenCalled();
  });
  it("allows an authorized social principal with unverified contact email", async () => {
    mocks.user.mockResolvedValue({ id: "social-owner", emailVerified: false });
    mocks.authorize.mockResolvedValue({ id: "social-owner", emailVerified: false });
    const established = await establishVoiceSession(session());
    expect(established.status).toBe(200);
    expect(established.headers.get("set-cookie")).toBeNull();
    const request = upload();
    expect((await transcribeVoice(request)).status).toBe(200);
    expect(mocks.authorize).toHaveBeenLastCalledWith(request);
    expect(mocks.rate).toHaveBeenCalledWith("voice:account:social-owner", 60, 8);
  });
  it("fails closed when a previously read account loses its session before authorization", async () => {
    mocks.authorize.mockRejectedValue(new AuthError(401, "Войдите в аккаунт."));
    expect((await establishVoiceSession(session(true))).status).toBe(401);
    expect((await transcribeVoice(upload())).status).toBe(401);
    expect(mocks.fetch).not.toHaveBeenCalled();
    expect(mocks.rate).not.toHaveBeenCalled();
  });
  it("passes only fixed worker URL, raw audio and server secret", async () => {
    const response = await transcribeVoice(upload());
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(mocks.fetch).toHaveBeenCalledOnce();
    const [url, options] = mocks.fetch.mock.calls[0];
    expect(String(url)).toBe("http://127.0.0.1:3075/transcribe");
    expect(options.headers["X-Operation-Id"]).toBe(id);
    expect(options.headers.Authorization).toBe("Bearer unit-only-secret-32-characters-long");
    expect(await response.text()).not.toContain("secret");
  });
  it("bounds streamed input without Content-Length", async () => {
    const request = new Request(`${origin}/api/voice/transcribe`, {
      method: "POST",
      headers: { origin, "content-type": "multipart/form-data; boundary=test" },
      body: new Uint8Array(VOICE_MAX_AUDIO_BYTES + 8193),
    });
    expect(request.headers.has("content-length")).toBe(false);
    expect((await transcribeVoice(request)).status).toBe(413);
    expect(mocks.fetch).not.toHaveBeenCalled();
  });
  it("does not wait for a hanging stream cancellation after exceeding the bound", async () => {
    const cancel = vi.fn(() => new Promise<void>(() => undefined));
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(VOICE_MAX_AUDIO_BYTES + 8193));
      },
      cancel,
    });
    const options: RequestInit & { duplex: "half" } = {
      method: "POST",
      headers: { origin, "content-type": "multipart/form-data; boundary=test" },
      body,
      duplex: "half",
    };
    expect(
      (await transcribeVoice(new Request(`${origin}/api/voice/transcribe`, options))).status,
    ).toBe(413);
    expect(cancel).toHaveBeenCalledOnce();
  });
  it("absorbs a failed stream cancellation on abort", async () => {
    const abort = new AbortController();
    const cancel = vi.fn(async () => {
      throw new Error("cancel rejected");
    });
    const body = new ReadableStream<Uint8Array>({ cancel });
    const options: RequestInit & { duplex: "half" } = {
      method: "POST",
      headers: { origin, "content-type": "multipart/form-data; boundary=test" },
      body,
      duplex: "half",
      signal: abort.signal,
    };
    const pending = transcribeVoice(new Request(`${origin}/api/voice/transcribe`, options));
    await vi.waitFor(() => expect(mocks.rate).toHaveBeenCalledTimes(4));
    abort.abort();
    expect((await pending).status).toBe(504);
    expect(cancel).toHaveBeenCalledOnce();
  });
  it("rejects duplicated metadata and unsupported formats", async () => {
    expect((await transcribeVoice(upload({ duplicate: true }))).status).toBe(400);
    expect((await transcribeVoice(upload({ mime: "text/html" }))).status).toBe(415);
    expect(mocks.fetch).not.toHaveBeenCalled();
  });
  it("fails closed when rate limit storage rejects or fails", async () => {
    mocks.rate.mockResolvedValue({ allowed: false, retryAfter: 42 });
    const response = await transcribeVoice(upload());
    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("42");
    mocks.rate.mockRejectedValue(new Error("private database details"));
    const failed = await transcribeVoice(upload());
    expect(failed.status).toBe(503);
    expect(await failed.text()).not.toContain("database");
    expect(mocks.fetch).not.toHaveBeenCalled();
  });
  it("validates provider operation, transcript and format", async () => {
    for (const value of [
      { operationId: "other", text: "yes" },
      { operationId: id, text: "", provider: "groq", model: "whisper", durationMs: 1000 },
      {
        operationId: id,
        text: "x".repeat(2001),
        provider: "local",
        model: "whisper",
        durationMs: 1000,
      },
    ]) {
      mocks.fetch.mockResolvedValueOnce(Response.json(value));
      expect((await transcribeVoice(upload())).status).toBe(502);
    }
  });
  it("maps safe worker errors without reflecting upstream details", async () => {
    mocks.fetch.mockResolvedValueOnce(
      Response.json(
        { error: { code: "VOICE_NO_SPEECH", message: "private text" } },
        { status: 422 },
      ),
    );
    const silent = await transcribeVoice(upload());
    expect(silent.status).toBe(422);
    expect(await silent.text()).not.toContain("private text");
    mocks.fetch.mockResolvedValueOnce(
      Response.json(
        { error: { code: "provider-secret", message: "private key" } },
        { status: 500 },
      ),
    );
    const failed = await transcribeVoice(upload());
    expect(failed.status).toBe(503);
    expect(await failed.text()).not.toContain("private key");
  });
  it("does not accept inherited object keys as safe worker errors", async () => {
    for (const code of ["__proto__", "constructor", "toString"]) {
      mocks.fetch.mockResolvedValueOnce(
        Response.json({ error: { code, message: "upstream detail" } }, { status: 400 }),
      );
      const response = await transcribeVoice(upload());
      expect(response.status).toBe(503);
      expect(await response.text()).not.toContain("upstream detail");
    }
  });
});
