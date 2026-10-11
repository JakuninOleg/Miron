import { requireUser } from "@/server/auth";
import { domainResponse } from "@/server/domain/errors";
import { privateJson, readJson } from "@/server/domain/http";
import { createWorkout, listWorkouts } from "@/server/domain/workouts";
export async function GET(request: Request) {
  try {
    const principal = await requireUser(request);
    return privateJson({ workouts: await listWorkouts(principal.id) });
  } catch (error) {
    return domainResponse(error);
  }
}
export async function POST(request: Request) {
  try {
    const principal = await requireUser(request);
    return privateJson(await createWorkout(principal.id, await readJson(request)), 201);
  } catch (error) {
    return domainResponse(error);
  }
}
