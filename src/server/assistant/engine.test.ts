import { describe, expect, it, vi } from "vitest";
import { runAssistantEngine, type EngineOptions } from "./engine";
import { GENERATOR_POLICY, GENERATOR_OUTPUT_STYLE } from "./policy";
import type { Provider, ProviderReply } from "./provider";

const allowed = JSON.stringify({
  route: "in_scope",
  topics: ["training"],
  riskFlags: [],
  trainingSafety: "allow",
});
const reviewed = JSON.stringify({ decision: "allow", reasonCode: "within_policy" });
function reply(content: string, toolCalls: ProviderReply["toolCalls"] = []): ProviderReply {
  return {
    content,
    toolCalls,
    usage: { promptTokens: 100, completionTokens: 20, totalTokens: 120, costHintRub: 0.001 },
  };
}
function setup(responses: ProviderReply[], overrides: Partial<EngineOptions<{ id: string }>> = {}) {
  const provider = vi.fn<Provider>();
  for (const response of responses) provider.mockResolvedValueOnce(response);
  const executeTool = vi.fn().mockResolvedValue({
    evidence: { saved: false, state: "preview" },
    action: { id: "proposal" },
  });
  const options: EngineOptions<{ id: string }> = {
    text: "Давай обсудим занятие",
    companion: "lika",
    history: [],
    profile: { experience: "beginner" },
    provider,
    signal: new AbortController().signal,
    tools: [],
    executeTool,
    ...overrides,
  };
  return { options, provider, executeTool };
}

