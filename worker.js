// Cloudflare Worker `runescript`: static assets come from dist/ (see wrangler.toml); this handles
// GET /api/prices?ids=1,2,3 -> { prices: { id: price }, errors: { id: message } }.
// A request with `Cache-Control: no-cache` (what the browser sends for fetch's cache: "reload",
// used by the Refresh button) or `&fresh=1` skips the stored prices and asks the price API again.
// Prices are stored in KV (binding PRICES), one key per item, shared by every location and every
// script; see scripts/lib/prices.js. server.js runs this same file locally.
import { MAX_IDS, getPrices } from "./scripts/lib/prices.js";

const isForced = (request, searchParams) =>
  searchParams.get("fresh") === "1" || /\bno-cache\b/i.test(request.headers.get("Cache-Control") ?? "");

const badIds = () => new Response(`ids must be 1-${MAX_IDS} comma-separated numeric item ids`, { status: 400 });

async function handlePrices(request, env, ctx) {
  const { searchParams } = new URL(request.url);
  const raw = (searchParams.get("ids") ?? "").split(",").filter(Boolean);
  if (!raw.length || !raw.every((id) => /^\d+$/.test(id))) return badIds();
  // Strip leading zeros so "007" and "7" are one item (the price API answers with "7").
  const ids = [...new Set(raw.map((id) => id.replace(/^0+(?=\d)/, "")))];
  if (ids.length > MAX_IDS) return badIds();

  const { prices, errors, stale, freshFor } = await getPrices(ids, env.PRICES, {
    force: isForced(request, searchParams),
    waitUntil: (p) => ctx.waitUntil(p),
  });

  // Browsers may keep a complete, fresh answer only until its oldest price stops being fresh;
  // otherwise let the client retry soon.
  const maxAge = Object.keys(errors).length ? 0 : stale ? 300 : freshFor;
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
      if (request.method !== "GET") return new Response("Method not allowed", { status: 405, headers: { Allow: "GET" } });
      return handlePrices(request, env, ctx);
    }
    if (pathname.startsWith("/api/")) return new Response("Not found", { status: 404 });
    return env.ASSETS.fetch(request);
  },
};
