import { privateJson, readJson } from "@/server/domain/http";
import { startPlannerWorkout } from "@/server/domain/planner-start";
import { builderErrorResponse, requireBuilderOwner } from "@/app/api/workout-builder/_response";

export async function POST(request: Request) {
  try {
    const principal = await requireBuilderOwner(request);
    return privateJson(await startPlannerWorkout(principal.id, await readJson(request)));
  } catch (error) {
    return builderErrorResponse(error);
  }
}
