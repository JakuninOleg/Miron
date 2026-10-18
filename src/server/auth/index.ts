import "server-only";
import { MAX_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH } from "@/shared/auth-policy";
import { betterAuth } from "better-auth";
import { APIError } from "better-auth/api";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { and, eq, inArray } from "drizzle-orm";
import { headers } from "next/headers";
import { getDb } from "@/server/db";
import { user, session, account, verification, rateLimit } from "@/server/db/schema";
import { initializeAccount } from "@/server/domain/profile";
import { readAuthConfig } from "./config";
import { createAuthMailer } from "./mail";
import { vkOAuth, yandexOAuth } from "./oauth";
import { ownsSocialIdentity } from "./policy";

function createAuth() {
  const config = readAuthConfig();
  // No SMTP transport is constructed in social-only mode.
  const sendEmail = config.emailPassword ? createAuthMailer(config) : undefined;
  return betterAuth({
    appName: "MIRON",
    baseURL: config.baseURL,
    basePath: "/api/auth",
    secret: config.secret,
    logger: {
      level: "error",
      log: () => {
        console.error("[auth] Authentication failed. Check database, SMTP and provider health.");
      },
    },
    trustedOrigins: config.trustedOrigins,
    disabledPaths: [
      "/delete-user",
      "/delete-user/callback",
      ...(config.emailPassword
        ? []
        : [
            "/sign-in/email",
            "/sign-up/email",
            "/request-password-reset",
            "/reset-password",
            "/send-verification-email",
            "/verify-email",
            "/change-password",
            "/set-password",
            "/verify-password",
          ]),
    ],
    user: { deleteUser: { enabled: true } },
    database: drizzleAdapter(getDb(), {
      provider: "pg",
      transaction: true,
      schema: { user, session, account, verification, rateLimit },
    }),
    emailAndPassword: {
      enabled: config.emailPassword,
      requireEmailVerification: true,
      autoSignIn: false,
      minPasswordLength: MIN_PASSWORD_LENGTH,
      maxPasswordLength: MAX_PASSWORD_LENGTH,
      resetPasswordTokenExpiresIn: 30 * 60,
      revokeSessionsOnPasswordReset: true,
      sendResetPassword: sendEmail
        ? async ({ user: principal, url }) => sendEmail(principal.email, url, "reset")
        : undefined,
    },
    emailVerification: sendEmail
      ? {
          // Omit sendOnSignUp: password signup follows requireEmailVerification,
          // while OAuth signup follows its own provider policy (no mail required).
          sendOnSignIn: true,
          autoSignInAfterVerification: false,
          expiresIn: 60 * 60,
          sendVerificationEmail: async ({ user: principal, url }) =>
            sendEmail(principal.email, url, "verification"),
        }
      : undefined,
    session: {
      expiresIn: 60 * 60 * 24 * 7,
      updateAge: 60 * 60 * 24,
      freshAge: 60 * 10,
      cookieCache: { enabled: false },
    },
    account: {
      encryptOAuthTokens: true,
      storeStateStrategy: "database",
      accountLinking: { enabled: false },
    },
    verification: { storeIdentifier: "hashed" },
    advanced: {
      database: { generateId: "uuid" },
      useSecureCookies: config.production || config.baseURL.startsWith("https:"),
      cookiePrefix: "miron",
      defaultCookieAttributes: {
        httpOnly: true,
        sameSite: "lax",
        secure: config.production || config.baseURL.startsWith("https:"),
        path: "/",
      },
      ipAddress: {
        ipAddressHeaders: config.trustProxy ? ["x-forwarded-for"] : [],
        disableIpTracking: !config.trustProxy,
      },
    },
    rateLimit: {
      enabled: true,
      storage: "database",
      window: 60,
      max: 100,
      customRules: {
        "/sign-in/email": { window: 60, max: 8 },
        "/sign-up/email": { window: 60, max: 8 },
        "/request-password-reset": { window: 60, max: 8 },
        "/send-verification-email": { window: 60, max: 8 },
        "/reset-password": { window: 60, max: 8 },
      },
    },
    socialProviders: vkOAuth(config),
    plugins: yandexOAuth(config),
    databaseHooks: {
      user: {
        create: {
          after: async (principal) => {
            await initializeAccount(principal.id);
          },
        },
      },
      session: {
        create: {
          before: async (newSession) => {
            const [principal] = await getDb()
              .select({ status: user.status })
              .from(user)
              .where(eq(user.id, newSession.userId))
              .limit(1);
            if (!principal || principal.status !== "active")
              throw new APIError("FORBIDDEN", { message: "Account is unavailable." });
            return { data: newSession };
          },
        },
      },
    },
  });
}

type MironAuth = ReturnType<typeof createAuth>;
let auth: MironAuth | undefined;
export function getAuth(): MironAuth {
  auth ??= createAuth();
  return auth;
}

export class AuthError extends Error {
  readonly status: 401 | 403;
  constructor(status: 401 | 403, message: string) {
    super(message);
    this.name = "AuthError";
    this.status = status;
  }
}

export type CurrentUser = { id: string; email: string; name: string; emailVerified: boolean };
export async function getCurrentUser(request?: Request | Headers): Promise<CurrentUser | null> {
  const requestHeaders =
    request instanceof Request ? request.headers : (request ?? (await headers()));
  const current = await getAuth().api.getSession({ headers: requestHeaders });
  if (!current) return null;
  // Re-read the authoritative row; disabling/deleting an account takes effect immediately.
  const [principal] = await getDb()
    .select({
      id: user.id,
      email: user.email,
      name: user.name,
      emailVerified: user.emailVerified,
      status: user.status,
    })
    .from(user)
    .where(eq(user.id, current.user.id))
    .limit(1);
  if (!principal || principal.status !== "active") throw new AuthError(403, "Аккаунт недоступен.");
  return {
    id: principal.id,
    email: principal.email,
    name: principal.name,
    emailVerified: principal.emailVerified,
  };
}

export async function requireUser(request?: Request | Headers): Promise<CurrentUser> {
  const principal = await getCurrentUser(request);
  if (!principal) throw new AuthError(401, "Войдите в аккаунт.");
  if (!principal.emailVerified) {
    const identities = await getDb()
      .select({
        userId: account.userId,
        providerId: account.providerId,
        accountId: account.accountId,
      })
      .from(account)
      .where(and(eq(account.userId, principal.id), inArray(account.providerId, ["yandex", "vk"])))
      .limit(2);
    if (!identities.some((identity) => ownsSocialIdentity(principal.id, identity))) {
      throw new AuthError(403, "Подтвердите адрес почты.");
    }
  }
  return principal;
}
