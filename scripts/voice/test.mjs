import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
const python = resolve(
  ".local/voice/venv",
  process.platform === "win32" ? "Scripts/python.exe" : "bin/python",
);
const result = spawnSync(
  python,
  ["-m", "unittest", "discover", "-s", "scripts/voice", "-p", "test_*.py", "-v"],
  { stdio: "inherit" },
);
if (result.error) console.error("Сначала установите распознаватель: npm run voice:setup.");
process.exitCode = result.status ?? 1;
