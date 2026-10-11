import { requireAssistantOwner } from "../_response";
import { confirmAssistantAction } from "@/server/assistant/service";
import { privateDomainResponse } from "@/server/domain/errors";
import { privateJson, readJson } from "@/server/domain/http";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const principal = await requireAssistantOwner(request);
    return privateJson(await confirmAssistantAction(principal.id, await readJson(request, 2_048)));
  } catch (error) {
    return privateDomainResponse(error);
  }
}
