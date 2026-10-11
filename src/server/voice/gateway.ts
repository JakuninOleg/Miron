import "server-only";
import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { AuthError, getCurrentUser, requireUser } from "@/server/auth";
import { consumeAuthRateLimit } from "@/server/auth/rate-limit";
import { VOICE_MAX_AUDIO_BYTES, VOICE_MAX_SECONDS, VOICE_MAX_TEXT_LENGTH } from "@/shared/voice";

const COOKIE = "miron.voice-preview";
const PREVIEW_TTL_SECONDS = 15 * 60;
const LOOPBACK = new Set(["localhost", "127.0.0.1", "[::1]"]);
const sessionSchema = z.object({ preview: z.boolean() }).strict();
const metadataSchema = z.object({
  operationId: z.uuid(),
  companion: z.enum(["max", "lika"]),
  recordingMs: z.coerce
    .number()
    .int()
    .positive()
    .max((VOICE_MAX_SECONDS + 1) * 1000),
});
const transcriptSchema = z
  .object({
    operationId: z.uuid(),
    text: z.string().trim().min(1).max(VOICE_MAX_TEXT_LENGTH),
    provider: z.enum(["groq", "local"]),
    model: z.string().regex(/^[a-zA-Z0-9_.-]{1,80}$/),
    durationMs: z
      .number()
      .int()
      .positive()
      .max((VOICE_MAX_SECONDS + 1) * 1000),
  })
  .strict();
const MEDIA_TYPES = new Set([
  "audio/webm",
  "video/webm",
  "audio/mp4",
  "video/mp4",
  "audio/ogg",
  "application/ogg",
  "audio/wav",
  "audio/x-wav",
  "audio/wave",
  "audio/aac",
  "audio/x-m4a",
]);

export class VoiceError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
    message: string,
    readonly retryAfter?: number,
  ) {
    super(message);
  }
}

function reply(value: unknown, status = 200, headers?: HeadersInit) {
  return Response.json(value, {
    status,
    headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", ...headers },
  });
}

function workerSecret() {
  const value = process.env.VOICE_WORKER_SECRET;
  if (!value || value.length < 32)
    throw new VoiceError(
      "VOICE_UNAVAILABLE",
      503,
      "Сервис распознавания пока недоступен. Можно ввести текст.",
    );
  return value;
}

function checkOrigin(request: Request) {
  const url = new URL(request.url);
  const origin = request.headers.get("origin");
  let localOrigin = false;
  if (origin && process.env.NODE_ENV === "development" && LOOPBACK.has(url.hostname)) {
    try {
      const source = new URL(origin);
      // Next dev canonicalizes 127.0.0.1 to localhost in Request.url.
      localOrigin =
        origin === source.origin &&
        LOOPBACK.has(source.hostname) &&
        source.protocol === url.protocol &&
        source.port === url.port;
    } catch {
      /* Invalid Origin remains forbidden. */
    }
  }
  const expected =
    process.env.NODE_ENV === "development" && LOOPBACK.has(url.hostname)
      ? url.origin
      : process.env.BETTER_AUTH_URL
        ? new URL(process.env.BETTER_AUTH_URL).origin
        : null;
  if (
    !expected ||
    (!localOrigin && origin !== expected) ||
    request.headers.get("sec-fetch-site") === "cross-site"
  )
    throw new VoiceError("ORIGIN_FORBIDDEN", 403, "Недопустимый источник запроса.");
}

function previewAllowed(request: Request) {
  return (
    process.env.NODE_ENV === "development" &&
    process.env.ENABLE_VOICE_PREVIEW === "true" &&
    LOOPBACK.has(new URL(request.url).hostname)
  );
}

function signature(payload: string) {
  return createHmac("sha256", workerSecret())
    .update(`voice-preview-v1:${payload}`)
    .digest("base64url");
}

function previewOwner(request: Request): string | null {
  if (!previewAllowed(request)) return null;
  const value = request.headers
    .get("cookie")
    ?.split(";")
    .map((item) => item.trim())
    .find((item) => item.startsWith(`${COOKIE}=`))
    ?.slice(COOKIE.length + 1);
  if (!value || value.length > 256) return null;
  const [id, expiresAt, signed, extra] = value.split(".");
  if (extra || !z.uuid().safeParse(id).success || !expiresAt || !signed) return null;
  const expiry = Number(expiresAt);
  const now = Math.floor(Date.now() / 1000);
  if (!Number.isSafeInteger(expiry) || expiry <= now || expiry > now + PREVIEW_TTL_SECONDS)
    return null;
  const expected = Buffer.from(signature(`${id}.${expiresAt}`));
  const received = Buffer.from(signed);
  return expected.length === received.length && timingSafeEqual(expected, received)
    ? `preview:${id}`
    : null;
}

async function accountOwner(request: Request) {
  const principal = await getCurrentUser(request);
  if (!principal) return null;
  // Anonymous local preview remains separate; authenticated accounts use the
  // same authoritative password/social identity policy as every private API.
  const authorized = await requireUser(request);
  return `account:${authorized.id}`;
}

