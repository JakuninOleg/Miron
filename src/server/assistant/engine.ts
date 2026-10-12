import type { ChatMessage, CompanionId } from "../../shared/contracts";
import { DomainError } from "../domain/errors";
import { buildCompanionPrompt } from "./prompts";
import {
  CLASSIFIER_PROMPT,
  GENERATOR_POLICY,
  GENERATOR_OUTPUT_STYLE,
  REVIEWER_PROMPT,
  preparedSafety,
  reviewerSchema,
  scopeBoundary,
  scopeSchema,
  type Scope,
  type ReviewVerdict,
} from "./policy";
import type { Provider, ProviderMessage, ProviderTool, ProviderUsage, ToolCall } from "./provider";

export interface ToolOutcome<Action> {
  evidence: unknown;
  action?: Action;
}
// Diagnostic metadata only: never include messages, drafts, profile values or tool arguments.
export type EngineTrace =
  | { stage: "prepared"; reason: "local_safety" | "scope_boundary" }
  | { stage: "scope"; route: Scope["route"]; trainingSafety: Scope["trainingSafety"] }
  | { stage: "generation"; toolCount: number; outputCharacters: number }
  | { stage: "tool_result"; resultBytes: number; hasAction: boolean }
  | {
      stage: "draft_gate";
      decision: "allow" | "block";
      reason: "valid" | "empty" | "too_long" | "forbidden_content" | "gender_placeholder";
    }
  | {
      stage: "review";
      decision: "allow" | "block" | "invalid";
      reasonCode: ReviewVerdict["reasonCode"] | "invalid_schema";
    };
export interface EngineOptions<Action> {
  text: string;
  companion: CompanionId;
  history: ChatMessage[];
  profile: unknown;
  provider: Provider;
  signal: AbortSignal;
  tools: ProviderTool[];
  executeTool: (call: ToolCall) => Promise<ToolOutcome<Action>>;
  onUsage?: (usage: EngineResult<Action>["usage"]) => void;
  onTrace?: (event: EngineTrace) => void;
}
export interface EngineResult<Action> {
  text: string;
  action?: Action;
  source: "model" | "prepared";
  useful: boolean;
  usage: {
    calls: number;
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    costHintRub: number | null;
  };
}

const maxOutputCharacters = 4_000;
const maxToolResultBytes = 14_000;
function parseJson(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new DomainError("AI_POLICY_UNAVAILABLE", 502, "Ответ напарника пока недоступен.");
  }
}

