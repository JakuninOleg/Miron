import { readFile, writeFile } from "node:fs/promises";
import { format, resolveConfig } from "prettier";

const canvasPath = "docs/reference/miron-database.canvas.tsx";
const reference = JSON.parse(await readFile("docs/reference/db-reference.json", "utf8"));
const source = await readFile(canvasPath, "utf8");
const start = source.indexOf("const data: DatabaseReference = ");
const end = source.indexOf("\n\nconst tableInfo:", start);
if (start < 0 || end < 0) throw new Error("Canvas snapshot boundaries were not found");
const updated = `${source.slice(0, start)}const data: DatabaseReference = ${JSON.stringify(reference, null, 2)};${source.slice(end)}`;
await writeFile(
  canvasPath,
  await format(updated, { ...(await resolveConfig(canvasPath)), filepath: canvasPath }),
  "utf8",
);
console.log(
  JSON.stringify({
    canvas: canvasPath,
    tables: reference.stats.tables,
    variants: reference.stats.variants,
    generatedAt: reference.generatedAt,
  }),
);
