import { describe, expect, it } from "vitest";
import { authRateRule, clientBucket, hasTrustedOrigin, ownsSocialIdentity } from "./policy";

describe("authentication request policy", () => {
  const allowed = ["https://miron.example"];
  it("accepts exact configured origins and rejects spoofed/missing origins", () => {
    const request = (origin?: string) =>
      new Request("https://miron.example/api/auth/sign-in/email", {
        headers: origin ? { origin } : {},
      });
    expect(hasTrustedOrigin(request("https://miron.example"), allowed)).toBe(true);
    for (const origin of [
      undefined,
      "null",
      "https://miron.example.attacker.test",
      "https://miron.example/",
      "http://miron.example",
    ]) {
      expect(hasTrustedOrigin(request(origin), allowed)).toBe(false);
    }
  });
  it("ignores spoofed forwarding headers unless the trusted proxy is enabled", () => {
    const first = new Request("https://miron.example", {
      headers: { "x-forwarded-for": "192.0.2.1" },
    });
    const second = new Request("https://miron.example", {
      headers: { "x-forwarded-for": "192.0.2.2" },
    });
    expect(clientBucket(first, false, "test-secret")).toBe(
      clientBucket(second, false, "test-secret"),
    );
    expect(clientBucket(first, true, "test-secret")).not.toBe(
      clientBucket(second, true, "test-secret"),
    );
    expect(clientBucket(first, true, "test-secret")).not.toContain("192.0.2.1");
  });
  it("does not store reset bearer tokens or arbitrary paths in rate-limit keys", () => {
    expect(authRateRule("/reset-password/secret-token").bucket).toBe("/reset-password-link");
    expect(authRateRule("/attacker/arbitrary").bucket).toBe("/other");
    expect(authRateRule("/attacker/another").bucket).toBe("/other");
    expect(authRateRule("/sign-in/email").max).toBe(8);
  });
  it("authorizes only an owner's supported provider identity with a stable subject", () => {
    const identity = { userId: "alice", providerId: "yandex", accountId: "1000034426" };
    expect(ownsSocialIdentity("alice", identity)).toBe(true);
    expect(ownsSocialIdentity("alice", { ...identity, providerId: "vk" })).toBe(true);
    expect(ownsSocialIdentity("bob", identity)).toBe(false);
    expect(ownsSocialIdentity("alice", { ...identity, providerId: "credential" })).toBe(false);
    for (const accountId of ["", " ", "alice@example.test", "1000034426 ", "0"]) {
      expect(ownsSocialIdentity("alice", { ...identity, accountId })).toBe(false);
    }
  });
});
