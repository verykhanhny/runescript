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
 * known price can be served if the API is down.
 */
export const PRICE_API_URL = (ids) =>
  `https://api.weirdgloop.org/exchange/history/rs/latest?id=${ids.join("|")}`;
export const USER_AGENT = "runescript-profit/1.0";
export const MAX_IDS = 100; // per API request, and per KV bulk read
export const FRESH_SECONDS = 6 * 60 * 60;
export const KEEP_SECONDS = 7 * 24 * 60 * 60;

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
 * `force` asks the API for every id even if the stored price is still fresh (stored prices are
 * still used as a fallback if the API fails).
 *
 * Returns { prices: { id: price }, errors: { id: message }, stale }, where `stale` means some
 * prices are older than FRESH_SECONDS because the API could not give a current one.
 */
export async function getPrices(ids, store, { force = false, fetchFn = fetch, now = Date.now(), waitUntil = () => {} } = {}) {
  const stored = await store.get(ids.map(keyOf), "json");
  const prices = {};
  const errors = {};
  let stale = false;

  const missing = ids.filter((id) => {
    const entry = stored.get(keyOf(id));
    if (!force && entry && now - entry.fetchedAt < FRESH_SECONDS * 1000) prices[id] = entry.price;
    return prices[id] === undefined;
  });
  if (!missing.length) return { prices, errors, stale };

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
    } else if (old) {
      prices[id] = old.price;
      stale = true;
    } else {
      errors[id] = failure ?? "no Grand Exchange price for this item";
    }
  }
  return { prices, errors, stale };
}
