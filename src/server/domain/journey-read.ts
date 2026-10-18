import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "../db";
import { journeyReads, user } from "../db/schema";
import { journeyState } from "../../shared/journey-story";
import { getProgress } from "./profile";
import { DomainError } from "./errors";
export async function listJourneyReads(owner: string) {
  return (
    await getDb()
      .select({ id: journeyReads.chapterId })
      .from(journeyReads)
      .where(eq(journeyReads.userId, owner))
  ).map((row) => row.id);
}
export async function markJourneyRead(owner: string, raw: unknown) {
  const input = z
    .strictObject({
      chapterId: z.enum(["meeting", "first-route", "own-trail", "further-together"]),
    })
    .parse(raw);
  return getDb().transaction(async (tx) => {
    const [principal] = await tx
      .select({ status: user.status })
      .from(user)
      .where(eq(user.id, owner))
      .for("update");
    if (principal?.status !== "active")
      throw new DomainError("ACCOUNT_UNAVAILABLE", 403, "Аккаунт недоступен.");
    const progress = await getProgress(owner, tx);
    if (
      !journeyState(progress.journey?.activityDays).available.some(
        (chapter) => chapter.id === input.chapterId,
      )
    )
      throw new DomainError("CHAPTER_UNAVAILABLE", 409, "Эта глава пока не открыта.");
    await tx
      .insert(journeyReads)
      .values({ userId: owner, chapterId: input.chapterId })
      .onConflictDoNothing();
    return {
      readIds: (
        await tx
          .select({ id: journeyReads.chapterId })
          .from(journeyReads)
          .where(eq(journeyReads.userId, owner))
      ).map((row) => row.id),
    };
  });
}
