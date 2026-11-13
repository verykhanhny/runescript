// Cloudflare Worker `runescript`: static assets come from dist/ (see wrangler.toml); this handles
// /api/price/:id, replacing the proxy in server.js. The official Grand Exchange API sends no CORS
// headers, so the browser calls this instead. Responses are kept in Cloudflare's edge cache for the
// same 6h the local disk cache uses.
import { OFFICIAL_API_URL, USER_AGENT } from "./scripts/lib/profit.js";

const TTL_SECONDS = 6 * 60 * 60;
const isValidBody = (text) => {
  try { return JSON.parse(text)?.item?.current?.price != null; } catch { return false; }
};

async function getPrice(id, request, ctx) {
  const cache = caches.default;
  const cacheKey = new Request(new URL(`/api/price/${id}`, request.url).href);
  const hit = await cache.match(cacheKey);
  if (hit) return hit;

  try {
    const upstream = await fetch(OFFICIAL_API_URL(id), {
      headers: { "User-Agent": USER_AGENT },
      signal: AbortSignal.timeout(20_000),
    });
    if (!upstream.ok) throw new Error(`HTTP ${upstream.status}`);
    const body = await upstream.text();
    if (!isValidBody(body)) throw new Error("response was not a price payload (rate limited?)");
    const response = new Response(body, {
      headers: { "Content-Type": "application/json", "Cache-Control": `public, max-age=${TTL_SECONDS}` },
    });
    ctx.waitUntil(cache.put(cacheKey, response.clone()));
    return response;
  } catch (error) {
    return new Response(`Could not get price: ${error.message}`, { status: 502 });
  }
}

export default {
  async fetch(request, env, ctx) {
    const { pathname } = new URL(request.url);
    const match = pathname.match(/^\/api\/price\/([^/]+)$/);
    if (match) {
      if (request.method !== "GET") return new Response("Method not allowed", { status: 405 });
      if (!/^\d+$/.test(match[1])) return new Response("Bad item id", { status: 400 });
      return getPrice(match[1], request, ctx);
    }
    return env.ASSETS.fetch(request);
  },
};
