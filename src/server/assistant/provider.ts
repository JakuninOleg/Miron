import { z } from "zod";
import { DomainError } from "../domain/errors";

export const ASSISTANT_MODEL = "qwen3.8-omni-flash:cxa";
export const ASSISTANT_DEADLINE_MS = 20_000;
export const MAX_PROVIDER_PAYLOAD_BYTES = 48_000;
const MAX_RESPONSE_BYTES = 65_536;

export interface ToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}
export interface ProviderMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
}
export interface ProviderTool {
  type: "function";
  function: { name: string; description: string; parameters: Record<string, unknown> };
}
export interface ProviderRequest {
  messages: ProviderMessage[];
  maxTokens: number;
  json?: boolean;
  tools?: ProviderTool[];
  toolsAllowed?: boolean;
  signal: AbortSignal;
}
export interface ProviderUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  costHintRub: number | null;
}
export interface ProviderReply {
  content: string;
  toolCalls: ToolCall[];
  usage: ProviderUsage;
}
export type Provider = (request: ProviderRequest) => Promise<ProviderReply>;

const toolCallSchema = z.object({
  id: z.string().min(1).max(160),
  type: z.literal("function"),
  function: z.object({ name: z.string().min(1).max(80), arguments: z.string().max(8_000) }),
});
const responseSchema = z.object({
  choices: z
    .array(
      z.object({
        finish_reason: z.string().nullish(),
        message: z.object({
          content: z.string().max(8_000).nullish(),
          tool_calls: z.array(toolCallSchema).max(4).optional(),
        }),
      }),
    )
    .min(1)
    .max(1),
  usage: z.object({
    prompt_tokens: z.number().int().nonnegative().max(20_000),
    completion_tokens: z.number().int().nonnegative().max(2_000),
    total_tokens: z.number().int().nonnegative().max(22_000),
  }),
});

export function assistantEnabled() {
  return (
    process.env.ENABLE_AI_ASSISTANT === "true" && Boolean(process.env.PLUSVIBE_API_KEY?.trim())
  );
}

async function boundedBody(response: Response): Promise<string> {
  if (Number(response.headers.get("content-length") ?? 0) > MAX_RESPONSE_BYTES)
    throw new DomainError("AI_INVALID_RESPONSE", 502, "Ответ напарника пока недоступен.");
  const reader = response.body?.getReader();
  if (!reader)
    throw new DomainError("AI_INVALID_RESPONSE", 502, "Ответ напарника пока недоступен.");
  const decoder = new TextDecoder();
  let body = "";
  let bytes = 0;
  while (true) {
    const part = await reader.read();
    if (part.done) break;
    bytes += part.value.byteLength;
    if (bytes > MAX_RESPONSE_BYTES) {
      await reader.cancel();
      throw new DomainError("AI_INVALID_RESPONSE", 502, "Ответ напарника пока недоступен.");
    }
    body += decoder.decode(part.value, { stream: true });
  }
  return body + decoder.decode();
}

// A fixed endpoint/model avoids SSRF and accidental fallback to an unevaluated paid route.
export const callProvider: Provider = async (request) => {
  const key = process.env.PLUSVIBE_API_KEY?.trim();
  if (!key) throw new DomainError("AI_NOT_CONFIGURED", 503, "Диалог с напарником пока недоступен.");
  const body = JSON.stringify({
    model: ASSISTANT_MODEL,
    messages: request.messages,
    stream: false,
    reasoning_effort: "none",
    temperature: request.json ? 0 : 0.3,
    max_tokens: request.maxTokens,
    ...(request.json ? { response_format: { type: "json_object" } } : {}),
    ...(request.tools?.length
      ? {
          tools: request.tools,
          tool_choice: request.toolsAllowed === false ? "none" : "auto",
          parallel_tool_calls: false,
        }
      : {}),
  });
  if (Buffer.byteLength(body) > MAX_PROVIDER_PAYLOAD_BYTES)
    throw new DomainError(
      "AI_CONTEXT_TOO_LARGE",
      422,
      "Слишком много данных для одного ответа. Сократи вопрос.",
    );
  try {
    const response = await fetch("https://plusvibeapi.ru/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body,
      signal: request.signal,
      cache: "no-store",
      redirect: "error",
    });
    if (!response.ok) {
      await response.body?.cancel();
      throw new DomainError(
        "AI_PROVIDER_UNAVAILABLE",
        503,
        "Напарник сейчас не отвечает. Попробуй позже.",
      );
    }
    const warnings = response.headers.get("x-plusvibe-warnings") ?? "";
    if (
      /value_clamped:max_tokens|param_dropped:(max_tokens|tools|response_format|reasoning_effort)/i.test(
        warnings,
      )
    ) {
      await response.body?.cancel();
      throw new DomainError("AI_PROVIDER_PARAMETERS", 502, "Ответ напарника пока недоступен.");
    }
    const parsed = responseSchema.safeParse(JSON.parse(await boundedBody(response)) as unknown);
    if (!parsed.success)
      throw new DomainError("AI_INVALID_RESPONSE", 502, "Ответ напарника пока недоступен.");
    const choice = parsed.data.choices[0];
    const content = choice.message.content?.trim() ?? "";
    const calls = choice.message.tool_calls ?? [];
    if (
      choice.finish_reason === "length" ||
      (!content && !calls.length) ||
      /you.?ve reached your daily usage limit|insufficient (balance|credits)|quota exceeded/i.test(
        content,
      )
    )
      throw new DomainError("AI_INVALID_RESPONSE", 502, "Ответ напарника пока недоступен.");
    const hint = response.headers.get("x-pv-cost-rub");
    const cost = hint ? Number(hint) : NaN;
    return {
      content,
      toolCalls: calls,
      usage: {
        promptTokens: parsed.data.usage.prompt_tokens,
        completionTokens: parsed.data.usage.completion_tokens,
        totalTokens: parsed.data.usage.total_tokens,
        costHintRub: Number.isFinite(cost) && cost >= 0 ? cost : null,
      },
    };
  } catch (error) {
    if (error instanceof DomainError) throw error;
    if (request.signal.aborted)
      throw new DomainError("AI_TIMEOUT", 504, "Напарник не успел ответить. Попробуй позже.");
    throw new DomainError(
      "AI_PROVIDER_UNAVAILABLE",
      503,
      "Напарник сейчас не отвечает. Попробуй позже.",
    );
  }
};
