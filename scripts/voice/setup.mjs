import { existsSync, mkdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

const root = resolve(".local/voice");
const python = resolve(
  root,
  "venv",
  process.platform === "win32" ? "Scripts/python.exe" : "bin/python",
);
function run(command, args) {
  const result = spawnSync(command, args, { stdio: "inherit" });
  if (result.error || result.status !== 0) process.exit(result.status || 1);
}
mkdirSync(root, { recursive: true });
if (!existsSync(python))
  run(process.env.VOICE_SETUP_PYTHON || (process.platform === "win32" ? "python" : "python3"), [
    "-m",
    "venv",
    resolve(root, "venv"),
  ]);
run(python, [
  "-m",
  "pip",
  "install",
  "--disable-pip-version-check",
  "-r",
  "scripts/voice/requirements.txt",
]);
run(python, [
  "-c",
  "from faster_whisper.utils import download_model; import sys; download_model('small', cache_dir=sys.argv[1]); print('Whisper small downloaded.')",
  resolve(root, "models"),
]);
console.log("Модель и зависимости готовы. Настройте .env.local и выполните npm run voice:start.");
