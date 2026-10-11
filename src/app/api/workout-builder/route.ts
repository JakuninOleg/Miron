import { requireUser } from "@/server/auth";
import { privateJson } from "@/server/domain/http";
import { getBuilderBootstrap } from "@/server/domain/workout-builder";
import { builderErrorResponse } from "./_response";

export async function GET(request: Request) {
  try {
    const principal = await requireUser(request);
    return privateJson(await getBuilderBootstrap(principal.id));
  } catch (error) {
    return builderErrorResponse(error);
  }
}
