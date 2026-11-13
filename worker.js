// Cloudflare Worker `runescript`: static assets come from dist/ (see wrangler.toml); this handles
// /api/price/:id and /api/prices?ids=1,2,3, replacing the proxy in server.js. The official Grand Exchange API sends no CORS
// headers, so the browser calls this instead. Responses are kept in Cloudflare's edge cache for the
// same 6h the local disk cache uses.
import { OFFICIAL_API_URL, USER_AGENT } from "./scripts/lib/profit.js";

const TTL_SECONDS = 6 * 60 * 60;
const MAX_BATCH = 20;
const KEEP_SECONDS = 7 * 24 * 60 * 60; // how long KV keeps a price for use as a stale fallback
// The official API blocks bursts (~30 at once), so a batch fetches only a few items at a time.
const CONCURRENCY = 4;
const ATTEMPTS = 2; // keeps a full batch under the free plan's 50 outgoing requests
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

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Fetch one item's raw price from the official API, retrying since it sometimes answers empty. */
async function fetchPrice(id) {
  let lastError;
  for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
    try {
      const upstream = await fetch(OFFICIAL_API_URL(id), {
        headers: { "User-Agent": USER_AGENT },
        signal: AbortSignal.timeout(20_000),
      });
      if (!upstream.ok) throw new Error(`HTTP ${upstream.status}`);
      const body = await upstream.text();
      if (!isValidBody(body)) throw new Error("response was not a price payload (rate limited?)");
      return JSON.parse(body).item.current.price;
    } catch (error) {
      lastError = error;
      if (attempt < ATTEMPTS) await sleep(400 * attempt);
    }
  }
  throw lastError;
}

/**
 * GET /api/prices?ids=1,2,3 -> { prices: { id: price }, errors: { id: message } }
 *
 * Prices live in KV (binding PRICES), one key per item, shared by every location and every
 * script. They are considered fresh for 6h, but kept much longer so that if the official API
 * fails (rate limited) the last known price is served instead of an error.
 */
async function getPrices(request, env, ctx) {
  const raw = new URL(request.url).searchParams.get("ids") ?? "";
  const ids = [...new Set(raw.split(",").filter(Boolean))];
  if (!ids.length || ids.length > MAX_BATCH || !ids.every((id) => /^\d+$/.test(id))) {
    return new Response(`ids must be 1-${MAX_BATCH} comma-separated numeric item ids`, { status: 400 });
  }

  const now = Date.now();
  const stored = await env.PRICES.get(ids.map((id) => `price:${id}`), "json"); // one bulk read
  const prices = {};
  const errors = {};
  const queue = [];
  for (const id of ids) {
    const entry = stored.get(`price:${id}`);
    if (entry && now - entry.fetchedAt < TTL_SECONDS * 1000) prices[id] = entry.price;
    else queue.push(id);
  }

  let stale = false;
  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, queue.length) }, async () => {
      for (let id; (id = queue.shift()) !== undefined; ) {
        try {
          prices[id] = await fetchPrice(id);
          ctx.waitUntil(env.PRICES.put(`price:${id}`, JSON.stringify({ price: prices[id], fetchedAt: now }), {
            expirationTtl: KEEP_SECONDS,
          }));
        } catch (error) {
          const old = stored.get(`price:${id}`);
          if (old) { prices[id] = old.price; stale = true; } else errors[id] = error.message;
        }
      }
    }),
  );

  // Only a complete, fresh answer is cached by browsers for long; otherwise let the client retry soon.
  const maxAge = Object.keys(errors).length ? 0 : stale ? 300 : TTL_SECONDS;
  return new Response(JSON.stringify({ prices, errors }), {
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": maxAge ? `public, max-age=${maxAge}` : "no-store",
    },
  });
}

export default {
  async fetch(request, env, ctx) {
    const { pathname } = new URL(request.url);
    if (pathname === "/api/prices") {
      if (request.method !== "GET") return new Response("Method not allowed", { status: 405 });
      return getPrices(request, env, ctx);
    }
    const match = pathname.match(/^\/api\/price\/([^/]+)$/);
    if (match) {
      if (request.method !== "GET") return new Response("Method not allowed", { status: 405 });
      if (!/^\d+$/.test(match[1])) return new Response("Bad item id", { status: 400 });
      return getPrice(match[1], request, ctx);
    }
    return env.ASSETS.fetch(request);
  },
};
