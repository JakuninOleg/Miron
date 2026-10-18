import { privateJson } from "@/server/domain/http";
import { getWorkoutAlternatives } from "@/server/domain/workout-alternatives";
import { builderErrorResponse, requireBuilderOwner } from "@/app/api/workout-builder/_response";
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const owner = await requireBuilderOwner(request);
    return privateJson(
      await getWorkoutAlternatives(
        owner.id,
        (await params).id,
        new URL(request.url).searchParams.get("exerciseId") ?? "",
      ),
    );
  } catch (cause) {
    return builderErrorResponse(cause);
  }
}
