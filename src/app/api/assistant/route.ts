import { getAssistantHistory, sendAssistantMessage } from "@/server/assistant/service";
import { privateDomainResponse } from "@/server/domain/errors";
import { privateJson, readJson } from "@/server/domain/http";
import { requireAssistantOwner } from "./_response";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const principal = await requireAssistantOwner(request);
    return privateJson(await getAssistantHistory(principal.id));
  } catch (error) {
    return privateDomainResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const principal = await requireAssistantOwner(request);
    return privateJson(await sendAssistantMessage(principal.id, await readJson(request, 8_192)));
  } catch (error) {
    return privateDomainResponse(error);
  }
}
