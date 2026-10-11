import { requireUser } from "@/server/auth";
import { privateDomainResponse } from "@/server/domain/errors";
import { privateJson, readJson } from "@/server/domain/http";
import { ensureAccount, getProfile, updateProfile } from "@/server/domain/profile";
export async function GET(request: Request) {
  try {
    const principal = await requireUser(request);
    await ensureAccount(principal.id);
    return privateJson(await getProfile(principal.id));
  } catch (error) {
    return privateDomainResponse(error);
  }
}
export async function PUT(request: Request) {
  try {
    const principal = await requireUser(request);
    await ensureAccount(principal.id);
    return privateJson(await updateProfile(principal.id, await readJson(request)));
  } catch (error) {
    return privateDomainResponse(error);
  }
}
