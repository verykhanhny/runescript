/** Shared helpers for profit scripts. Pure logic, works in Node and the browser. */

export const GE_TAX = 0.02;
// Most ids per /api/prices request; also the server's per-request limit (lib/prices.js re-exports it).
export const MAX_IDS = 100;
// The error /api/prices gives for an item with no Grand Exchange price. It is permanent, so it isn't retried.
export const NO_PRICE = "no Grand Exchange price for this item";

export const item = (name, id) => Object.freeze({ name, id });

export function formatDuration(hours) {
  const total = Math.round(hours * 60);
  const h = Math.floor(total / 60);
  const m = total % 60;
  return h && m ? `${h}h ${m}m` : h ? `${h}h` : `${m}m`;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Fetch prices from the batch endpoint (`GET {endpoint}?ids=1,2,3`, answering
 * `{ prices: { id: price }, errors: { id: message } }`), split into requests of at most
 * MAX_IDS ids. Items still missing after a failed request or an error for them are asked for
 * again a couple of times before giving up (except NO_PRICE errors, which won't change).
 * `fresh` bypasses both the browser's HTTP cache and the server's stored prices: cache
 * "reload" makes the browser send
 * `Cache-Control: no-cache` (which the server treats as a forced refresh) and store the new
 * answer under the normal URL, so a later page load sees the refreshed prices too. Returns Map<itemId, price>.
 */
export async function fetchPricesBatch(items, endpoint = "/api/prices", { fresh = false, fetchFn = fetch } = {}) {
  const init = fresh ? { cache: "reload", headers: { "Cache-Control": "no-cache" } } : {};
  const names = new Map(items.map((it) => [it.id, it.name]));
  const prices = new Map();
  const unknown = new Set(); // ids that got NO_PRICE: not retried
  let pending = [...names.keys()];
  let errors = {};
  let lastError;
  for (let attempt = 1; pending.length && attempt <= 3; attempt++) {
    if (attempt > 1) await sleep(1000 * attempt);
    errors = {};
    lastError = undefined;
    for (let i = 0; i < pending.length; i += MAX_IDS) {
      try {
        const chunk = pending.slice(i, i + MAX_IDS);
        const response = await fetchFn(`${endpoint}?ids=${chunk.join(",")}`, init);
        if (!response.ok) throw new Error(`HTTP ${response.status}: ${await response.text()}`);
        const payload = await response.json();
        for (const [id, price] of Object.entries(payload.prices)) prices.set(Number(id), price);
        Object.assign(errors, payload.errors);
      } catch (error) {
        lastError = error;
      }
    }
    for (const id of pending) if (errors[id] === NO_PRICE) unknown.add(id);
    pending = pending.filter((id) => !prices.has(id) && !unknown.has(id));
  }
  const id = [...names.keys()].find((id) => !prices.has(id));
  if (id !== undefined) {
    const reason = unknown.has(id) ? NO_PRICE : errors[id] ?? lastError?.message ?? "no price returned";
    throw new Error(`${names.get(id)}: ${reason}`);
  }
  return prices;
}

/**
 * Define a script from declarative recipes.
 *
 * sections: [{ title, recipes: [{ output: Item, hours, detail?, inputs: [[Item, qty], ...] }] }]
 *
 * Returns { meta, requiredItems, calculate } as the web page and CLI expect.
 */
export function defineProfitScript({ meta, sections }) {
  const requiredItems = () =>
    sections.flatMap((s) => s.recipes.flatMap((r) => [r.output, ...r.inputs.map(([it]) => it)]));

  function buildRow(prices, recipe) {
    const inputs = recipe.inputs.map(([it, qty]) => {
      const unit = prices.get(it.id);
      return { name: it.name, qty, unit, total: unit * qty };
    });
    const cost = inputs.reduce((sum, input) => sum + input.total, 0);
    const price = prices.get(recipe.output.id);
    const tax = Math.floor(price * GE_TAX);
    const net = price - tax;
    const profit = net - cost;
    return {
      name: recipe.output.name,
      detail: recipe.detail ?? formatDuration(recipe.hours),
      hours: recipe.hours,
      inputs,
      cost,
      price,
      tax,
      net,
      profit,
      hourlyProfit: profit / recipe.hours,
      roi: cost ? profit / cost : 0,
    };
  }

  function calculate(prices) {
    return {
      settings: { geTax: GE_TAX },
      sections: sections.map((s) => ({
        title: s.title,
        rows: s.recipes.map((r) => buildRow(prices, r)).sort((a, b) => b.hourlyProfit - a.hourlyProfit),
      })),
    };
  }

  return { meta, requiredItems, calculate };
}
