import { privateJson } from "@/server/domain/http";
import { getPlannerState } from "@/server/domain/workout-planner";
import { builderErrorResponse, requireBuilderOwner } from "@/app/api/workout-builder/_response";

export async function GET(request: Request) {
  try {
    const principal = await requireBuilderOwner(request);
    return privateJson(await getPlannerState(principal.id));
  } catch (error) {
    return builderErrorResponse(error);
  }
}
