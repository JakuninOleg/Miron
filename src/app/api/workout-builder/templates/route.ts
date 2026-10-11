import { privateJson, readJson } from "@/server/domain/http";
import { listCustomWorkouts, saveCustomWorkout } from "@/server/domain/workout-builder";
import { builderErrorResponse, requireBuilderOwner } from "../_response";

export async function GET(request: Request) {
  try {
    const principal = await requireBuilderOwner(request);
    return privateJson({ templates: await listCustomWorkouts(principal.id) });
  } catch (error) {
    return builderErrorResponse(error);
  }
}
export async function POST(request: Request) {
  try {
    const principal = await requireBuilderOwner(request);
    return privateJson(await saveCustomWorkout(principal.id, await readJson(request)), 201);
  } catch (error) {
    return builderErrorResponse(error);
  }
}
