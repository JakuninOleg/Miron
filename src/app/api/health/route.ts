import { sql } from "drizzle-orm";
import { getDb } from "@/server/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    await getDb().execute(sql`select 1`);
    return Response.json(
      { status: "ok", version: "0.1.0" },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    // Only stable error identifiers enter server logs; never a URI, query or credential.
    const cause = error instanceof Error && error.cause ? error.cause : error;
    const code = cause && typeof cause === "object" && "code" in cause &&
      typeof cause.code === "string" && /^[A-Z0-9_]{1,40}$/.test(cause.code)
      ? cause.code : "UNKNOWN";
    console.error(`[health] Database check failed (${code}).`);
    return Response.json(
      { status: "unavailable" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