describe("bounded beta assistant orchestration", () => {
  it.each(["max", "lika"] as const)(
    "allows friendly flirting with %s through output review without tools",
    async (companion) => {
      const social = JSON.stringify({
        route: "in_scope",
        topics: ["companion_relationship"],
        riskFlags: [],
        trainingSafety: "allow",
        requestedAction: "discuss",
      });
      const text = "Ты умеешь сделать разговор интереснее 😉";
      const { options, provider, executeTool } = setup(
        [reply(social), reply(text), reply(reviewed)],
        {
          companion,
          text: "Давай немного пофлиртуем 😉",
          tools: [
            {
              type: "function",
              function: { name: "preview_workout", description: "Workout draft", parameters: {} },
            },
          ],
        },
      );
      const result = await runAssistantEngine(options);
      expect(result.source).toBe("model");
      expect(result.text).toBe(text);
      expect(result.action).toBeUndefined();
      expect(provider).toHaveBeenCalledTimes(3);
      expect(provider.mock.calls[1][0].tools).toEqual([]);
      expect(provider.mock.calls[1][0].toolsAllowed).toBe(false);
      expect(executeTool).not.toHaveBeenCalled();
    },
  );

  it("rejects an unsolicited tool call in a social conversation before execution", async () => {
    const social = JSON.stringify({
      route: "in_scope",
      topics: ["contextual_smalltalk"],
      riskFlags: [],
      trainingSafety: "allow",
    });
    const { options, executeTool } = setup([
      reply(social),
      reply("", [
        { id: "call1", type: "function", function: { name: "preview_workout", arguments: "{}" } },
      ]),
    ]);
    await expect(runAssistantEngine(options)).rejects.toMatchObject({ code: "AI_TOOL_FORBIDDEN" });
    expect(executeTool).not.toHaveBeenCalled();
  });

  it("blocks a harmful request even if the classifier mistakenly allows its topic", async () => {
    const { options, provider, executeTool } = setup([
      reply(
        JSON.stringify({
          route: "in_scope",
          topics: ["companion_relationship"],
          riskFlags: ["harmful_request"],
          trainingSafety: "allow",
        }),
      ),
    ]);
    const result = await runAssistantEngine(options);
    expect(result.source).toBe("prepared");
    expect(result.useful).toBe(false);
    expect(result.text).toContain("причинения вреда");
    expect(provider).toHaveBeenCalledTimes(1);
    expect(executeTool).not.toHaveBeenCalled();
  });

  it("distinguishes explicit adult scenes from light flirt and instructions to harm", async () => {
    const { options, executeTool } = setup([
      reply(
        JSON.stringify({
          route: "out_of_scope",
          topics: [],
          riskFlags: ["explicit_sexual_content"],
          trainingSafety: "allow",
        }),
      ),
    ]);
    const result = await runAssistantEngine(options);
    expect(result.source).toBe("prepared");
    expect(result.text).toContain("Лёгкий флирт");
    expect(result.text).not.toContain("насилия");
    expect(executeTool).not.toHaveBeenCalled();
  });

  it("keeps urgent assistance ahead of the harmful-request boundary", async () => {
    const { options } = setup([
      reply(
        JSON.stringify({
          route: "out_of_scope",
          topics: ["safety"],
          riskFlags: ["harmful_request", "urgent_distress"],
          trainingSafety: "urgent_help",
        }),
      ),
    ]);
    expect((await runAssistantEngine(options)).text).toContain("103 или 112");
  });

  it("runs scope, generation and output review before returning a model reply", async () => {
    const { options, provider } = setup([
      reply(allowed),
      reply("Открой текущее занятие и сверим карточки."),
      reply(reviewed),
    ]);
    const result = await runAssistantEngine(options);
    expect(result.source).toBe("model");
    expect(result.useful).toBe(true);
    expect(result.usage.calls).toBe(3);
    expect(provider.mock.calls[1][0].messages[0].content).toContain(GENERATOR_POLICY);
    expect(provider.mock.calls[1][0].messages[0].content?.endsWith(GENERATOR_OUTPUT_STYLE)).toBe(
      true,
    );
    expect(provider.mock.calls[2][0].json).toBe(true);
  });

  it("traces a blocked neutral-language draft using only metadata", async () => {
    const onTrace = vi.fn();
    const privateText = "Мой приватный запрос про занятие";
    const { options } = setup([reply(allowed), reply("Сколько времени ты готов(а) уделять?")], {
      text: privateText,
      profile: { privateValue: "Private profile marker" },
      onTrace,
    });
    await expect(runAssistantEngine(options)).rejects.toMatchObject({ code: "AI_REPLY_BLOCKED" });
    expect(onTrace).toHaveBeenLastCalledWith({
      stage: "draft_gate",
      decision: "block",
      reason: "gender_placeholder",
    });
    const events = JSON.stringify(onTrace.mock.calls);
    expect(events).not.toContain(privateText);
    expect(events).not.toContain("Private profile marker");
    expect(events).not.toContain("готов(а)");
  });

  it("keeps the review reason for synthetic diagnostics and ignores broken observers", async () => {
    const onTrace = vi.fn();
    const blocked = setup(
      [
        reply(allowed),
        reply("Выбирай новый вес самостоятельно по ощущениям."),
        reply('{"decision":"block","reasonCode":"unsafe_advice"}'),
      ],
      { onTrace },
    );
    await expect(runAssistantEngine(blocked.options)).rejects.toMatchObject({
      code: "AI_REPLY_BLOCKED",
    });
    expect(onTrace).toHaveBeenLastCalledWith({
      stage: "review",
      decision: "block",
      reasonCode: "unsafe_advice",
    });
    const valid = setup([reply(allowed), reply("Где хочется заниматься?"), reply(reviewed)], {
      onTrace: () => {
        throw new Error("Observer failed");
      },
    });
    expect((await runAssistantEngine(valid.options)).text).toBe("Где хочется заниматься?");
  });

  it("responds to urgent pain locally without provider, quota or tools", async () => {
    const { options, provider, executeTool } = setup([], {
      text: "Сейчас давит в груди и трудно дышать",
    });
    const result = await runAssistantEngine(options);
    expect(result.text).toContain("103 или 112");
    expect(result.source).toBe("prepared");
    expect(result.useful).toBe(false);
    expect(provider).not.toHaveBeenCalled();
    expect(executeTool).not.toHaveBeenCalled();
  });

  it("uses a prepared boundary for unrelated and mixed requests", async () => {
    for (const route of ["out_of_scope", "mixed"] as const) {
      const { options, provider } = setup([
        reply(JSON.stringify({ route, topics: [], riskFlags: [], trainingSafety: "allow" })),
      ]);
      const result = await runAssistantEngine(options);
      expect(result.source).toBe("prepared");
      expect(provider).toHaveBeenCalledTimes(1);
    }
  });

  it("does not turn a spurious extreme flag on an unrelated topic into a workout refusal", async () => {
    const { options, provider } = setup(
      [
        reply(
          JSON.stringify({
            route: "out_of_scope",
            topics: [],
            riskFlags: [],
            trainingSafety: "refuse_extreme",
          }),
        ),
      ],
      {
        text: "Напиши код интернет-магазина, тренировки не интересуют.",
      },
    );
    const result = await runAssistantEngine(options);
    expect(result.text).toContain("С посторонними задачами");
    expect(result.text).not.toContain("Максимальную попытку");
    expect(provider).toHaveBeenCalledTimes(1);
  });

  it("keeps urgent help above a topic boundary and an actual extreme request below it", async () => {
    const urgent = setup([
      reply(
        JSON.stringify({
          route: "out_of_scope",
          topics: ["safety"],
          riskFlags: ["urgent_distress"],
          trainingSafety: "urgent_help",
        }),
      ),
    ]);
    expect((await runAssistantEngine(urgent.options)).text).toContain("103 или 112");
    const extreme = setup([
      reply(
        JSON.stringify({
          route: "in_scope",
          topics: ["training"],
          riskFlags: [],
          trainingSafety: "refuse_extreme",
        }),
      ),
    ]);
    expect((await runAssistantEngine(extreme.options)).text).toContain("Максимальную попытку");
  });

  it("blocks gender placeholders before displaying the generated text", async () => {
    const { options, provider } = setup([reply(allowed), reply("Ты готов(а) начать?")]);
    await expect(runAssistantEngine(options)).rejects.toMatchObject({ code: "AI_REPLY_BLOCKED" });
    expect(provider).toHaveBeenCalledTimes(2);
  });

  it("fails closed on malformed classifier and blocked reviewer", async () => {
    const malformed = setup([reply('{"route":"in_scope"}')]);
    await expect(runAssistantEngine(malformed.options)).rejects.toMatchObject({
      code: "AI_POLICY_UNAVAILABLE",
    });
    expect(malformed.provider).toHaveBeenCalledTimes(1);
    const blocked = setup([
      reply(allowed),
      reply("Увеличь вес на 20 кг."),
      reply('{"decision":"block","reasonCode":"unsafe_advice"}'),
    ]);
    await expect(runAssistantEngine(blocked.options)).rejects.toMatchObject({
      code: "AI_REPLY_BLOCKED",
    });
  });

  it("executes at most one tool batch and reserves final call for review", async () => {
    const call = {
      id: "call1",
      type: "function" as const,
      function: { name: "preview_workout", arguments: "{}" },
    };
    const { options, provider, executeTool } = setup([
      reply(allowed),
      reply("", [call]),
      reply("Вот черновик; просмотри его в подборе."),
      reply(reviewed),
    ]);
    const result = await runAssistantEngine(options);
    expect(result.action).toEqual({ id: "proposal" });
    expect(provider).toHaveBeenCalledTimes(4);
    expect(executeTool).toHaveBeenCalledTimes(1);
    expect(provider.mock.calls[2][0].toolsAllowed).toBe(false);
    expect(provider.mock.calls[2][0].tools).toBeUndefined();
    expect(provider.mock.calls[2][0].messages.at(-1)?.role).toBe("system");
    expect(provider.mock.calls[3][0].tools).toBeUndefined();
  });

  it("does not execute further requested tools after the bounded batch", async () => {
    const call = {
      id: "call1",
      type: "function" as const,
      function: { name: "read_profile", arguments: "{}" },
    };
    const { options, executeTool } = setup([reply(allowed), reply("", [call]), reply("", [call])]);
    await expect(runAssistantEngine(options)).rejects.toMatchObject({ code: "AI_TOOL_LIMIT" });
    expect(executeTool).toHaveBeenCalledTimes(1);
  });

  it("blocks a claimed prepared workout without a real tool proposal", async () => {
    const { options, provider } = setup([
      reply(allowed),
      reply("Черновик одного занятия готов для просмотра. Открой его в подборе."),
      reply(reviewed),
    ]);
    await expect(runAssistantEngine(options)).rejects.toMatchObject({ code: "AI_REPLY_BLOCKED" });
    expect(provider).toHaveBeenCalledTimes(2);
  });

  it("allows an honest not-prepared reply", async () => {
    const { options } = setup([
      reply(allowed),
      reply("Черновик пока не готов. Где хочется заниматься?"),
      reply(reviewed),
    ]);
    expect((await runAssistantEngine(options)).text).toContain("пока не готов");
  });

  it("requests the classified preview tool and returns its actual proposal", async () => {
    const call = {
      id: "preview1",
      type: "function" as const,
      function: { name: "preview_workout", arguments: "{}" },
    };
    const { options, provider } = setup([
      reply(JSON.stringify({ ...JSON.parse(allowed), requestedAction: "preview_workout" })),
      reply("", [call]),
      reply("Черновик готов для просмотра в подборе."),
      reply(reviewed),
    ]);
    expect((await runAssistantEngine(options)).action).toEqual({ id: "proposal" });
    expect(provider.mock.calls[1][0].requiredTool).toBe("preview_workout");
  });

  it("keeps recent medical text out of provider context", async () => {
    const { options, provider } = setup([reply(allowed), reply("Привет!"), reply(reviewed)], {
      history: [
        {
          id: "old",
          role: "user",
          text: "Болит колено, диагноз секретный",
          createdAt: new Date().toISOString(),
        },
      ],
    });
    await runAssistantEngine(options);
    expect(JSON.stringify(provider.mock.calls)).not.toContain("диагноз секретный");
  });
});
