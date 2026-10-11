import { privateJson, readJson } from "@/server/domain/http";
import { deleteCustomWorkout, getCustomWorkout } from "@/server/domain/workout-builder";
import { builderErrorResponse, requireBuilderOwner } from "../../_response";

type Context = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: Context) {
  try {
    const principal = await requireBuilderOwner(request);
    const { id } = await context.params;
    return privateJson(await getCustomWorkout(principal.id, id));
  } catch (error) {
    return builderErrorResponse(error);
  }
}
export async function DELETE(request: Request, context: Context) {
  try {
    const principal = await requireBuilderOwner(request);
    const { id } = await context.params;
    return privateJson(await deleteCustomWorkout(principal.id, id, await readJson(request)));
  } catch (error) {
    return builderErrorResponse(error);
  }
}
