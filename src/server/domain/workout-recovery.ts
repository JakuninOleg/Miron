import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "../db";
import { user } from "../db/schema";
import { DomainError } from "./errors";
import { getWorkout } from "./workouts";
import { getProgress } from "./profile";
export async function getWorkoutRecovery(owner: string, id: string) {
  z.uuid().parse(id);
  return getDb().transaction(async (tx) => {
    const [principal] = await tx
      .select({ status: user.status })
      .from(user)
      .where(eq(user.id, owner))
      .for("share");
    if (principal?.status !== "active")
      throw new DomainError("ACCOUNT_UNAVAILABLE", 403, "Аккаунт недоступен.");
    return { workout: await getWorkout(owner, id, tx), progress: await getProgress(owner, tx) };
  });
}
