import { z } from "zod";
import { requireUser } from "@/server/auth";
import { DomainError, privateDomainResponse } from "@/server/domain/errors";
import { privateJson, readJson } from "@/server/domain/http";
import { applyWorkoutCommand } from "@/server/domain/workouts";
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const principal = await requireUser(request);
    const owner = request.headers.get("x-miron-owner");
    if (owner && owner !== principal.id)
      throw new DomainError(
        "OWNER_CHANGED",
        409,
        "Аккаунт изменился. Войди в исходный аккаунт журнала.",
      );
    const { id } = await context.params;
    z.string().uuid().parse(id);
    return privateJson(await applyWorkoutCommand(principal.id, id, await readJson(request)));
  } catch (error) {
    return privateDomainResponse(error);
  }
}
