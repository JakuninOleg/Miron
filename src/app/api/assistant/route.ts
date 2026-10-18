import { getAssistantHistory, sendAssistantMessage } from "@/server/assistant/service";
import { privateDomainResponse } from "@/server/domain/errors";
import { privateJson, readJson } from "@/server/domain/http";
import { requireAssistantOwner } from "./_response";
import { mutateChatHistory } from "@/server/assistant/history";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const principal = await requireAssistantOwner(request);
    return privateJson(
      await getAssistantHistory(
        principal.id,
        Object.fromEntries(new URL(request.url).searchParams),
      ),
    );
  } catch (error) {
    return privateDomainResponse(error);
  }
}

export async function DELETE(request: Request) {
  try {
    const principal = await requireAssistantOwner(request);
    return privateJson(await mutateChatHistory(principal.id, await readJson(request, 2048)));
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
