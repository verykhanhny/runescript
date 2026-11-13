// Cloudflare Worker `runescript`: static assets come from dist/ (see wrangler.toml); this handles
// GET /api/prices?ids=1,2,3 -> { prices: { id: price }, errors: { id: message } }.
// Add &fresh=1 to skip the stored prices and ask the price API again (the Refresh button).
// Prices are stored in KV (binding PRICES), one key per item, shared by every location and every
// script; see scripts/lib/prices.js. server.js runs this same file locally.
import { FRESH_SECONDS, MAX_IDS, getPrices } from "./scripts/lib/prices.js";

async function handlePrices(request, env, ctx) {
  const { searchParams } = new URL(request.url);
  const raw = searchParams.get("ids") ?? "";
  const force = searchParams.get("fresh") === "1";
  const ids = [...new Set(raw.split(",").filter(Boolean))];
  if (!ids.length || ids.length > MAX_IDS || !ids.every((id) => /^\d+$/.test(id))) {
    return new Response(`ids must be 1-${MAX_IDS} comma-separated numeric item ids`, { status: 400 });
  }

  const { prices, errors, stale } = await getPrices(ids, env.PRICES, { force, waitUntil: (p) => ctx.waitUntil(p) });

  // Only a complete, fresh answer is cached by browsers for long; otherwise let the client retry soon.
  const maxAge = Object.keys(errors).length ? 0 : stale ? 300 : FRESH_SECONDS;
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
      return handlePrices(request, env, ctx);
    }
    if (pathname.startsWith("/api/")) return new Response("Not found", { status: 404 });
    return env.ASSETS.fetch(request);
  },
};
