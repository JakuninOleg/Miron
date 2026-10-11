import { requireUser } from "@/server/auth";
import { DomainError, domainResponse } from "@/server/domain/errors";

export async function requireBuilderOwner(request: Request) {
  const principal = await requireUser(request);
  if (request.headers.get("x-miron-owner") !== principal.id)
    throw new DomainError("OWNER_CHANGED", 409, "Аккаунт изменился. Открой конструктор заново.");
  return principal;
}

export function builderErrorResponse(error: unknown): Response {
  const response = domainResponse(error);
  response.headers.set("Cache-Control", "no-store");
  return response;
}
