// Dependency-free dev server that runs worker.js in Node, so local behaviour matches production.
// The PRICES KV namespace is a file (scripts/lib/ge-cache.js) and ASSETS serves web/ and scripts/
// straight from disk, so edits show up on reload without a build.
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import worker from "./worker.js";
import { priceStore } from "./scripts/lib/ge-cache.js";

const root = fileURLToPath(new URL(".", import.meta.url));
const PORT = Number(process.env.PORT) || 3000;
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json" };

const ASSETS = {
  async fetch(request) {
    const { pathname } = new URL(request.url);
    const rel = normalize(decodeURIComponent(pathname === "/" ? "/index.html" : pathname));
    const file = rel.startsWith("/scripts/") ? join(root, rel) : join(root, "web", rel);
    if (!file.startsWith(root) || rel.includes("..")) return new Response(null, { status: 403 });
    try {
      const data = await readFile(file);
      return new Response(data, { headers: { "Content-Type": TYPES[extname(file)] ?? "application/octet-stream" } });
    } catch {
      return new Response("Not found", { status: 404 });
    }
  },
};

const env = { PRICES: priceStore, ASSETS };
const ctx = { waitUntil() {}, passThroughOnException() {} }; // KV writes finish on their own

createServer(async (req, res) => {
  try {
    const request = new Request(new URL(req.url, `http://localhost:${PORT}`), { method: req.method });
    const response = await worker.fetch(request, env, ctx);
    res.writeHead(response.status, Object.fromEntries(response.headers));
    res.end(Buffer.from(await response.arrayBuffer()));
  } catch (error) {
    res.writeHead(500).end(String(error.message));
  }
}).listen(PORT, () => console.log(`http://localhost:${PORT}`));
