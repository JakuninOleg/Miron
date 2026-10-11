import "server-only";

type Environment = Record<string, string | undefined>;

export class AuthConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AuthConfigurationError";
  }
}

function credentialPair(env: Environment, prefix: "YANDEX" | "VK") {
  const clientId = env[`${prefix}_CLIENT_ID`]?.trim();
  const clientSecret = env[`${prefix}_CLIENT_SECRET`]?.trim();
  if (Boolean(clientId) !== Boolean(clientSecret)) {
    throw new AuthConfigurationError(
      `${prefix}: set both CLIENT_ID and CLIENT_SECRET, or neither.`,
    );
  }
  return clientId && clientSecret ? { clientId, clientSecret } : undefined;
}

function emailPasswordEnabled(env: Environment) {
  const value = env.AUTH_EMAIL_PASSWORD_ENABLED?.trim();
  if (value !== undefined && value !== "true" && value !== "false") {
    throw new AuthConfigurationError("AUTH_EMAIL_PASSWORD_ENABLED must be true or false.");
  }
  return value !== "false";
}

export function readAuthConfig(env: Environment = process.env) {
  const production = env.NODE_ENV === "production";
  const emailPassword = emailPasswordEnabled(env);
  const secret = env.BETTER_AUTH_SECRET?.trim();
  if (!secret || secret.length < 32 || /^(REPLACE_WITH|CHANGE_ME|YOUR_SECRET)/i.test(secret)) {
    throw new AuthConfigurationError(
      "BETTER_AUTH_SECRET must contain at least 32 random characters.",
    );
  }
  const configuredURL = env.BETTER_AUTH_URL?.trim();
  if (production && !configuredURL) {
    throw new AuthConfigurationError("BETTER_AUTH_URL is required in production.");
  }
  const base = new URL(configuredURL || "http://localhost:3000");
  if (
    !["http:", "https:"].includes(base.protocol) ||
    base.username ||
    base.password ||
    base.search ||
    base.hash ||
    base.pathname !== "/"
  ) {
    throw new AuthConfigurationError(
      "BETTER_AUTH_URL must be an HTTP(S) origin without path or credentials.",
    );
  }
  if (production && base.protocol !== "https:") {
    throw new AuthConfigurationError("Production BETTER_AUTH_URL must use HTTPS.");
  }
  if (
    !production &&
    base.protocol === "http:" &&
    !["localhost", "127.0.0.1", "[::1]"].includes(base.hostname)
  ) {
    throw new AuthConfigurationError("HTTP auth is allowed only on a loopback development host.");
  }
  if (!env.DATABASE_URL) {
    throw new AuthConfigurationError("DATABASE_URL is required for authentication.");
  }
  const requireProductionMail = production && emailPassword;
  const smtpHost = env.SMTP_HOST?.trim() || "127.0.0.1";
  const smtpFrom = env.SMTP_FROM?.trim() || "MIRON <hello@miron.local>";
  if (
    requireProductionMail &&
    (!env.SMTP_HOST?.trim() || !env.SMTP_FROM?.trim() || !env.SMTP_USER || !env.SMTP_PASSWORD)
  ) {
    throw new AuthConfigurationError(
      "Production mail requires SMTP_HOST, SMTP_FROM, SMTP_USER and SMTP_PASSWORD.",
    );
  }
  if (emailPassword && Boolean(env.SMTP_USER) !== Boolean(env.SMTP_PASSWORD)) {
    throw new AuthConfigurationError("Set both SMTP_USER and SMTP_PASSWORD, or neither.");
  }
  const smtpPort = Number(env.SMTP_PORT || (production ? "587" : "1025"));
  if (emailPassword && (!Number.isInteger(smtpPort) || smtpPort < 1 || smtpPort > 65535)) {
    throw new AuthConfigurationError("SMTP_PORT must be a valid TCP port.");
  }
  return {
    production,
    emailPassword,
    secret,
    baseURL: base.origin,
    trustedOrigins: [base.origin],
    trustProxy: env.AUTH_TRUST_PROXY === "true",
    yandex: credentialPair(env, "YANDEX"),
    vk: credentialPair(env, "VK"),
    smtp: {
      host: smtpHost,
      port: smtpPort,
      secure: env.SMTP_SECURE === "true" || smtpPort === 465,
      requireTLS: production,
      from: smtpFrom,
      auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASSWORD! } : undefined,
    },
  };
}

export type AuthConfig = ReturnType<typeof readAuthConfig>;

/** Only booleans may cross the server/client boundary. */
export function publicAuthConfig(env: Environment = process.env) {
  return {
    emailPassword: emailPasswordEnabled(env),
    requireEmailVerification: true,
    providers: {
      yandex: Boolean(env.YANDEX_CLIENT_ID?.trim() && env.YANDEX_CLIENT_SECRET?.trim()),
      vk: Boolean(env.VK_CLIENT_ID?.trim() && env.VK_CLIENT_SECRET?.trim()),
    },
  };
}
