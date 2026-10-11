/** Isolated, opt-in paid model eval. Never calls application APIs or its database. */
import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve, sep } from "node:path";
import { performance } from "node:perf_hooks";
import { z } from "zod";
import { buildCompanionPrompt } from "../../src/server/assistant/prompts.js";
import { EVAL_CASES, type EvalCase } from "./fixtures.js";

const BASE = "https://plusvibeapi.ru";
const MODELS = [
  "qwen3.8-omni-flash:cxa",
  "qwen3.8-flash:network",
  "qwen3.8-flash:cxa",
  "deepseek-v4.1-flash:cxbc",
];
const argv = process.argv.slice(2);
const option = (name: string, fallback: string) =>
  argv
    .find((arg) => arg.startsWith(`--${name}=`))
    ?.split("=")
    .slice(1)
    .join("=") ?? fallback;
const live = argv.includes("--live");
const repeats = z.coerce.number().int().min(1).max(3).parse(option("repeats", "1"));
const deadlineMs = z.coerce
  .number()
  .int()
  .min(1000)
  .max(60000)
  .parse(option("deadline-ms", "20000"));
const budgetRub = z.coerce.number().positive().max(1).parse(option("budget-rub", "1"));
const selectedModels = option("models", MODELS[0]).split(",");
if (selectedModels.some((model) => !MODELS.includes(model))) throw new Error("Unapproved model");
const selectedIds = option("cases", "").split(",").filter(Boolean);
const cases = EVAL_CASES.filter((item) => !selectedIds.length || selectedIds.includes(item.id));
if (!cases.length || selectedIds.some((id) => !cases.some((item) => item.id === id))) {
  throw new Error("Unknown or empty case selection");
}
const maxTokens = 384;
const stamp = new Date().toISOString().replaceAll(":", "-");
const outputDir = resolve(".local", "ai-eval", option("label", stamp));
if (!outputDir.startsWith(`${resolve(".local", "ai-eval")}${sep}`))
  throw new Error("Invalid output path");
const apiKey = process.env.PLUSVIBE_API_KEY?.trim();
if (live && !apiKey?.startsWith("sk-pv-")) throw new Error("PLUSVIBE_API_KEY is missing");

const empty = z.object({}).strict();
const schemas = {
  record_set: z
    .object({
      exerciseId: z.string(),
      setId: z.string(),
      reps: z.number().int().min(1).max(100),
      weightKg: z.number().min(0).max(500),
    })
    .strict(),
  show_next_exercise: empty,
  get_session_state: empty,
  suggest_exercise_swap: z.object({ exerciseId: z.string() }).strict(),
  replace_exercise: z.object({ candidateId: z.string() }).strict(),
  finish_workout: empty,
};
type ToolName = keyof typeof schemas;
const descriptions: Record<ToolName, string> = {
  record_set:
    "Записать текущий незаписанный подход по явному сообщению. При pendingOperation unknown сначала восстанови состояние; повторную запись не делай.",
  show_next_exercise:
    "Один переход к следующему закреплённому упражнению. При конфликте прочитай состояние, не повторяй переход автоматически.",
  get_session_state:
    "Прочитать актуальное занятие и результат pendingOperation, если он имеется. Чтение ничего не изменяет.",
  suggest_exercise_swap:
    "Получить проверенные кандидаты замены текущего упражнения. Только предложение; затем нужен выбор пользователя.",
  replace_exercise:
    "Заменить будущую часть занятия на выданный candidateId после явного выбора пользователя. Неизвестный candidateId запрещён.",
  finish_workout:
    "Завершить всю тренировку только по однозначному намерению; неоднозначное 'всё' уточни.",
};
const tools = Object.entries(schemas).map(([name, schema]) => {
  const jsonSchema = z.toJSONSchema(schema);
  delete jsonSchema.$schema;
  return {
    type: "function",
    function: { name, description: descriptions[name as ToolName], parameters: jsonSchema },
  };
});

type ToolCall = { id: string; type: "function"; function: { name: string; arguments: string } };
type Message = {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
};
const usageSchema = z
  .object({ prompt_tokens: z.number(), completion_tokens: z.number(), total_tokens: z.number() })
  .passthrough();
