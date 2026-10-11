import { establishVoiceSession } from "@/server/voice/gateway";
export const runtime = "nodejs";
export async function POST(request: Request) {
  return establishVoiceSession(request);
}
