import { privateJson } from "@/server/domain/http";
import { readProductAccess } from "@/server/domain/access";
import { builderErrorResponse, requireBuilderOwner } from "@/app/api/workout-builder/_response";
export async function GET(request: Request) {
  try {
    const owner = await requireBuilderOwner(request);
    return privateJson(await readProductAccess(owner.id));
  } catch (cause) {
    return builderErrorResponse(cause);
  }
}