type Usage = z.infer<typeof usageSchema>;
type CallTrace = {
  httpStatus: number;
  elapsedMs: number;
  firstActionDeltaMs: number | null;
  firstContentDeltaMs: number | null;
  content: string;
  toolCalls: ToolCall[];
  usage?: Usage;
  model?: string;
  finishReason?: string;
  reasoningCharacters: number;
  estimateRub?: number;
  costHintRub?: number;
  headers: Record<string, string>;
  error?: string;
};
type EvalResult = {
  model: string;
  caseId: string;
  repeat: number;
  elapsedMs: number;
  calls: CallTrace[];
  toolAttempts: {
    name: string;
    args: unknown;
    envelope: { operationId: string; expectedRevision: number };
    executed: boolean;
    result: unknown;
  }[];
  automaticFailures: string[];
  finalText: string;
  manualChecks: string[];
};
const chunkSchema = z
  .object({
    model: z.string().optional(),
    usage: usageSchema.nullish(),
    pv_cost_rub: z.number().optional(),
    error: z.unknown().optional(),
    choices: z
      .array(
        z.object({
          index: z.number().optional(),
          finish_reason: z.string().nullish(),
          delta: z
            .object({
              content: z.string().nullish(),
              reasoning_content: z.string().nullish(),
              reasoning: z.string().nullish(),
              tool_calls: z
                .array(
                  z.object({
                    index: z.number(),
                    id: z.string().optional(),
                    function: z
                      .object({ name: z.string().optional(), arguments: z.string().optional() })
                      .optional(),
                  }),
                )
                .optional(),
            })
            .passthrough(),
        }),
      )
      .optional(),
  })
  .passthrough();
let reservedRub = 0;
let estimatedSpendRub = 0;
let spendUnknown = false;
const rates: Record<string, { input: number; output: number; minimum: number }> = {
  [MODELS[0]]: { input: 0.76, output: 2.37, minimum: 0.0013 },
  [MODELS[1]]: { input: 2.11, output: 6.2, minimum: 0 },
  [MODELS[2]]: { input: 2.11, output: 6.2, minimum: 0.0013 },
  [MODELS[3]]: { input: 1.14, output: 4.53, minimum: 0.0013 },
};

