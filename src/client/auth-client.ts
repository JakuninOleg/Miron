"use client";

import { createAuthClient } from "better-auth/react";

// Same-origin cookie authentication. No secrets or provider tokens reach this module.
export const authClient = createAuthClient();

export function signInWithProvider(provider: "yandex" | "vk", next?: string | null) {
  const nextQuery = next === "/workout-builder" ? "?next=/workout-builder" : "";
  // Better Auth 1.7.7 registers Generic OAuth as a standard social provider.
  // Both callbacks finish the server-owned account/onboarding continuation.
  return authClient.signIn.social({
    provider,
    callbackURL: `/auth/continue${nextQuery}`,
    errorCallbackURL: `/sign-in${nextQuery}`,
  });
}
