import { describe, expect, it } from "vitest";
import { canSeedDraftCatalog } from "./seed-policy";

describe("draft catalog deployment boundary", () => {
  it("rejects production and remote seeding without explicit beta flags", () => {
    expect(() =>
      canSeedDraftCatalog({
        DATABASE_URL: "postgresql://example.org/miron",
        NODE_ENV: "production",
      }),
    ).toThrow();
    expect(() =>
      canSeedDraftCatalog({
        DATABASE_URL: "postgresql://example.org/miron",
        APP_RELEASE_CHANNEL: "beta",
      }),
    ).toThrow();
    expect(() =>
      canSeedDraftCatalog({ DATABASE_URL: "postgresql://localhost/miron", NODE_ENV: "production" }),
    ).toThrow();
  });
  it("allows the explicitly identified beta or local development", () => {
    expect(() =>
      canSeedDraftCatalog({ DATABASE_URL: "postgresql://localhost/miron" }),
    ).not.toThrow();
    expect(() =>
      canSeedDraftCatalog({
        DATABASE_URL: "postgresql://example.org/miron",
        NODE_ENV: "production",
        APP_RELEASE_CHANNEL: "beta",
        SEED_BETA_CATALOG: "true",
      }),
    ).not.toThrow();
  });
});
