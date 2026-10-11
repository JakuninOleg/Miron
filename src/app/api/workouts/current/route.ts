import { requireUser } from "@/server/auth";
import { privateDomainResponse } from "@/server/domain/errors";
import { privateJson } from "@/server/domain/http";
import { getWorkout, listWorkouts } from "@/server/domain/workouts";
export async function GET(request: Request) {
  try {
    const principal = await requireUser(request);
    const rows = await listWorkouts(principal.id);
    const active = rows.find((w) => w.status === "ready" || w.status === "active");
    return privateJson({ workout: active ? await getWorkout(principal.id, active.id) : null });
  } catch (error) {
    return privateDomainResponse(error);
  }
}
