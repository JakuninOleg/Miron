import { z } from "zod";
import { requireUser } from "@/server/auth";
import { domainResponse } from "@/server/domain/errors";
import { privateJson } from "@/server/domain/http";
import { getWorkout } from "@/server/domain/workouts";
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const principal = await requireUser(request);
    const { id } = await context.params;
    z.string().uuid().parse(id);
    return privateJson(await getWorkout(principal.id, id));
  } catch (error) {
    return domainResponse(error);
  }
}
