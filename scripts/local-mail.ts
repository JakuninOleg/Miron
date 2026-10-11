import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { spawn } from "node:child_process";
if (process.env.NODE_ENV === "production") throw new Error("Local mail is development only");
const executable = resolve(".local/mailpit/mailpit.exe");
if (!existsSync(executable))
  throw new Error("Install official Mailpit in .local/mailpit (see docs/auth-setup.md)");
const child = spawn(
  executable,
  [
    "--listen",
    "127.0.0.1:8025",
    "--smtp",
    "127.0.0.1:1025",
    "--allowed-hosts",
    "localhost,127.0.0.1",
    "--database",
    resolve(".local/mailpit/messages.db"),
    "--disable-version-check",
    "--quiet",
  ],
  { detached: true, stdio: "ignore", windowsHide: true },
);
child.unref();
console.log("Local emails: http://localhost:8025");
