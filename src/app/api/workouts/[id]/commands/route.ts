import { z } from "zod";
import { requireUser } from "@/server/auth";
import { domainResponse } from "@/server/domain/errors";
import { privateJson, readJson } from "@/server/domain/http";
import { applyWorkoutCommand } from "@/server/domain/workouts";
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const principal = await requireUser(request);
    const { id } = await context.params;
    z.string().uuid().parse(id);
    return privateJson(await applyWorkoutCommand(principal.id, id, await readJson(request)));
  } catch (error) {
    return domainResponse(error);
  }
}
