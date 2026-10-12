import { afterEach, describe, expect, it, vi } from "vitest";
import { ASSISTANT_MODEL, callProvider } from "./provider";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
const body = {
  choices: [{ message: { content: "Привет!" }, finish_reason: "stop" }],
  usage: { prompt_tokens: 30, completion_tokens: 10, total_tokens: 40 },
};
const request = () => ({
  messages: [{ role: "user" as const, content: "Привет" }],
  maxTokens: 192,
  signal: new AbortController().signal,
});

describe("PlusVibe beta adapter", () => {
  it("omits callable definitions after the permitted tool batch", async () => {
    vi.stubEnv("PLUSVIBE_API_KEY", "synthetic-provider-secret");
    const fetcher = vi.fn().mockResolvedValue(Response.json(body));
    vi.stubGlobal("fetch", fetcher);
    await callProvider({
      ...request(),
      toolsAllowed: false,
      tools: [
        {
          type: "function",
          function: { name: "read_profile", description: "Test tool", parameters: {} },
        },
      ],
    });
    const payload = JSON.parse((fetcher.mock.calls[0][1] as RequestInit).body as string);
    expect(payload.tools).toBeUndefined();
    expect(payload.tool_choice).toBeUndefined();
  });

  it("sends the explicit read-only preview choice", async () => {
    vi.stubEnv("PLUSVIBE_API_KEY", "synthetic-provider-secret");
    const fetcher = vi.fn().mockResolvedValue(Response.json(body));
    vi.stubGlobal("fetch", fetcher);
    await callProvider({
      ...request(),
      requiredTool: "preview_workout",
      tools: [
        {
          type: "function",
          function: { name: "preview_workout", description: "Test preview", parameters: {} },
        },
      ],
    });
    const payload = JSON.parse((fetcher.mock.calls[0][1] as RequestInit).body as string);
    expect(payload.tool_choice).toEqual({
      type: "function",
      function: { name: "preview_workout" },
    });
  });

  it("pins endpoint/model, bounds output and returns only public reply/usage", async () => {
    vi.stubEnv("PLUSVIBE_API_KEY", "synthetic-provider-secret");
    const fetcher = vi
      .fn()
      .mockResolvedValue(Response.json(body, { headers: { "x-pv-cost-rub": "0.001" } }));
    vi.stubGlobal("fetch", fetcher);
    const result = await callProvider(request());
    expect(result.content).toBe("Привет!");
    expect(result.usage.costHintRub).toBe(0.001);
    expect(fetcher.mock.calls[0][0]).toBe("https://plusvibeapi.ru/v1/chat/completions");
    const init = fetcher.mock.calls[0][1] as RequestInit;
    expect(init.redirect).toBe("error");
    expect(JSON.parse(init.body as string)).toMatchObject({
      model: ASSISTANT_MODEL,
      max_tokens: 192,
      reasoning_effort: "none",
      stream: false,
    });
    expect(JSON.stringify(result)).not.toContain("synthetic-provider-secret");
  });

  it("does not expose provider error bodies or key", async () => {
    vi.stubEnv("PLUSVIBE_API_KEY", "synthetic-provider-secret");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("internal account/key error", { status: 402 })),
    );
    await expect(callProvider(request())).rejects.toMatchObject({
      code: "AI_PROVIDER_UNAVAILABLE",
      message: "Напарник сейчас не отвечает. Попробуй позже.",
    });
  });

  it("rejects ignored limits, truncation, missing usage and HTTP-200 quota errors", async () => {
    vi.stubEnv("PLUSVIBE_API_KEY", "synthetic-provider-secret");
    const responses = [
      Response.json(body, { headers: { "x-plusvibe-warnings": "value_clamped:max_tokens" } }),
      Response.json({
        ...body,
        choices: [{ message: { content: "Обрыв" }, finish_reason: "length" }],
      }),
      Response.json({ choices: body.choices }),
      Response.json({
        ...body,
        choices: [{ message: { content: "You've reached your daily usage limit for Chat" } }],
      }),
      new Response("x".repeat(66_000)),
    ];
    for (const response of responses) {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response));
      await expect(callProvider(request())).rejects.toHaveProperty("status", 502);
    }
  });
});
