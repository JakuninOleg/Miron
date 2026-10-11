import { DomainError } from "@/server/domain/errors";
import { privateJson } from "@/server/domain/http";
import { getBuilderCatalog } from "@/server/domain/workout-builder";
import { builderErrorResponse, requireBuilderOwner } from "../_response";

export async function GET(request: Request) {
  try {
    const principal = await requireBuilderOwner(request);
    if (request.url.length > 2048)
      throw new DomainError("INVALID_INPUT", 400, "Слишком длинный запрос поиска.");
    const query = Object.fromEntries(new URL(request.url).searchParams);
    return privateJson(await getBuilderCatalog(principal.id, query));
  } catch (error) {
    return builderErrorResponse(error);
  }
}
