import { requireUser } from "@/server/auth";
import { DomainError } from "@/server/domain/errors";

export async function requireAssistantOwner(request: Request) {
  const principal = await requireUser(request);
  if (request.headers.get("x-miron-owner") !== principal.id)
    throw new DomainError("OWNER_CHANGED", 409, "Аккаунт изменился. Открой чат заново.");
  return principal;
}
