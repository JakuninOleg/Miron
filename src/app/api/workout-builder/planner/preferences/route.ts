import { privateJson, readJson } from "@/server/domain/http";
import { savePlannerPreferences } from "@/server/domain/workout-planner";
import { builderErrorResponse, requireBuilderOwner } from "@/app/api/workout-builder/_response";

export async function PUT(request: Request) {
  try {
    const principal = await requireBuilderOwner(request);
    return privateJson(await savePlannerPreferences(principal.id, await readJson(request)));
  } catch (error) {
    return builderErrorResponse(error);
  }
}
