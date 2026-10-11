import { isIP } from "node:net";
import { createHmac } from "node:crypto";

/** A provider email is contact data; the provider/subject pair authenticates its owner. */
export function ownsSocialIdentity(
  userId: string,
  identity: { userId: string; providerId: string; accountId: string },
) {
  return (
    identity.userId === userId &&
    (identity.providerId === "yandex" || identity.providerId === "vk") &&
    /^[1-9]\d{0,63}$/.test(identity.accountId)
  );
}

export function hasTrustedOrigin(request: Request, allowed: readonly string[]) {
  const raw = request.headers.get("origin");
  if (!raw) return false;
  try {
    const origin = new URL(raw);
    return origin.origin === raw && allowed.includes(origin.origin);
  } catch {
    return false;
  }
}

export function clientBucket(request: Request, trustProxy: boolean, secret: string) {
  // Forwarding headers are untrusted unless the deployment strips/replaces them.
  const forwarded = trustProxy
    ? request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    : undefined;
  const address = forwarded && isIP(forwarded) ? forwarded : "unattributed";
  return createHmac("sha256", secret).update(address).digest("hex");
}

export function authRateRule(path: string) {
  if (
    /^\/(sign-in\/email|sign-up\/email|request-password-reset|send-verification-email|reset-password)$/.test(
      path,
    )
  ) {
    return { windowSeconds: 60, max: 8, bucket: path };
  }
  const known = [
    "/get-session",
    "/sign-out",
    "/verify-email",
    "/sign-in/social",
    "/change-password",
    "/list-sessions",
    "/revoke-session",
    "/revoke-other-sessions",
    "/revoke-sessions",
  ];
  // Reset bearer tokens and arbitrary attacker-supplied paths never enter storage keys.
  const bucket = path.startsWith("/callback/")
    ? "/callback"
    : path.startsWith("/reset-password/")
      ? "/reset-password-link"
      : known.includes(path)
        ? path
        : "/other";
  return { windowSeconds: 60, max: 100, bucket };
}
