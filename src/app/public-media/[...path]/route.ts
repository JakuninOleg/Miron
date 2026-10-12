import { readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { mediaOrigin, publicMediaKey } from "@/server/media/public-path";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ path: string[] }> };

async function serve(request: Request, context: Context) {
  const key = publicMediaKey((await context.params).path.join("/"));
  if (!key) return new Response(null, { status: 404 });
  const type = key.endsWith(".svg") ? "image/svg+xml" : key.endsWith(".png") ? "image/png" : key.endsWith(".jpg") ? "image/jpeg" : "image/webp";
  const headers = { "Content-Type": type, "Cache-Control": "public, max-age=86400", "X-Content-Type-Options": "nosniff" };
  const origin = mediaOrigin(process.env.MIRON_MEDIA_ORIGIN);
  if (origin) {
    try {
      // This request never forwards account cookies, auth headers, query or identifiers to S3.
      const response = await fetch(new URL(key, origin), {
        method: request.method === "HEAD" ? "HEAD" : "GET",
        headers: { Accept: type }, redirect: "error", cache: "no-store",
        signal: AbortSignal.timeout(5000),
      });
      const length = Number(response.headers.get("content-length"));
      if (response.ok && length > 0 && length <= 5_000_000) {
        if (request.method === "HEAD") return new Response(null, { headers: { ...headers, "X-MIRON-Media": "s3" } });
        const reader = response.body?.getReader();
        if (reader) {
          const chunks: Uint8Array[] = [];
          let size = 0;
          while (true) {
            const part = await reader.read();
            if (part.done) break;
            size += part.value.byteLength;
            if (size > 5_000_000) { await reader.cancel(); throw new Error("Media size limit"); }
            chunks.push(part.value);
          }
          return new Response(Buffer.concat(chunks), { headers: { ...headers, "X-MIRON-Media": "s3" } });
        }
      } else await response.body?.cancel();
    } catch { /* Bundled public art remains available during an S3 outage. */ }
  }
  try {
    const path = join(process.cwd(), "public", key);
    if ((await stat(path)).size > 5_000_000) return new Response(null, { status: 404 });
    return new Response(request.method === "HEAD" ? null : await readFile(path), { headers: { ...headers, "X-MIRON-Media": "bundled" } });
  } catch { return new Response(null, { status: 404 }); }
}
export const GET = serve;
export const HEAD = serve;
