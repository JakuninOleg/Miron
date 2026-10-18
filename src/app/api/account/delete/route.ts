import { z } from "zod";
import { getAuth } from "@/server/auth";
import { eq } from "drizzle-orm";
import { getDb } from "@/server/db";
import { user } from "@/server/db/schema";
import { DomainError } from "@/server/domain/errors";
import { readJson } from "@/server/domain/http";
import { builderErrorResponse, requireBuilderOwner } from "@/app/api/workout-builder/_response";
export async function POST(request: Request) {
  try {
    const owner = await requireBuilderOwner(request);
    const input = z
      .strictObject({
        confirmation: z.literal("УДАЛИТЬ"),
        password: z.string().min(1).max(128).optional(),
      })
      .parse(await readJson(request));
    const response = await getAuth().api.deleteUser({
      headers: request.headers,
      body: input.password ? { password: input.password } : {},
      asResponse: true,
    });
    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as { code?: string } | null;
      if (body?.code === "SESSION_EXPIRED" || body?.code === "SESSION_NOT_FRESH")
        throw new DomainError(
          "REAUTH_REQUIRED",
          409,
          "Для удаления нужен свежий вход. Выйди и войди снова, затем повтори действие в течение 10 минут.",
        );
      throw new DomainError(
        "ACCOUNT_DELETE_FAILED",
        response.status,
        "Не удалось удалить аккаунт. Проверь пароль или выполни вход заново.",
      );
    }
    const [remaining] = await getDb()
      .select({ id: user.id })
      .from(user)
      .where(eq(user.id, owner.id));
    if (remaining)
      throw new DomainError(
        "ACCOUNT_DELETE_PENDING",
        409,
        "Аккаунт ещё не удалён. Заверши подтверждение удаления и повтори действие.",
      );
    response.headers.set("Cache-Control", "no-store");
    return response;
  } catch (cause) {
    return builderErrorResponse(cause);
  }
}
