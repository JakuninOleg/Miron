import { getAuth } from "@/server/auth";
import { readAuthConfig } from "@/server/auth/config";
import { hasTrustedOrigin, clientBucket, authRateRule } from "@/server/auth/policy";
import { consumeAuthRateLimit } from "@/server/auth/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function error(status: number, code: string, message: string, extra: Record<string, string> = {}) {
  return Response.json(
    { code, message },
    { status, headers: { "Cache-Control": "no-store", ...extra } },
  );
}

async function handler(request: Request) {
  try {
    const config = readAuthConfig();
    const path = new URL(request.url).pathname.replace(/^\/api\/auth/, "");
    if (request.method === "POST" && !hasTrustedOrigin(request, config.trustedOrigins)) {
      return error(403, "UNTRUSTED_ORIGIN", "Недопустимый источник запроса.");
    }
    if (request.method === "POST") {
      if (!request.headers.get("content-type")?.startsWith("application/json")) {
        return error(415, "UNSUPPORTED_MEDIA_TYPE", "Ожидается JSON.");
      }
      const contentLength = Number(request.headers.get("content-length") || 0);
      if (contentLength > 16_384) return error(413, "BODY_TOO_LARGE", "Запрос слишком большой.");
      // Bound streaming bodies too; a forged/absent Content-Length cannot bypass this.
      const reader = request.body?.getReader();
      const chunks: Uint8Array[] = [];
      let size = 0;
      if (reader) {
        while (true) {
          const chunk = await reader.read();
          if (chunk.done) break;
          size += chunk.value.byteLength;
          if (size > 16_384) {
            await reader.cancel();
            return error(413, "BODY_TOO_LARGE", "Запрос слишком большой.");
          }
          chunks.push(chunk.value);
        }
      }
      const body = new Uint8Array(size);
      let offset = 0;
      for (const chunk of chunks) {
        body.set(chunk, offset);
        offset += chunk.byteLength;
      }
      request = new Request(request, { body: body.buffer });
    }
    const rule = authRateRule(path);
    const limit = await consumeAuthRateLimit(
      `${clientBucket(request, config.trustProxy, config.secret)}:${rule.bucket}`,
      rule.windowSeconds,
      rule.max,
    );
    if (!limit.allowed)
      return error(429, "RATE_LIMITED", "Слишком много попыток. Повторите через минуту.", {
        "Retry-After": String(limit.retryAfter),
      });
    const response = await getAuth().handler(request);
    response.headers.set("Cache-Control", "no-store");
    return response;
  } catch {
    // Mail/DB/configuration failures do not create a fallback or expose secrets.
    return error(503, "AUTH_UNAVAILABLE", "Вход временно недоступен. Попробуйте позже.");
  }
}

export const GET = handler;
export const POST = handler;
