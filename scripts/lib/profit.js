/** Shared helpers for profit scripts. Pure logic, works in Node and the browser. */

export const GE_TAX = 0.02;
export const MAX_IDS_PER_REQUEST = 100; // matches MAX_IDS in lib/prices.js

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
 * MAX_IDS_PER_REQUEST ids. Items still missing after a failed request or an error for them are
 * asked for again a couple of times before giving up. `fresh` bypasses both the browser's HTTP
 * cache and the server's stored prices. Returns Map<itemId, price>.
 */
export async function fetchPricesBatch(items, endpoint = "/api/prices", { fresh = false, fetchFn = fetch } = {}) {
  const init = fresh ? { cache: "no-store" } : {};
  const query = fresh ? "&fresh=1" : "";
  const names = new Map(items.map((it) => [it.id, it.name]));
  const prices = new Map();
  let pending = [...names.keys()];
  let errors = {};
  let lastError;
  for (let attempt = 1; pending.length && attempt <= 3; attempt++) {
    if (attempt > 1) await sleep(1000 * attempt);
    errors = {};
    lastError = undefined;
    for (let i = 0; i < pending.length; i += MAX_IDS_PER_REQUEST) {
      try {
        const chunk = pending.slice(i, i + MAX_IDS_PER_REQUEST);
        const response = await fetchFn(`${endpoint}?ids=${chunk.join(",")}${query}`, init);
        if (!response.ok) throw new Error(`HTTP ${response.status}: ${await response.text()}`);
        const payload = await response.json();
        for (const [id, price] of Object.entries(payload.prices)) prices.set(Number(id), price);
        Object.assign(errors, payload.errors);
      } catch (error) {
        lastError = error;
      }
    }
    pending = pending.filter((id) => !prices.has(id));
  }
  if (pending.length) {
    const id = pending[0];
    throw new Error(`${names.get(id)}: ${errors[id] ?? lastError?.message ?? "no price returned"}`);
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
