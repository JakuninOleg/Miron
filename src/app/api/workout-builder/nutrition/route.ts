import { privateJson, readJson } from "@/server/domain/http";
import { applyNutritionCommand, getNutrition } from "@/server/domain/nutrition";
import { builderErrorResponse, requireBuilderOwner } from "../_response";
export async function GET(request: Request) {
  try {
    const owner = await requireBuilderOwner(request);
    return privateJson(
      await getNutrition(owner.id, new URL(request.url).searchParams.get("date") ?? ""),
    );
  } catch (cause) {
    return builderErrorResponse(cause);
  }
}
export async function POST(request: Request) {
  try {
    const owner = await requireBuilderOwner(request);
    return privateJson(await applyNutritionCommand(owner.id, await readJson(request)));
  } catch (cause) {
    return builderErrorResponse(cause);
  }
}