async function guard(key: string, seconds: number, max: number) {
  const result = await consumeAuthRateLimit(`voice:${key}`, seconds, max);
  if (!result.allowed)
    throw new VoiceError(
      "VOICE_RATE_LIMIT",
      429,
      "Слишком много голосовых запросов. Немного подожди или введи текст.",
      result.retryAfter,
    );
}

// Stream bounds apply even without Content-Length; slow uploads cannot hold a handler indefinitely.
async function boundedBody(request: Request | Response, maxBytes: number, signal?: AbortSignal) {
  if (Number(request.headers.get("content-length") ?? 0) > maxBytes)
    throw new VoiceError(
      "VOICE_PAYLOAD_TOO_LARGE",
      413,
      "Запись слишком большая. Максимум — 5 МБ.",
    );
  const reader = request.body?.getReader();
  if (!reader) return new Uint8Array();
  const limitSignal = AbortSignal.any([...(signal ? [signal] : []), AbortSignal.timeout(15_000)]);
  const cancelReader = () => {
    try {
      void reader.cancel().catch(() => undefined);
    } catch {
      /* Already closed. */
    }
  };
  const aborted = cancelReader;
  limitSignal.addEventListener("abort", aborted, { once: true });
  let length = 0;
  const chunks: Uint8Array[] = [];
  try {
    limitSignal.throwIfAborted();
    while (true) {
      const chunk = await reader.read();
      limitSignal.throwIfAborted();
      if (chunk.done) break;
      length += chunk.value.byteLength;
      if (length > maxBytes) {
        cancelReader();
        throw new VoiceError(
          "VOICE_PAYLOAD_TOO_LARGE",
          413,
          "Запись слишком большая. Максимум — 5 МБ.",
        );
      }
      chunks.push(chunk.value);
    }
  } finally {
    limitSignal.removeEventListener("abort", aborted);
    reader.releaseLock();
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

function errorResponse(error: unknown) {
  if (error instanceof VoiceError)
    return reply(
      { error: { code: error.code, message: error.message } },
      error.status,
      error.retryAfter ? { "Retry-After": String(error.retryAfter) } : undefined,
    );
  if (error instanceof AuthError)
    return reply({ error: { code: "VOICE_AUTH_REQUIRED", message: error.message } }, error.status);
  if (error instanceof Error && ["AbortError", "TimeoutError"].includes(error.name))
    return reply(
      {
        error: {
          code: "VOICE_TIMEOUT",
          message: "Распознавание прервано или заняло слишком долго. Можно ввести текст.",
        },
      },
      504,
    );
  return reply(
    {
      error: {
        code: "VOICE_UNAVAILABLE",
        message: "Сервис распознавания пока недоступен. Попробуй позже или введи текст.",
      },
    },
    503,
  );
}

export async function establishVoiceSession(request: Request) {
  try {
    checkOrigin(request);
    if (!request.headers.get("content-type")?.startsWith("application/json"))
      throw new VoiceError("VOICE_INVALID_REQUEST", 415, "Ожидается JSON.");
    const bytes = await boundedBody(request, 256, request.signal);
    let input: unknown;
    try {
      input = JSON.parse(new TextDecoder().decode(bytes)) as unknown;
    } catch {
      input = null;
    }
    const parsed = sessionSchema.safeParse(input);
    if (!parsed.success)
      throw new VoiceError("VOICE_INVALID_REQUEST", 400, "Некорректный запрос голосового ввода.");
    const owner = await accountOwner(request);
    workerSecret();
    if (owner) {
      await guard(`session:${owner}`, 60, 15);
      return reply({ authorized: true });
    }
    if (!parsed.data.preview || !previewAllowed(request))
      throw new AuthError(401, "Войдите в аккаунт.");
    const previousOwner = previewOwner(request);
    if (previousOwner) {
      await guard(`session:${previousOwner}`, 60, 15);
      return reply({ authorized: true });
    }
    await guard("preview-session-global", 60, 10);
    const payload = `${randomUUID()}.${Math.floor(Date.now() / 1000) + PREVIEW_TTL_SECONDS}`;
    return reply({ authorized: true }, 200, {
      "Set-Cookie": `${COOKIE}=${payload}.${signature(payload)}; Path=/api/voice; Max-Age=${PREVIEW_TTL_SECONDS}; HttpOnly; SameSite=Strict`,
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function transcribeVoice(request: Request) {
  try {
    checkOrigin(request);
    const owner = (await accountOwner(request)) ?? previewOwner(request);
    if (!owner) throw new AuthError(401, "Войдите в аккаунт.");
    const secret = workerSecret();
    const isPreview = owner.startsWith("preview:");
    await guard(owner, 60, isPreview ? 3 : 8);
    await guard(`day:${owner}`, 86400, isPreview ? 30 : 120);
    await guard("global", 60, 60);
    await guard("global-day", 86400, 1200);
    const contentType = request.headers.get("content-type") ?? "";
    if (!contentType.startsWith("multipart/form-data;"))
      throw new VoiceError("VOICE_INVALID_REQUEST", 415, "Ожидается аудиозапись.");
    const bytes = await boundedBody(request, VOICE_MAX_AUDIO_BYTES + 8192, request.signal);
    let form: FormData;
    try {
      form = await new Response(bytes, { headers: { "Content-Type": contentType } }).formData();
    } catch {
      throw new VoiceError("VOICE_INVALID_REQUEST", 400, "Не удалось прочитать запись.");
    }
    const fields = ["audio", "operationId", "companion", "recordingMs"];
    if (
      [...form.keys()].some((key) => !fields.includes(key)) ||
      fields.some((key) => form.getAll(key).length !== 1)
    )
      throw new VoiceError("VOICE_INVALID_REQUEST", 400, "Некорректные параметры записи.");
    const metadata = metadataSchema.safeParse({
      operationId: form.get("operationId"),
      companion: form.get("companion"),
      recordingMs: form.get("recordingMs"),
    });
    const audio = form.get("audio");
    if (!metadata.success || !(audio instanceof File) || !audio.size)
      throw new VoiceError(
        "VOICE_INVALID_REQUEST",
        400,
        "В записи нет аудио или параметры некорректны.",
      );
    if (audio.size > VOICE_MAX_AUDIO_BYTES)
      throw new VoiceError(
        "VOICE_PAYLOAD_TOO_LARGE",
        413,
        "Запись слишком большая. Максимум — 5 МБ.",
      );
    const mediaType = audio.type.split(";", 1)[0].toLowerCase();
    if (!MEDIA_TYPES.has(mediaType))
      throw new VoiceError(
        "VOICE_INVALID_FORMAT",
        415,
        "Браузер записал неподдерживаемый формат. Можно ввести текст.",
      );
    const worker = new URL(process.env.VOICE_WORKER_URL ?? "http://127.0.0.1:3075");
    if (!["http:", "https:"].includes(worker.protocol) || worker.username || worker.password)
      throw new VoiceError("VOICE_UNAVAILABLE", 503, "Сервис распознавания пока недоступен.");
    worker.pathname = "/transcribe";
    worker.search = "";
    worker.hash = "";
    const signal = AbortSignal.any([request.signal, AbortSignal.timeout(95_000)]);
    const result = await fetch(worker, {
      method: "POST",
      cache: "no-store",
      redirect: "error",
      signal,
      headers: {
        Authorization: `Bearer ${secret}`,
        "Content-Type": mediaType
          .replace(/^video\//, "audio/")
          .replace("application/ogg", "audio/ogg"),
        "X-Operation-Id": metadata.data.operationId,
      },
      body: await audio.arrayBuffer(),
    });
    const responseBytes = await boundedBody(result, 16_384, signal);
    let response: unknown;
    try {
      response = JSON.parse(new TextDecoder().decode(responseBytes)) as unknown;
    } catch {
      response = null;
    }
    if (!result.ok) {
      // Only worker-owned codes/messages cross this boundary; upstream bodies never reach the browser.
      const safeErrors: Record<string, string> = {
        VOICE_NO_SPEECH:
          "Речь не найдена в записи. Попробуй говорить ближе к микрофону или введи текст.",
        VOICE_INVALID_AUDIO: "Не удалось прочитать аудио. Попробуй записать снова или введи текст.",
        VOICE_AUDIO_TOO_LONG: "Запись длиннее минуты. Запиши сообщение покороче.",
        VOICE_UNSUPPORTED_AUDIO: "Браузер записал неподдерживаемый формат. Можно ввести текст.",
        VOICE_BUSY: "Сервис распознавания занят. Немного подожди или введи текст.",
        VOICE_TEXT_TOO_LONG: "Расшифровка слишком длинная. Попробуй записать короче.",
      };
      const workerError =
        response && typeof response === "object" && "error" in response ? response.error : null;
      const code =
        workerError &&
        typeof workerError === "object" &&
        "code" in workerError &&
        typeof workerError.code === "string"
          ? workerError.code
          : "";
      if (Object.hasOwn(safeErrors, code))
        throw new VoiceError(
          code,
          [400, 413, 415, 422, 429, 503].includes(result.status) ? result.status : 503,
          safeErrors[code],
        );
      throw new VoiceError(
        "VOICE_UNAVAILABLE",
        503,
        "Не удалось распознать речь. Попробуй позже или введи текст.",
      );
    }
    const transcript = transcriptSchema.safeParse(response);
    if (!transcript.success || transcript.data.operationId !== metadata.data.operationId)
      throw new VoiceError(
        "VOICE_INVALID_RESPONSE",
        502,
        "Сервис вернул некорректную расшифровку. Можно ввести текст.",
      );
    return reply(transcript.data);
  } catch (error) {
    return errorResponse(error);
  }
}
