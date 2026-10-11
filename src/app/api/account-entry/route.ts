import { requireUser } from "@/server/auth";
import { privateDomainResponse } from "@/server/domain/errors";
import { privateJson } from "@/server/domain/http";
import { ensureAccount, getProfile } from "@/server/domain/profile";
export async function GET(request: Request) {
  try {
    const principal = await requireUser(request);
    await ensureAccount(principal.id);
    const account = await getProfile(principal.id);
    const builder = new URL(request.url).searchParams.get("next") === "/workout-builder";
    return privateJson({
      destination: account.profile.onboardingCompleted
        ? builder
          ? "/workout-builder"
          : "/dashboard"
        : `/onboarding${builder ? "?next=/workout-builder" : ""}`,
    });
  } catch (error) {
    return privateDomainResponse(error);
  }
}
