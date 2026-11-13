/**
 * Node-only disk cache for Grand Exchange guide prices.
 *
 * Guide prices change roughly once a day, but at no fixed time: over 90 days the gap between
 * updates ranged from 7.5 to 41 hours (median ~25h) and landed at every hour (Weird Gloop
 * price history). So entries are reused for GE_CACHE_TTL_HOURS, which is shorter than the
 * shortest gap seen, meaning a new price is picked up within that many hours of it appearing
 * while we only hit the API a few times a day. The cache lives in .cache/ge-prices.json so the
 * CLI and the server share it and it survives restarts. If a fetch fails (e.g. rate limited),
 * a stale entry is served.
 */
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

export const GE_CACHE_TTL_HOURS = 6;
const TTL_MS = GE_CACHE_TTL_HOURS * 60 * 60 * 1000;
// The official API returns block pages after a burst of requests (~30 at once), so uncached
// fetches go out one at a time with a pause between them.
export const REQUEST_GAP_MS = 400;
const DEFAULT_FILE = fileURLToPath(new URL("../../.cache/ge-prices.json", import.meta.url));

const isValidBody = (text) => {
  try {
    return JSON.parse(text)?.item?.current?.price != null;
  } catch {
    return false; // e.g. the HTML block page returned when rate limited
  }
};

export function createPriceCache({ file = DEFAULT_FILE, fetchImpl = fetch, now = () => Date.now(), gapMs = REQUEST_GAP_MS } = {}) {
  let entries = null; // url -> { fetchedAt, body }
  let loading = null;
  const inflight = new Map();

  let queue = Promise.resolve();
  const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  /** Run `task` after every earlier network request has finished plus a short gap. */
  function throttled(task) {
    const run = queue.then(task);
    queue = run.then(() => pause(gapMs), () => pause(gapMs));
    return run;
  }

  // Memoised so concurrent callers all share one entries object.
  function load() {
    loading ??= readFile(file, "utf8").then(
      (text) => (entries = JSON.parse(text)),
      () => (entries = {}),
    );
    return loading;
  }

  // Saves are chained so concurrent fetches never write the file at the same time.
  let saving = Promise.resolve();
  function save() {
    saving = saving.then(async () => {
      await mkdir(dirname(file), { recursive: true });
      const tmp = `${file}.${process.pid}.tmp`;
      await writeFile(tmp, JSON.stringify(entries));
      await rename(tmp, file);
    }).catch((error) => console.warn(`Could not save GE price cache: ${error.message}`));
    return saving;
  }

  async function refresh(url, init) {
    const store = await load();
    try {
      const response = await throttled(() => fetchImpl(url, init));
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const body = await response.text();
      if (!isValidBody(body)) throw new Error("response was not a price payload (rate limited?)");
      store[url] = { fetchedAt: now(), body };
      save();
      return body;
    } catch (error) {
      if (store[url]) {
        console.warn(`GE price fetch failed (${error.message}); using cached price from ${new Date(store[url].fetchedAt).toISOString()}`);
        return store[url].body;
      }
      throw error;
    }
  }

  /** Drop-in for fetch(url, init) that returns a Response. */
  async function cachedFetch(url, init) {
    const store = await load();
    const hit = store[url];
    if (hit && now() - hit.fetchedAt < TTL_MS) {
      return new Response(hit.body, { headers: { "X-GE-Cache": "hit" } });
    }
    if (!inflight.has(url)) {
      inflight.set(url, refresh(url, init).finally(() => inflight.delete(url)));
    }
    return new Response(await inflight.get(url), { headers: { "X-GE-Cache": "miss" } });
  }

  return { cachedFetch, flush: () => saving };
}

const defaultCache = createPriceCache();
export const { cachedFetch } = defaultCache;
export const flushPriceCache = defaultCache.flush;
