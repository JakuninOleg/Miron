import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const root = new URL("../docs/reference/", import.meta.url);
const files = new Map([
  ["/", ["miron-database.html", "text/html; charset=utf-8"]],
  ["/miron-database.html", ["miron-database.html", "text/html; charset=utf-8"]],
  ["/exercises.csv", ["exercises.csv", "text/csv; charset=utf-8"]],
  ["/catalog-semantic-qa.csv", ["catalog-semantic-qa.csv", "text/csv; charset=utf-8"]],
  ["/miron-erd.svg", ["miron-erd.svg", "image/svg+xml"]],
  ["/miron-erd.png", ["miron-erd.png", "image/png"]],
]);
const server = createServer(async (request, response) => {
  if (request.method !== "GET" && request.method !== "HEAD") {
    response.writeHead(405, { Allow: "GET, HEAD" }).end();
    return;
  }
  const pathname = new URL(request.url ?? "/", "http://127.0.0.1:3060").pathname;
  const file = files.get(pathname);
  if (!file) {
    response.writeHead(404).end();
    return;
  }
  try {
    const content = await readFile(fileURLToPath(new URL(file[0], root)));
    response.writeHead(200, {
      "Content-Type": file[1],
      "Content-Length": content.length,
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
      "Content-Security-Policy":
        "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src 'self' blob:; connect-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
    });
    response.end(request.method === "HEAD" ? undefined : content);
  } catch {
    response.writeHead(500).end("Reference file unavailable");
  }
});
server.listen(3060, "127.0.0.1", () => {
  console.log("MIRON ERD and exercise table: http://localhost:3060");
});
