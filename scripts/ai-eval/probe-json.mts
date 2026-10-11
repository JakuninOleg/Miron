/** Small opt-in format compatibility probe; no application or workout actions. */
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { z } from "zod";

const live = process.argv.includes("--live");
const models = ["qwen3.8-omni-flash:cxa", "qwen3.8-flash:cxa", "deepseek-v4.1-flash:cxbc"];
const output = resolve(".local", "ai-eval", "json-probe-2026-10-06");
const key = process.env.PLUSVIBE_API_KEY?.trim();
const expected = z.object({ action: z.literal("rest"), restSeconds: z.literal(45) }).strict();
const jsonSchema = z.toJSONSchema(expected);
delete jsonSchema.$schema;
const responseSchema = z.object({
  choices: z.array(
    z.object({
      message: z.object({ content: z.string().nullish(), reasoning_content: z.string().nullish() }),
      finish_reason: z.string().nullish(),
    }),
  ),
  usage: z.record(z.string(), z.unknown()).optional(),
});
const results = [];
await mkdir(output, { recursive: true });
if (!live) {
  console.log(JSON.stringify({ dryRun: true, maximumCalls: models.length * 2, maxTokens: 128 }));
} else {
  if (!key?.startsWith("sk-pv-")) throw new Error("Missing PLUSVIBE_API_KEY");
  for (const model of models) {
    for (const mode of ["json_object", "json_schema"] as const) {
      const start = performance.now();
      const response = await fetch("https://plusvibeapi.ru/v1/chat/completions", {
        method: "POST",
        signal: AbortSignal.timeout(20000),
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model,
          stream: false,
          reasoning_effort: "none",
          max_tokens: 128,
          ...(model.startsWith("deepseek-") ? { thinking: { type: "disabled" } } : {}),
          messages: [
            {
              role: "system",
              content:
                "Верни только JSON с двумя полями: action = rest, restSeconds = 45. Никаких действий с приложением не выполняется.",
            },
            { role: "user", content: "Тест формата: отдых 45 секунд." },
          ],
          response_format:
            mode === "json_object"
              ? { type: mode }
              : {
                  type: mode,
                  json_schema: { name: "rest_test", strict: true, schema: jsonSchema },
                },
        }),
      });
      const body: unknown = await response.json();
      const parsed = responseSchema.safeParse(body);
      const text = parsed.success ? (parsed.data.choices[0]?.message.content ?? "") : "";
      let valid = false;
      try {
        valid = expected.safeParse(JSON.parse(text)).success;
      } catch {
        /* Measured incompatible output. */
      }
      const result = {
        model,
        mode,
        httpStatus: response.status,
        elapsedMs: performance.now() - start,
        validForTestSchema: valid,
        text,
        usage: parsed.success ? parsed.data.usage : undefined,
        reasoningCharacters: parsed.success
          ? (parsed.data.choices[0]?.message.reasoning_content ?? "").length
          : undefined,
        warnings: response.headers.get("x-plusvibe-warnings"),
        generationId: response.headers.get("x-pv-generation-id"),
        costHintRub: response.headers.get("x-pv-cost-rub"),
        error: response.ok
          ? undefined
          : z
              .object({
                error: z.object({ code: z.string().optional(), message: z.string().optional() }),
              })
              .safeParse(body).data?.error,
      };
      results.push(result);
      await writeFile(resolve(output, "results.json"), JSON.stringify(results, null, 2));
      console.log(JSON.stringify(result));
    }
  }
}
