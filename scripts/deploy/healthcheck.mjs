try {
  const port = process.env.PORT || "3000";
  const response = await fetch(`http://127.0.0.1:${port}/api/health`, {
    signal: AbortSignal.timeout(6000),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
} catch {
  console.error("MIRON healthcheck failed: HTTP application or database unavailable.");
  process.exitCode = 1;
}
