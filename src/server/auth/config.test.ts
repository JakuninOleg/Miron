import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { AuthConfigurationError, publicAuthConfig, readAuthConfig } from "./config";

const local = {
  NODE_ENV: "development",
  BETTER_AUTH_SECRET: "unit-test-only-secret-with-at-least-32-characters",
  DATABASE_URL: "postgresql://test:test@127.0.0.1:5432/test",
};
const production = {
  ...local,
  NODE_ENV: "production",
  BETTER_AUTH_URL: "https://miron.example",
  SMTP_HOST: "smtp.example",
  SMTP_FROM: "MIRON <hello@miron.example>",
  SMTP_USER: "test-user",
  SMTP_PASSWORD: "test-only-mail-password",
};

describe("authentication configuration", () => {
  it("requires a secret and persistent database", () => {
    expect(() => readAuthConfig({ ...local, BETTER_AUTH_SECRET: "weak" })).toThrow(
      AuthConfigurationError,
    );
    expect(() => readAuthConfig({ ...local, DATABASE_URL: undefined })).toThrow(
      AuthConfigurationError,
    );
    expect(() =>
      readAuthConfig({
        ...local,
        BETTER_AUTH_SECRET: "REPLACE_WITH_AT_LEAST_32_RANDOM_CHARACTERS",
      }),
    ).toThrow(AuthConfigurationError);
  });
  it("accepts local Mailpit and disables unconfigured providers", () => {
    const config = readAuthConfig(local);
    expect(config.smtp.host).toBe("127.0.0.1");
    expect(config.smtp.port).toBe(1025);
    expect(config.yandex).toBeUndefined();
    expect(config.vk).toBeUndefined();
  });
  it("fails closed for incomplete provider credentials", () => {
    expect(() => readAuthConfig({ ...local, YANDEX_CLIENT_ID: "test" })).toThrow(
      AuthConfigurationError,
    );
    expect(() => readAuthConfig({ ...local, VK_CLIENT_SECRET: "test" })).toThrow(
      AuthConfigurationError,
    );
  });
  it("requires an explicit HTTPS origin and real SMTP settings in production", () => {
    expect(() => readAuthConfig({ ...production, BETTER_AUTH_URL: undefined })).toThrow(
      AuthConfigurationError,
    );
    expect(() =>
      readAuthConfig({ ...production, BETTER_AUTH_URL: "http://miron.example" }),
    ).toThrow(AuthConfigurationError);
    expect(() => readAuthConfig({ ...production, SMTP_PASSWORD: undefined })).toThrow(
      AuthConfigurationError,
    );
    expect(readAuthConfig(production).smtp.requireTLS).toBe(true);
  });
  it("rejects base URL paths and credentials", () => {
    for (const url of [
      "https://user:password@miron.example",
      "https://miron.example/auth",
      "https://miron.example/?secret=test",
    ]) {
      expect(() => readAuthConfig({ ...production, BETTER_AUTH_URL: url })).toThrow(
        AuthConfigurationError,
      );
    }
  });
  it("exposes only provider availability, without credential values", () => {
    const config = publicAuthConfig({
      ...local,
      VK_CLIENT_ID: "sensitive-id",
      VK_CLIENT_SECRET: "sensitive-secret",
    });
    expect(config.providers).toEqual({ yandex: false, vk: true });
    expect(JSON.stringify(config)).not.toContain("sensitive");
    expect(Object.keys(config).sort()).toEqual([
      "emailPassword",
      "providers",
      "requireEmailVerification",
    ]);
  });
  it("supports social-only production without SMTP while preserving password verification policy", () => {
    const env = {
      ...local,
      NODE_ENV: "production",
      BETTER_AUTH_URL: "https://miron.example",
      AUTH_EMAIL_PASSWORD_ENABLED: "false",
      YANDEX_CLIENT_ID: "test-client",
      YANDEX_CLIENT_SECRET: "test-secret",
    };
    expect(readAuthConfig(env).emailPassword).toBe(false);
    expect(publicAuthConfig(env)).toEqual({
      emailPassword: false,
      requireEmailVerification: true,
      providers: { yandex: true, vk: false },
    });
    expect(() => readAuthConfig({ ...env, AUTH_EMAIL_PASSWORD_ENABLED: "true" })).toThrow(
      AuthConfigurationError,
    );
    expect(() => readAuthConfig({ ...local, AUTH_EMAIL_PASSWORD_ENABLED: "off" })).toThrow(
      AuthConfigurationError,
    );
  });
});
