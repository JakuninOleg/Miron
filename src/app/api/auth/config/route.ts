import { publicAuthConfig } from "@/server/auth/config";

export const dynamic = "force-dynamic";
export function GET() {
  return Response.json(publicAuthConfig(), { headers: { "Cache-Control": "no-store" } });
}
