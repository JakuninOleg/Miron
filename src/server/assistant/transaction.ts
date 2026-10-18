import { eq } from "drizzle-orm";
import { getDb } from "../db";
import { user } from "../db/schema";
import { DomainError } from "../domain/errors";

type Database = ReturnType<typeof getDb>;
export type AssistantTransaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

/** Serializes admission, completion and deletion for one account, never provider I/O. */
export async function assistantOwnerTransaction<T>(
  ownerId: string,
  work: (tx: AssistantTransaction) => Promise<T>,
) {
  for (let attempt = 0; ; attempt++) {
    try {
      return await getDb().transaction(async (tx) => {
        const [owner] = await tx
          .select({ status: user.status })
          .from(user)
          .where(eq(user.id, ownerId))
          .for("update");
        if (owner?.status !== "active")
          throw new DomainError("ACCOUNT_UNAVAILABLE", 403, "Аккаунт недоступен.");
        return work(tx);
      });
    } catch (error) {
      const cause = error instanceof Error && "cause" in error ? error.cause : error;
      const code = typeof cause === "object" && cause && "code" in cause ? cause.code : null;
      if (attempt >= 2 || (code !== "40001" && code !== "40P01")) throw error;
    }
  }
}