export async function runAssistantEngine<Action>(
  options: EngineOptions<Action>,
): Promise<EngineResult<Action>> {
  const trace = (event: EngineTrace) => {
    // Observability cannot change a turn's outcome or expose failed callback details.
    try {
      options.onTrace?.(event);
    } catch {
      /* optional diagnostics */
    }
  };
  const usage: EngineResult<Action>["usage"] = {
    calls: 0,
    promptTokens: 0,
    completionTokens: 0,
    totalTokens: 0,
    costHintRub: 0,
  };
  const record = (part: ProviderUsage) => {
    usage.calls += 1;
    usage.promptTokens += part.promptTokens;
    usage.completionTokens += part.completionTokens;
    usage.totalTokens += part.totalTokens;
    usage.costHintRub =
      usage.costHintRub !== null && part.costHintRub !== null
        ? usage.costHintRub + part.costHintRub
        : null;
    options.onUsage?.({ ...usage });
    if (usage.totalTokens > 24_000)
      throw new DomainError("AI_BUDGET_EXCEEDED", 502, "Ответ напарника пока недоступен.");
  };
  const prepared = (text: string): EngineResult<Action> => ({
    text,
    source: "prepared",
    useful: false,
    usage,
  });
  const safety = preparedSafety(options.text);
  if (safety) {
    trace({ stage: "prepared", reason: "local_safety" });
    return prepared(safety);
  }
  // No raw medical/safety turn is replayed into the provider's conversation.
  const history = options.history
    .filter((message) => !preparedSafety(message.text))
    .slice(-8)
    .map((message) => ({ role: message.role, content: message.text.slice(0, 1_000) }));
  const scopeReply = await options.provider({
    messages: [
      { role: "system", content: CLASSIFIER_PROMPT },
      {
        role: "user",
        content: JSON.stringify({
          recentContext: history.slice(-4),
          newMessage: options.text,
          adultAccess: "confirmed",
        }),
      },
    ],
    maxTokens: 384,
    json: true,
    signal: options.signal,
  });
  record(scopeReply.usage);
  if (scopeReply.toolCalls.length)
    throw new DomainError("AI_POLICY_UNAVAILABLE", 502, "Ответ напарника пока недоступен.");
  const parsedScope = scopeSchema.safeParse(parseJson(scopeReply.content));
  if (!parsedScope.success)
    throw new DomainError("AI_POLICY_UNAVAILABLE", 502, "Ответ напарника пока недоступен.");
  trace({
    stage: "scope",
    route: parsedScope.data.route,
    trainingSafety: parsedScope.data.trainingSafety,
  });
  const boundary = scopeBoundary(parsedScope.data);
  if (boundary) {
    trace({ stage: "prepared", reason: "scope_boundary" });
    return prepared(boundary);
  }

  const messages: ProviderMessage[] = [
    {
      role: "system",
      content: `${GENERATOR_POLICY}\n\n${buildCompanionPrompt(options.companion)}\n\n${GENERATOR_OUTPUT_STYLE}`,
    },
    {
      role: "user",
      content: JSON.stringify({
        authorizedProfile: options.profile,
        scope: parsedScope.data,
        contextIsData: true,
      }),
    },
    ...history,
    { role: "user", content: options.text },
  ];
  const generated = await options.provider({
    messages,
    maxTokens: 768,
    tools: options.tools,
    signal: options.signal,
  });
  record(generated.usage);
  trace({
    stage: "generation",
    toolCount: generated.toolCalls.length,
    outputCharacters: generated.content.length,
  });
  let finalReply = generated;
  let action: Action | undefined;
  const receipts: unknown[] = [];
  if (generated.toolCalls.length) {
    if (
      generated.toolCalls.length > 4 ||
      new Set(generated.toolCalls.map((call) => call.id)).size !== generated.toolCalls.length
    )
      throw new DomainError("AI_TOOL_LIMIT", 502, "Ответ напарника пока недоступен.");
    messages.push({ role: "assistant", content: null, tool_calls: generated.toolCalls });
    for (const call of generated.toolCalls) {
      if (options.signal.aborted)
        throw new DomainError("AI_TIMEOUT", 504, "Напарник не успел ответить. Попробуй позже.");
      let outcome: ToolOutcome<Action>;
      try {
        outcome = await options.executeTool(call);
      } catch (error) {
        // Authoritative access failures must terminate the whole request.
        if (error instanceof DomainError && [401, 403].includes(error.status)) throw error;
        outcome = {
          evidence: {
            error: error instanceof DomainError ? error.code : "INVALID_TOOL_INPUT",
            performed: false,
          },
        };
      }
      const serialized = JSON.stringify(outcome.evidence);
      trace({
        stage: "tool_result",
        resultBytes: Buffer.byteLength(serialized),
        hasAction: Boolean(outcome.action),
      });
      if (Buffer.byteLength(serialized) > maxToolResultBytes)
        throw new DomainError(
          "AI_CONTEXT_TOO_LARGE",
          422,
          "Для этого запроса слишком много данных. Открой подробности в приложении.",
        );
      if (outcome.action) {
        if (action)
          throw new DomainError("AI_AMBIGUOUS_ACTION", 422, "Предложи по одному изменению за раз.");
        action = outcome.action;
      }
      receipts.push({ name: call.function.name, result: outcome.evidence });
      messages.push({ role: "tool", tool_call_id: call.id, content: serialized });
    }
    finalReply = await options.provider({
      messages,
      maxTokens: 768,
      tools: options.tools,
      toolsAllowed: false,
      signal: options.signal,
    });
    record(finalReply.usage);
    if (finalReply.toolCalls.length)
      throw new DomainError("AI_TOOL_LIMIT", 502, "Ответ напарника пока недоступен.");
  }
  const text = finalReply.content.trim();
  const draftReason = !text
    ? "empty"
    : text.length > maxOutputCharacters
      ? "too_long"
      : /\(а\)/i.test(text)
        ? "gender_placeholder"
        : /<\/?(?:think|analysis)>|sk-pv-|```(?:javascript|python|typescript|sql)/i.test(text)
          ? "forbidden_content"
          : "valid";
  trace({
    stage: "draft_gate",
    decision: draftReason === "valid" ? "allow" : "block",
    reason: draftReason,
  });
  if (draftReason !== "valid")
    throw new DomainError(
      "AI_REPLY_BLOCKED",
      502,
      "Не удалось подготовить подходящий ответ. Сформулируй вопрос иначе.",
    );
  const reviewer = await options.provider({
    messages: [
      { role: "system", content: REVIEWER_PROMPT },
      {
        role: "user",
        content: JSON.stringify({
          originalNewMessage: options.text,
          scope: parsedScope.data,
          profile: options.profile,
          recentContext: history,
          evidence: receipts,
          action: action ?? null,
          draft: text,
        }),
      },
    ],
    maxTokens: 192,
    json: true,
    signal: options.signal,
  });
  record(reviewer.usage);
  const verdict = reviewerSchema.safeParse(parseJson(reviewer.content));
  trace({
    stage: "review",
    decision: !reviewer.toolCalls.length && verdict.success ? verdict.data.decision : "invalid",
    reasonCode: verdict.success ? verdict.data.reasonCode : "invalid_schema",
  });
  if (reviewer.toolCalls.length || !verdict.success || verdict.data.decision !== "allow")
    throw new DomainError(
      "AI_REPLY_BLOCKED",
      502,
      "Не удалось подготовить подходящий ответ. Сформулируй вопрос иначе.",
    );
  return { text, ...(action ? { action } : {}), source: "model", useful: true, usage };
}
