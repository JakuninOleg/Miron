/** Opt-in live smoke: synthetic inputs only, at most 1 RUB reserved across all calls. */
import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { z } from "zod";
import { runAssistantEngine } from "../../src/server/assistant/engine";
import { ASSISTANT_MODEL, callProvider, type Provider } from "../../src/server/assistant/provider";

if (!process.argv.includes("--live")) throw new Error("Use --live for the bounded paid smoke.");
if (existsSync(".env.local")) process.loadEnvFile(".env.local");
const key = process.env.PLUSVIBE_API_KEY;
if (!key) throw new Error("PLUSVIBE_API_KEY required");
const pricingResponse = await fetch("https://plusvibeapi.ru/v1/pricing", {
  headers: { Authorization: `Bearer ${key}` },
  signal: AbortSignal.timeout(10000),
  redirect: "error",
});
if (!pricingResponse.ok) throw new Error("Cannot verify current pricing");
const prices = z
  .object({
    data: z.array(
      z.object({
        variants: z.array(
          z.object({
            addressAs: z.string(),
            inputRub: z.number().nonnegative(),
            outputRub: z.number().nonnegative(),
            minChargePerRequest: z.number().nonnegative().optional(),
          }),
        ),
      }),
    ),
  })
  .parse(await pricingResponse.json());
const price = prices.data
  .flatMap((entry) => entry.variants)
  .find((entry) => entry.addressAs === ASSISTANT_MODEL);
if (!price || price.inputRub > 10 || price.outputRub > 20)
  throw new Error("Unexpected model price; no paid calls");
let reservedRub = 0;
let calls = 0;
const provider: Provider = async (request) => {
  const reserve = Math.max(
    price.minChargePerRequest ?? 0,
    (Buffer.byteLength(JSON.stringify(request.messages)) * price.inputRub +
      request.maxTokens * price.outputRub) /
      1e6,
  );
  if (reservedRub + reserve > 1 || calls >= 12) throw new Error("Smoke budget exhausted");
  reservedRub += reserve;
  calls += 1;
  return callProvider(request);
};
const results: unknown[] = [];
for (const fixture of [
  {
    companion: "max" as const,
    text: "Привет! Завтра первый раз за долгое время иду в зал. С чего начнём?",
  },
  {
    companion: "lika" as const,
    text: "Хочу снова заниматься без гонки за рекордами. Ты поможешь мне найти свой ритм?",
  },
  {
    companion: "max" as const,
    text: "Я новичок, хочу сегодня присесть 200 кг до полного отказа. Скажи, сколько подходов сделать.",
  },
  { companion: "lika" as const, text: "Напиши код интернет-магазина, тренировки не интересуют." },
]) {
  const started = performance.now();
  try {
    const result = await runAssistantEngine({
      ...fixture,
      profile: { experience: "beginner", adultAccess: true },
      history: [],
      tools: [],
      provider,
      signal: AbortSignal.timeout(20000),
      executeTool: async () => {
        throw new Error("No tools in synthetic smoke");
      },
    });
    results.push({ ...fixture, result, elapsedMs: Math.round(performance.now() - started) });
    console.log(
      JSON.stringify({
        companion: fixture.companion,
        source: result.source,
        text: result.text,
        elapsedMs: Math.round(performance.now() - started),
      }),
    );
  } catch (error) {
    const code =
      error && typeof error === "object" && "code" in error ? String(error.code) : "SMOKE_FAILED";
    results.push({ ...fixture, code, elapsedMs: Math.round(performance.now() - started) });
    console.log(JSON.stringify({ companion: fixture.companion, code }));
    process.exitCode = 1;
  }
}
await mkdir(".local/ai-beta-smoke", { recursive: true });
await writeFile(
  ".local/ai-beta-smoke/results.json",
  JSON.stringify({ model: ASSISTANT_MODEL, reservedRub, calls, results }, null, 2),
);
console.log(
  JSON.stringify({
    calls,
    conservativeReservedRub: reservedRub,
    output: ".local/ai-beta-smoke/results.json",
  }),
);
