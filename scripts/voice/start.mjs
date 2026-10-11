import { existsSync } from "node:fs";
import { spawn, spawnSync } from "node:child_process";
import { resolve } from "node:path";

if (existsSync(".env.local")) process.loadEnvFile(".env.local");
const python = resolve(
  ".local/voice/venv",
  process.platform === "win32" ? "Scripts/python.exe" : "bin/python",
);
if (!existsSync(python)) {
  console.error("Распознаватель не установлен. Сначала выполните npm run voice:setup.");
  process.exit(1);
}
if (!process.env.VOICE_WORKER_SECRET || process.env.VOICE_WORKER_SECRET.length < 32) {
  console.error("Заполните VOICE_WORKER_SECRET в .env.local (минимум 32 символа).");
  process.exit(1);
}
const worker = spawn(python, ["scripts/voice/service.py"], {
  stdio: "inherit",
  env: {
    ...process.env,
    VOICE_LOCAL_MODEL: process.env.VOICE_LOCAL_MODEL || "small",
    VOICE_LOCAL_MODEL_CACHE: resolve(process.env.VOICE_LOCAL_MODEL_CACHE || ".local/voice/models"),
    VOICE_LOCAL_MODEL_LABEL: process.env.VOICE_LOCAL_MODEL_LABEL || "whisper-small-int8",
    HF_HUB_OFFLINE: "1",
  },
});
worker.on("error", () => {
  console.error("Не удалось запустить сервер распознавания.");
  process.exitCode = 1;
});
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => {
    if (!worker.pid || worker.exitCode !== null) return;
    if (process.platform === "win32") {
      // Node's kill() terminates only the parent on Windows; include its native workers.
      spawnSync("taskkill", ["/PID", String(worker.pid), "/T", "/F"], {
        stdio: "ignore",
        windowsHide: true,
      });
    } else worker.kill(signal);
  });
worker.on("exit", (code) => {
  process.exitCode = code ?? 1;
});
