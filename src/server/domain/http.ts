import { DomainError } from "./errors";
export async function readJson(request: Request, maxBytes = 32_768): Promise<unknown> {
  const origin = request.headers.get("origin");
  const expected = new URL(process.env.BETTER_AUTH_URL ?? request.url).origin;
  if ((origin && origin !== expected) || request.headers.get("sec-fetch-site") === "cross-site")
    throw new DomainError("ORIGIN_FORBIDDEN", 403, "Недопустимый источник запроса.");
  if (!request.headers.get("content-type")?.includes("application/json"))
    throw new DomainError("INVALID_CONTENT_TYPE", 415, "Ожидается JSON.");
  if (Number(request.headers.get("content-length") ?? 0) > maxBytes)
    throw new DomainError("PAYLOAD_TOO_LARGE", 413, "Слишком большой запрос.");
  const reader = request.body?.getReader();
  const decoder = new TextDecoder();
  let text = "";
  let bytes = 0;
  if (reader)
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > maxBytes) {
        await reader.cancel();
        throw new DomainError("PAYLOAD_TOO_LARGE", 413, "Слишком большой запрос.");
      }
      text += decoder.decode(chunk.value, { stream: true });
    }
  text += decoder.decode();
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new DomainError("INVALID_JSON", 400, "Некорректный JSON.");
  }
}
export function privateJson(value: unknown, status = 200) {
  return Response.json(value, { status, headers: { "Cache-Control": "no-store" } });
}