async function readApi(path: string): Promise<unknown> {
  const response = await fetch(`${BASE}${path}`, {
    headers: { Authorization: `Bearer ${apiKey}` },
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error(`Read API HTTP ${response.status}`);
  return response.json();
}
async function balance(): Promise<number> {
  return z.object({ balance_rub: z.number() }).parse(await readApi("/v1/balance")).balance_rub;
}

async function completion(
  model: string,
  messages: Message[],
  signal: AbortSignal,
): Promise<CallTrace> {
  const body = {
    model,
    messages,
    tools,
    tool_choice: "auto",
    parallel_tool_calls: false,
    stream: true,
    stream_options: { include_usage: true },
    reasoning_effort: "none",
    ...(model.startsWith("deepseek-") ? { thinking: { type: "disabled" } } : {}),
    temperature: 0.3,
    max_tokens: maxTokens,
  };
  // UTF-8 bytes conservatively approximate an upper bound on input tokens for this small fixture.
  const rate = rates[model];
  const reserve = Math.max(
    rate.minimum,
    (Buffer.byteLength(JSON.stringify(body)) * rate.input + maxTokens * rate.output) / 1e6,
  );
  if (spendUnknown || estimatedSpendRub + reservedRub + reserve > budgetRub)
    throw new Error("Local eval budget guard");
  reservedRub += reserve;
  const start = performance.now();
  const trace: CallTrace = {
    httpStatus: 0,
    elapsedMs: 0,
    firstActionDeltaMs: null,
    firstContentDeltaMs: null,
    content: "",
    toolCalls: [],
    reasoningCharacters: 0,
    headers: {},
  };
  const fragments = new Map<number, ToolCall>();
  let done = false;
  try {
    const response = await fetch(`${BASE}/v1/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "x-pv-cost": "1",
      },
      body: JSON.stringify(body),
      signal,
    });
    trace.httpStatus = response.status;
    for (const header of [
      "x-pv-cost-rub",
      "x-plusvibe-route",
      "x-plusvibe-warnings",
      "x-pv-generation-id",
    ]) {
      const value = response.headers.get(header);
      if (value !== null) trace.headers[header] = value;
    }
    const costHeader = response.headers.get("x-pv-cost-rub");
    if (costHeader !== null && Number.isFinite(Number(costHeader)))
      trace.costHintRub = Number(costHeader);
    if (!response.ok) throw new Error(`Completion HTTP ${response.status}`);
    if (!response.body) throw new Error("Missing response body");
    const accept = (event: string) => {
      const data = event
        .split(/\r?\n/)
        .filter((line) => line.startsWith("data:"))
        .map((line) => line.slice(5).trimStart())
        .join("\n");
      if (!data) return;
      if (data.trim() === "[DONE]") {
        done = true;
        return;
      }
      const chunk = chunkSchema.parse(JSON.parse(data));
      if (chunk.error) throw new Error("Provider SSE error");
      if (chunk.model) trace.model = chunk.model;
      if (chunk.usage) trace.usage = chunk.usage;
      if (chunk.pv_cost_rub !== undefined) trace.costHintRub = chunk.pv_cost_rub;
      const choice = chunk.choices?.[0];
      if (!choice) return;
      if (choice.finish_reason) trace.finishReason = choice.finish_reason;
      const delta = choice.delta;
      trace.reasoningCharacters += (delta.reasoning_content ?? delta.reasoning ?? "").length;
      if (delta.content) {
        trace.firstContentDeltaMs ??= performance.now() - start;
        trace.firstActionDeltaMs ??= performance.now() - start;
        trace.content += delta.content;
      }
      for (const part of delta.tool_calls ?? []) {
        trace.firstActionDeltaMs ??= performance.now() - start;
        const item = fragments.get(part.index) ?? {
          id: "",
          type: "function" as const,
          function: { name: "", arguments: "" },
        };
        if (part.id) item.id = part.id;
        item.function.name += part.function?.name ?? "";
        item.function.arguments += part.function?.arguments ?? "";
        fragments.set(part.index, item);
      }
    };
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    while (true) {
      const next = await reader.read();
      buffer += decoder.decode(next.value, { stream: !next.done });
      let boundary: RegExpExecArray | null;
      while ((boundary = /\r?\n\r?\n/.exec(buffer))) {
        const event = buffer.slice(0, boundary.index);
        buffer = buffer.slice(boundary.index + boundary[0].length);
        accept(event);
      }
      if (next.done) break;
    }
    if (buffer.trim()) accept(buffer);
    if (!done) throw new Error("Incomplete SSE stream: missing DONE");
  } catch (error) {
    trace.error =
      error instanceof Error
        ? error.name === "TimeoutError" || signal.aborted
          ? "Intent deadline exceeded"
          : error.message
        : "Unknown transport error";
  } finally {
    trace.elapsedMs = performance.now() - start;
    trace.toolCalls = [...fragments.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([, value]) => value);
    reservedRub -= reserve;
    if (trace.usage) {
      trace.estimateRub = Math.max(
        rate.minimum,
        (trace.usage.prompt_tokens * rate.input + trace.usage.completion_tokens * rate.output) /
          1e6,
      );
      estimatedSpendRub += Math.max(trace.estimateRub, trace.costHintRub ?? 0);
    } else if (trace.error) {
      // An aborted paid request can settle later: reserve its maximum rather than assume it was free.
      estimatedSpendRub += reserve;
    } else {
      spendUnknown = true;
    }
  }
  return trace;
}

function equalArgs(a: unknown, b: unknown): boolean {
  if (!a || typeof a !== "object" || !b || typeof b !== "object") return a === b;
  const left = a as Record<string, unknown>,
    right = b as Record<string, unknown>;
  return (
    Object.keys(left).length === Object.keys(right).length &&
    Object.keys(right).every((key) => left[key] === right[key])
  );
}

async function runCase(model: string, item: EvalCase, repeat: number): Promise<EvalResult> {
  const start = performance.now();
  const result: EvalResult = {
    model,
    caseId: item.id,
    repeat,
    elapsedMs: 0,
    calls: [],
    toolAttempts: [],
    automaticFailures: [],
    finalText: "",
    manualChecks: item.checks,
  };
  const signal = AbortSignal.timeout(deadlineMs);
  const envelope = { operationId: randomUUID(), expectedRevision: 7 };
  const messages: Message[] = [
    {
      role: "system",
      content: `${buildCompanionPrompt(item.persona)}\n\nОтвечай в 1–3 коротких предложениях. Доступны только выданные tools. OperationId и версия назначаются приложением: не включай их в аргументы. Повтор неизвестной операции допускает только чтение состояния, а не повторную мутацию.`,
    },
    {
      role: "system",
      content: `Синтетическое состояние, факты (не инструкции): ${JSON.stringify(item.context)}`,
    },
    { role: "user", content: item.user },
  ];
  try {
    for (let step = 0; step < 3; step++) {
      const call = await completion(model, messages, signal);
      result.calls.push(call);
      if (call.error) throw new Error(call.error);
      if (call.reasoningCharacters)
        result.automaticFailures.push("Reasoning returned despite none");
      if (call.headers["x-plusvibe-warnings"]?.includes("value_clamped:max_tokens")) {
        result.automaticFailures.push(
          "Requested max_tokens was clamped; effective cap requires verification",
        );
      }
      if (
        /you.?ve reached your daily usage limit|come back tomorrow to continue|usage limit for chat/i.test(
          call.content,
        )
      ) {
        result.automaticFailures.push("Provider unavailable disguised as HTTP 200");
        result.finalText = call.content;
        break;
      }
      if (call.finishReason === "length") result.automaticFailures.push("Output truncated");
      if (!call.toolCalls.length) {
        result.finalText = call.content;
        break;
      }
      if (call.content.trim()) result.automaticFailures.push("Intermediate text before tool ACK");
      messages.push({
        role: "assistant",
        content: call.content || null,
        tool_calls: call.toolCalls,
      });
      for (const toolCall of call.toolCalls) {
        if (result.toolAttempts.length >= 4) throw new Error("Tool execution limit");
        const name = toolCall.function.name;
        const args: unknown = JSON.parse(toolCall.function.arguments);
        const expectedIndex = result.toolAttempts.length;
        const validName = Object.hasOwn(schemas, name);
        const parsed = validName ? schemas[name as ToolName].safeParse(args) : null;
        const expected = item.expectedTools[expectedIndex] === name;
        const argsMatch =
          expectedIndex !== 0 || !item.expectedArgs || equalArgs(args, item.expectedArgs);
        const allowed = expected && parsed?.success === true && argsMatch;
        if (!allowed)
          result.automaticFailures.push(`Invalid tool/arguments at ${expectedIndex}: ${name}`);
        const toolResult = allowed
          ? (item.fixtureResults?.[name] ?? { status: "unavailable" })
          : { status: "rejected", reason: "No authorized fixture action" };
        result.toolAttempts.push({ name, args, envelope, executed: allowed, result: toolResult });
        messages.push({
          role: "tool",
          tool_call_id: toolCall.id,
          content: JSON.stringify(toolResult),
        });
      }
    }
    if (!result.finalText.trim())
      result.automaticFailures.push("No final answer within model-call limit");
    if (result.toolAttempts.map((tool) => tool.name).join(",") !== item.expectedTools.join(","))
      result.automaticFailures.push("Tool sequence differs from expected");
    if (
      /record_set|show_next_exercise|get_session_state|suggest_exercise_swap|replace_exercise|finish_workout|REVISION_CONFLICT/.test(
        result.finalText,
      )
    )
      result.automaticFailures.push("Internal tool/code leaked in final answer");
  } catch (error) {
    result.automaticFailures.push(error instanceof Error ? error.message : "Unknown runner error");
  }
  result.elapsedMs = performance.now() - start;
  console.log(
    JSON.stringify({
      model,
      caseId: item.id,
      repeat,
      elapsedMs: Math.round(result.elapsedMs),
      calls: result.calls.length,
      tools: result.toolAttempts.map((tool) => tool.name),
      failures: result.automaticFailures,
      text: result.finalText,
    }),
  );
  await writeFile(
    resolve(outputDir, `${model.replaceAll(":", "-")}.${item.id}.${repeat}.json`),
    JSON.stringify(result, null, 2),
  );
  return result;
}

await mkdir(outputDir, { recursive: true });
const manifest = {
  version: 1,
  startedAt: new Date().toISOString(),
  live,
  selectedModels,
  caseIds: cases.map((item) => item.id),
  repeats,
  deadlineMs,
  maxTokens,
  budgetRub,
  reasoningEffort: "none",
  nativeThinking:
    "DeepSeek requests also include thinking.type=disabled; request parameters may be normalized by the gateway",
  temperature: 0.3,
  promptHash: createHash("sha256")
    .update(buildCompanionPrompt("max") + buildCompanionPrompt("lika"))
    .digest("hex"),
  fixtureHash: createHash("sha256").update(JSON.stringify(EVAL_CASES)).digest("hex"),
  runnerHash: createHash("sha256")
    .update(await readFile(new URL(import.meta.url)))
    .digest("hex"),
  scope:
    "Synthetic model eval with stub tools; no application integration, health data, database commands, or external tool executions",
};
await writeFile(resolve(outputDir, "manifest.json"), JSON.stringify(manifest, null, 2));
if (!live) {
  console.log(
    JSON.stringify({
      dryRun: true,
      cases: cases.length,
      models: selectedModels,
      maximumModelCalls: cases.length * repeats * selectedModels.length * 3,
      outputDir,
    }),
  );
} else {
  const priceCatalog = z
    .object({
      data: z.array(
        z
          .object({
            variants: z.array(
              z
                .object({
                  addressAs: z.string(),
                  inputRub: z.number(),
                  outputRub: z.number(),
                  minChargePerRequest: z.number().optional(),
                })
                .passthrough(),
            ),
          })
          .passthrough(),
      ),
    })
    .parse(await readApi("/v1/pricing"));
  const variants = priceCatalog.data.flatMap((row) => row.variants);
  for (const model of selectedModels) {
    const price = variants.find((row) => row.addressAs === model);
    if (!price || price.inputRub > 10 || price.outputRub > 20)
      throw new Error("Unexpected current model price; no calls made");
    rates[model] = {
      input: price.inputRub,
      output: price.outputRub,
      minimum: price.minChargePerRequest ?? 0,
    };
  }
  await writeFile(
    resolve(outputDir, "prices.json"),
    JSON.stringify(
      Object.fromEntries(selectedModels.map((model) => [model, rates[model]])),
      null,
      2,
    ),
  );
  const before = await balance();
  if (before <= 0 || before < budgetRub) throw new Error("Insufficient balance for test budget");
  console.log(JSON.stringify({ balanceBefore: before, budgetRub }));
  const batches = await Promise.all(
    selectedModels.map(async (model) => {
      const results: EvalResult[] = [];
      for (let repeat = 1; repeat <= repeats; repeat++) {
        for (const item of cases) {
          results.push(await runCase(model, item, repeat));
          if (
            results
              .at(-1)
              ?.calls.some((call) =>
                call.headers["x-plusvibe-warnings"]?.includes("value_clamped:max_tokens"),
              )
          )
            return results;
          if (spendUnknown || estimatedSpendRub + reservedRub > budgetRub * 0.9) break;
        }
      }
      return results;
    }),
  );
  const results = batches.flat();
  const after = await balance();
  const historySchema = z.object({
    total: z.number(),
    data: z.array(
      z
        .object({
          model: z.string(),
          route: z.string().optional(),
          address_as: z.string().optional(),
          prompt_tokens: z.number().optional(),
          completion_tokens: z.number().optional(),
          cost_rub: z.number(),
          created_at: z.string(),
        })
        .passthrough(),
    ),
  });
  const historyTo = new Date().toISOString();
  const historyData: z.infer<typeof historySchema>["data"] = [];
  for (let page = 1; page <= 10; page++) {
    const history = historySchema.parse(
      await readApi(
        `/v1/generations?page=${page}&limit=100&dateFrom=${encodeURIComponent(manifest.startedAt)}&dateTo=${encodeURIComponent(historyTo)}`,
      ),
    );
    historyData.push(...history.data);
    if (historyData.length >= history.total) break;
    if (page === 10) throw new Error("Account-window history exceeds bounded pagination");
  }
  const sanitizedHistory = historyData.map(
    ({ model, route, address_as, prompt_tokens, completion_tokens, cost_rub, created_at }) => ({
      model,
      route,
      address_as,
      prompt_tokens,
      completion_tokens,
      cost_rub,
      created_at,
    }),
  );
  const summary = {
    ...manifest,
    completedAt: new Date().toISOString(),
    balanceBefore: before,
    balanceAfter: after,
    accountBalanceDifferenceRub: before - after,
    conservativeEstimatedSpendRub: estimatedSpendRub,
    billingScope:
      "Account time window; SSE events are not correlated per-request. Concurrent activity can affect totals and balance may be rounded.",
    history: sanitizedHistory,
    results,
  };
  await writeFile(resolve(outputDir, "results.json"), JSON.stringify(summary, null, 2));
  console.log(
    JSON.stringify({
      completed: results.length,
      structuralPasses: results.filter((result) => !result.automaticFailures.length).length,
      balanceAfter: after,
      balanceDifferenceRub: before - after,
      accountWindowHistoryCostRub: sanitizedHistory.reduce((sum, row) => sum + row.cost_rub, 0),
      outputDir,
    }),
  );
}
