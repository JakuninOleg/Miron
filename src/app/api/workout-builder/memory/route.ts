import { privateJson, readJson } from "@/server/domain/http";
import {
  listCommunicationMemory,
  saveCommunicationMemory,
} from "@/server/domain/communication-memory";
import { builderErrorResponse, requireBuilderOwner } from "../_response";
export async function GET(request: Request) {
  try {
    const owner = await requireBuilderOwner(request);
    return privateJson({ memories: await listCommunicationMemory(owner.id) });
  } catch (cause) {
    return builderErrorResponse(cause);
  }
}
export async function POST(request: Request) {
  try {
    const owner = await requireBuilderOwner(request);
    return privateJson(await saveCommunicationMemory(owner.id, await readJson(request)));
  } catch (cause) {
    return builderErrorResponse(cause);
  }
}
