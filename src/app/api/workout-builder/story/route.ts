import { privateJson, readJson } from "@/server/domain/http";
import { listJourneyReads, markJourneyRead } from "@/server/domain/journey-read";
import { builderErrorResponse, requireBuilderOwner } from "../_response";
export async function GET(request: Request) {
  try {
    const owner = await requireBuilderOwner(request);
    return privateJson({ readIds: await listJourneyReads(owner.id) });
  } catch (cause) {
    return builderErrorResponse(cause);
  }
}
export async function POST(request: Request) {
  try {
    const owner = await requireBuilderOwner(request);
    return privateJson(await markJourneyRead(owner.id, await readJson(request)));
  } catch (cause) {
    return builderErrorResponse(cause);
  }
}
