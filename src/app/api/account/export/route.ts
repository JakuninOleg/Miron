import { privateJson } from "@/server/domain/http";
import { exportAccountData } from "@/server/domain/account-export";
import { consumeAuthRateLimit } from "@/server/auth/rate-limit";
import { DomainError } from "@/server/domain/errors";
import { builderErrorResponse, requireBuilderOwner } from "@/app/api/workout-builder/_response";
export async function GET(request: Request) {
  try {
    const owner = await requireBuilderOwner(request);
    const rate = await consumeAuthRateLimit(`account-export:${owner.id}`, 300, 3);
    if (!rate.allowed)
      throw new DomainError(
        "EXPORT_RATE_LIMIT",
        429,
        "Архив уже запрашивался несколько раз. Повтори через пять минут.",
      );
    return privateJson(await exportAccountData(owner.id));
  } catch (cause) {
    return builderErrorResponse(cause);
  }
}
