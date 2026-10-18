import { privateJson } from "@/server/domain/http";
import { getWorkoutRecovery } from "@/server/domain/workout-recovery";
import { builderErrorResponse, requireBuilderOwner } from "@/app/api/workout-builder/_response";
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const owner = await requireBuilderOwner(request);
    return privateJson(await getWorkoutRecovery(owner.id, (await params).id));
  } catch (cause) {
    return builderErrorResponse(cause);
  }
}
