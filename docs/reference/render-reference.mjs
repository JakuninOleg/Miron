import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { format, resolveConfig } from "prettier";

const out = dirname(fileURLToPath(import.meta.url));
const style = await resolveConfig(resolve(out, "miron-database.html"));
const snapshot = JSON.parse(readFileSync(resolve(out, "db-reference.json"), "utf8"));
writeFileSync(
  resolve(out, "db-reference.json"),
  await format(JSON.stringify(snapshot), { ...style, parser: "json" }),
);
const template = readFileSync(resolve(out, "reference-template.html"), "utf8");
const safeData = JSON.stringify(snapshot).replaceAll("<", "\\u003c");
const html = template.replace("/* INLINE_DATABASE_SNAPSHOT */ null", () => safeData);
writeFileSync(
  resolve(out, "miron-database.html"),
  await format(html, { ...style, parser: "html" }),
);
console.log("Created docs/reference/miron-database.html from the PostgreSQL snapshot.");
