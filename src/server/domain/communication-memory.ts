import { createHash } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import type { CommunicationMemory } from "../../shared/communication-memory";
import type { CompanionId } from "../../shared/contracts";
import { getDb } from "../db";
import { builderCommands, communicationMemory, user } from "../db/schema";
import { DomainError } from "./errors";
export const memoryInput = z.strictObject({
  operationId: z.uuid(),
  scope: z.enum(["shared", "max", "lika"]),
  expectedRevision: z.number().int().min(0).max(1_000_000),
  preferences: z.strictObject({
    address: z.enum(["informal", "formal"]).optional(),
    tone: z.enum(["friendly", "calm", "energetic"]).optional(),
    detail: z.enum(["short", "detailed"]).optional(),
    emoji: z.enum(["none", "some"]).optional(),
  }),
});
export async function listCommunicationMemory(owner: string): Promise<CommunicationMemory[]> {
  const rows = await getDb()
    .select()
    .from(communicationMemory)
    .where(eq(communicationMemory.userId, owner));
  return (["shared", "max", "lika"] as const).map((scope) => {
    const row = rows.find((item) => item.scope === scope);
    return { scope, revision: row?.revision ?? 0, preferences: row?.preferences ?? {} };
  });
}
export async function readCommunicationMemory(owner: string, companion: CompanionId) {
  const rows = await getDb()
    .select()
    .from(communicationMemory)
    .where(
      and(
        eq(communicationMemory.userId, owner),
        inArray(communicationMemory.scope, ["shared", companion]),
      ),
    );
  return {
    ...rows.find((row) => row.scope === "shared")?.preferences,
    ...rows.find((row) => row.scope === companion)?.preferences,
  };
}
export async function saveCommunicationMemory(
  owner: string,
  raw: unknown,
): Promise<Pick<CommunicationMemory, "scope" | "revision">> {
  const input = memoryInput.parse(raw);
  const hash = createHash("sha256")
    .update(JSON.stringify({ action: "communication_memory", input }))
    .digest("hex");
  return getDb().transaction(async (tx) => {
    const [principal] = await tx
      .select({ status: user.status })
      .from(user)
      .where(eq(user.id, owner))
      .for("update");
    if (principal?.status !== "active")
      throw new DomainError("ACCOUNT_UNAVAILABLE", 403, "Аккаунт недоступен.");
    const [replay] = await tx
      .select()
      .from(builderCommands)
      .where(
        and(eq(builderCommands.userId, owner), eq(builderCommands.operationId, input.operationId)),
      );
    if (replay) {
      if (replay.payloadHash !== hash)
        throw new DomainError("OPERATION_REUSED", 409, "Запрос уже использован.");
      const receipt = replay.result as Pick<CommunicationMemory, "scope" | "revision">;
      const [head] = await tx
        .select({ revision: communicationMemory.revision })
        .from(communicationMemory)
        .where(
          and(eq(communicationMemory.userId, owner), eq(communicationMemory.scope, input.scope)),
        );
      if (head?.revision !== receipt.revision)
        throw new DomainError(
          "REVISION_CONFLICT",
          409,
          "После этого сохранения настройки уже изменились. Обнови страницу.",
        );
      return receipt;
    }
    const [current] = await tx
      .select()
      .from(communicationMemory)
      .where(
        and(eq(communicationMemory.userId, owner), eq(communicationMemory.scope, input.scope)),
      );
    if ((current?.revision ?? 0) !== input.expectedRevision)
      throw new DomainError("REVISION_CONFLICT", 409, "Настройки изменились. Обнови страницу.");
    const result = {
      scope: input.scope,
      revision: input.expectedRevision + 1,
      preferences: input.preferences,
    };
    await tx
      .insert(communicationMemory)
      .values({ userId: owner, ...result })
      .onConflictDoUpdate({
        target: [communicationMemory.userId, communicationMemory.scope],
        set: { revision: result.revision, preferences: result.preferences, updatedAt: new Date() },
      });
    // Do not retain a copy of erased preferences in the replay ledger.
    await tx.insert(builderCommands).values({
      userId: owner,
      operationId: input.operationId,
      payloadHash: hash,
      result: { scope: result.scope, revision: result.revision },
    });
    return { scope: result.scope, revision: result.revision };
  });
}
