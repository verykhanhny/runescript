// Dependency-free dev server: serves web/ and scripts/, and proxies price lookups
// (the official Grand Exchange API does not send CORS headers). Prices come through the
// daily disk cache in scripts/lib/ge-cache.js.
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { cachedFetch } from "./scripts/lib/ge-cache.js";
import { OFFICIAL_API_URL, USER_AGENT } from "./scripts/lib/profit.js";

const root = fileURLToPath(new URL(".", import.meta.url));
const PORT = Number(process.env.PORT) || 3000;
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json" };

async function proxyPrice(id, res) {
  try {
    const upstream = await cachedFetch(OFFICIAL_API_URL(id), {
      headers: { "User-Agent": USER_AGENT },
      signal: AbortSignal.timeout(20_000),
    });
    res.writeHead(200, { "Content-Type": "application/json" }).end(await upstream.text());
  } catch (error) {
    res.writeHead(502).end(`Could not get price: ${error.message}`);
  }
}

async function serveStatic(pathname, res) {
  const rel = normalize(pathname === "/" ? "/index.html" : pathname);
  const file = rel.startsWith("/scripts/") ? join(root, rel) : join(root, "web", rel);
  if (!file.startsWith(root) || rel.includes("..")) return res.writeHead(403).end();
  try {
    const data = await readFile(file);
    res.writeHead(200, { "Content-Type": TYPES[extname(file)] ?? "application/octet-stream" }).end(data);
  } catch {
    res.writeHead(404).end("Not found");
  }
}

createServer(async (req, res) => {
  try {
    const { pathname } = new URL(req.url, "http://localhost");
    const match = pathname.match(/^\/api\/price\/(\d+)$/);
    if (match) await proxyPrice(match[1], res);
    else await serveStatic(pathname, res);
  } catch (error) {
    res.writeHead(500).end(String(error.message));
  }
}).listen(PORT, () => console.log(`http://localhost:${PORT}`));
