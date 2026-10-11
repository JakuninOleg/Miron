import "server-only";
import { genericOAuth } from "better-auth/plugins";
import type { OAuth2Tokens } from "better-auth/oauth2";
import { z } from "zod";
import type { AuthConfig } from "./config";

const subject = z.string().regex(/^[1-9]\d{0,63}$/);
const email = z.string().max(254).email().nullish();
const name = z.string().max(120);
const yandexProfile = z.object({
  id: subject,
  client_id: z.string().max(256),
  default_email: email,
  display_name: name.optional(),
});
const vkProfile = z.object({
  user: z.object({
    user_id: z.union([subject, z.number().int().positive().safe().transform(String)]),
    first_name: name.default(""),
    last_name: name.default(""),
    email,
    birthday: z.string().max(16).default(""),
  }),
});

async function fetchProfile(url: string, init: RequestInit): Promise<unknown> {
  try {
    const response = await fetch(url, {
      ...init,
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(8_000),
    });
    if (!response.ok) return null;
    return await response.json();
  } catch {
    // Provider failure must fail the callback; no token or response is logged.
    return null;
  }
}

export function vkOAuth(config: AuthConfig) {
  if (!config.vk) return {};
  const credentials = config.vk;
  return {
    vk: {
      ...credentials,
      disableDefaultScope: true,
      scope: ["email"],
      requireEmailVerification: false,
      // Keep Better Auth's VK authorization/code exchange: it includes PKCE and
      // the callback device_id. Validate only the provider's user-info response.
      getUserInfo: async (tokens: OAuth2Tokens) => {
        if (!tokens.accessToken) return null;
        const profile = vkProfile.safeParse(
          await fetchProfile("https://id.vk.com/oauth2/user_info", {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({
              access_token: tokens.accessToken,
              client_id: credentials.clientId,
            }).toString(),
          }),
        );
        if (!profile.success) return null;
        const principal = profile.data.user;
        return {
          user: {
            email: principal.email ?? null,
            name: `${principal.first_name} ${principal.last_name}`.trim() || "Пользователь MIRON",
            emailVerified: false,
          },
          data: { user: { ...principal, email: principal.email ?? undefined } },
        };
      },
    },
  };
}

export function yandexOAuth(config: AuthConfig) {
  if (!config.yandex) return [];
  const credentials = config.yandex;
  return [
    genericOAuth({
      config: [
        {
          providerId: "yandex",
          ...credentials,
          authorizationUrl: "https://oauth.yandex.ru/authorize",
          tokenUrl: "https://oauth.yandex.ru/token",
          scopes: ["login:info", "login:email"],
          pkce: true,
          requireEmailVerification: false,
          authentication: "post",
          getUserInfo: async (tokens) => {
            if (!tokens.accessToken) return null;
            const profile = yandexProfile.safeParse(
              await fetchProfile("https://login.yandex.ru/info?format=json", {
                headers: { Authorization: `OAuth ${tokens.accessToken}` },
              }),
            );
            if (!profile.success || profile.data.client_id !== credentials.clientId) return null;
            const data = profile.data;
            return {
              id: data.id,
              // Missing email reaches Better Auth's explicit email_not_found error.
              email: data.default_email ?? null,
              name: data.display_name?.trim() || "Пользователь MIRON",
              // Yandex does not return an email_verified claim. Provider ID and
              // subject authenticate the account without claiming verified mail.
              emailVerified: false,
            };
          },
        },
      ],
    }),
  ];
}
