/** Draft data may be used on the explicitly designated beta, never marked published. */
export function canSeedDraftCatalog(env: Record<string, string | undefined>) {
  const url = new URL(env.DATABASE_URL ?? "");
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  const beta = env.APP_RELEASE_CHANNEL === "beta" && env.SEED_BETA_CATALOG === "true";
  if (env.NODE_ENV === "production" && !beta)
    throw new Error("Draft catalog seed is disabled outside the explicit beta");
  if (!local && !beta) throw new Error("Draft catalog seed requires local DB or explicit beta");
}
