/**
 * Grand Exchange price lookup shared by the Worker, the dev server and the CLI (not the browser).
 *
 * Prices come from the Weird Gloop API, which mirrors the official GE guide prices but returns
 * exact numbers (the official detail.json gives anything over 10k as rounded text like "95.6m")
 * and answers up to 100 items in one request, so there is no burst rate limiting to work around.
 *
 * Guide prices change roughly once a day, but at no fixed time: over 90 days the gap between
 * updates ranged from 7.5 to 41 hours (median ~25h). So a stored price counts as fresh for
 * FRESH_SECONDS, shorter than the shortest gap seen, and is kept for KEEP_SECONDS so the last
 * known price can be served if the API is down. An id the API has no price for is stored as
 * { price: null } for FRESH_SECONDS, so unknown ids don't reach the API on every request.
 */
import { MAX_IDS, NO_PRICE } from "./profit.js";

export { MAX_IDS }; // per API request, and per KV bulk read
export const PRICE_API_URL = (ids) =>
  `https://api.weirdgloop.org/exchange/history/rs/latest?id=${ids.join("|")}`;
export const USER_AGENT = "runescript-profit/1.0";
export const FRESH_SECONDS = 6 * 60 * 60;
export const KEEP_SECONDS = 7 * 24 * 60 * 60;
// A forced refresh still reuses prices fetched this recently, so repeated Refresh clicks (or
// anyone calling the endpoint in a loop) can't hammer the price API or KV's write limits.
export const FORCE_MIN_AGE_SECONDS = 60;

const keyOf = (id) => `price:${id}`;

/** Latest prices for up to MAX_IDS ids, as Map<id string, price>. Unknown ids are left out. */
async function fetchLatest(ids, fetchFn) {
  const response = await fetchFn(PRICE_API_URL(ids), {
    headers: { "User-Agent": USER_AGENT },
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const payload = await response.json();
  if (payload.success === false) {
    if (/no results/i.test(payload.error)) return new Map(); // none of the ids exist
    throw new Error(payload.error);
  }
  return new Map(
    Object.values(payload)
      .filter((entry) => typeof entry?.price === "number")
      .map((entry) => [String(entry.id), entry.price]),
  );
}

/**
 * Look up prices for `ids` (numeric strings, at most MAX_IDS) through `store`: a KV namespace,
 * or anything with the same `get(keys[], "json")` and `put(key, value, { expirationTtl })`.
 *
 * `force` asks the API for every id whose stored price is older than FORCE_MIN_AGE_SECONDS, even
 * if it is still fresh (stored prices are still used as a fallback if the API fails).
 *
 * Returns { prices: { id: price }, errors: { id: message }, stale, freshFor }, where `stale` means
 * some prices are older than FRESH_SECONDS because the API could not give a current one, and
 * `freshFor` is how many more seconds the oldest fresh price in the answer stays fresh.
 */
export async function getPrices(ids, store, { force = false, fetchFn = fetch, now = Date.now(), waitUntil = () => {} } = {}) {
  const stored = await store.get(ids.map(keyOf), "json");
  const prices = {};
  const errors = {};
  let stale = false;
  let oldest = now; // fetchedAt of the oldest fresh price served

  const maxAge = (force ? FORCE_MIN_AGE_SECONDS : FRESH_SECONDS) * 1000;
  const missing = ids.filter((id) => {
    const entry = stored.get(keyOf(id));
    if (entry && now - entry.fetchedAt < maxAge) {
      if (entry.price === null) errors[id] = NO_PRICE;
      else {
        prices[id] = entry.price;
        oldest = Math.min(oldest, entry.fetchedAt);
      }
    }
    return prices[id] === undefined && errors[id] === undefined;
  });
  const freshFor = () => Math.max(0, Math.floor(FRESH_SECONDS - (now - oldest) / 1000));
  if (!missing.length) return { prices, errors, stale, freshFor: freshFor() };

  let latest = new Map();
  let failure;
  try {
    latest = await fetchLatest(missing, fetchFn);
  } catch (error) {
    failure = error.message;
  }

  for (const id of missing) {
    const old = stored.get(keyOf(id));
    if (latest.has(id)) {
      prices[id] = latest.get(id);
      waitUntil(store.put(keyOf(id), JSON.stringify({ price: prices[id], fetchedAt: now }), { expirationTtl: KEEP_SECONDS }));
    } else if (!failure) {
      errors[id] = NO_PRICE;
      waitUntil(store.put(keyOf(id), JSON.stringify({ price: null, fetchedAt: now }), { expirationTtl: FRESH_SECONDS }));
    } else if (old?.price != null) {
      // A forced refresh that failed can fall back to a price that is still fresh.
      prices[id] = old.price;
      if (now - old.fetchedAt < FRESH_SECONDS * 1000) oldest = Math.min(oldest, old.fetchedAt);
      else stale = true;
    } else {
      errors[id] = failure;
    }
  }
  return { prices, errors, stale, freshFor: freshFor() };
}
