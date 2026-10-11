import { requireUser } from "@/server/auth";
import { privateDomainResponse } from "@/server/domain/errors";
import { privateJson, readJson } from "@/server/domain/http";
import { ensureAccount } from "@/server/domain/profile";
import { completeOnboarding } from "@/server/domain/onboarding";

export async function POST(request: Request) {
  try {
    const principal = await requireUser(request);
    const owner = request.headers.get("x-miron-owner");
    if (owner !== principal.id)
      return privateJson(
        {
          error: {
            code: "OWNER_MISMATCH",
            message: "Аккаунт изменился. Открой знакомство заново.",
          },
        },
        409,
      );
    const input = await readJson(request, 4096);
    await ensureAccount(principal.id);
    return privateJson(await completeOnboarding(principal.id, input));
  } catch (error) {
    return privateDomainResponse(error);
  }
}
