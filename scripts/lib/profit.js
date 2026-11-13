/** Shared helpers for profit scripts. Pure logic, works in Node and the browser. */

export const OFFICIAL_API_URL = (id) =>
  `https://secure.runescape.com/m=itemdb_rs/api/catalogue/detail.json?item=${id}`;
export const USER_AGENT = "masterwork-profit/1.0";
export const GE_TAX = 0.02;

export const item = (name, id) => Object.freeze({ name, id });

export function parseGuidePrice(value) {
  if (typeof value === "number") return value;

  const multipliers = { k: 1_000, m: 1_000_000, b: 1_000_000_000 };
  const text = value.trim().toLowerCase().replaceAll(",", "");
  const suffix = text.at(-1);
  if (suffix in multipliers) {
    return Math.round(parseFloat(text.slice(0, -1)) * multipliers[suffix]);
  }
  return parseInt(text, 10);
}

export function formatDuration(hours) {
  const total = Math.round(hours * 60);
  const h = Math.floor(total / 60);
  const m = total % 60;
  return h && m ? `${h}h ${m}m` : h ? `${h}h` : `${m}m`;
}

/**
 * Fetch guide prices for items. `urlFor(id)` picks the endpoint (direct API in Node,
 * local proxy in the browser). Returns Map<itemId, price>.
 */
export async function fetchGuidePrices(items, urlFor = OFFICIAL_API_URL, init = {}, fetchFn = fetch) {
  const unique = [...new Map(items.map((it) => [it.id, it])).values()];
  const entries = await Promise.all(
    unique.map(async (it) => {
      // The Grand Exchange API sometimes answers with an empty body when busy, so retry.
      let lastError;
      for (let attempt = 1; attempt <= 4; attempt++) {
        try {
          const response = await fetchFn(urlFor(it.id), init);
          if (!response.ok) throw new Error(`HTTP ${response.status} for ${it.name}`);
          const payload = JSON.parse(await response.text());
          return [it.id, parseGuidePrice(payload.item.current.price)];
        } catch (error) {
          lastError = error;
          await new Promise((resolve) => setTimeout(resolve, 400 * attempt));
        }
      }
      throw new Error(`${it.name}: ${lastError.message}`);
    }),
  );
  return new Map(entries);
}

/**
 * Define a script from declarative recipes.
 *
 * sections: [{ title, recipes: [{ output: Item, hours, detail?, inputs: [[Item, qty], ...] }] }]
 *
 * Returns { meta, requiredItems, fetchPrices, calculate } as the web page and CLI expect.
 */
export function defineProfitScript({ meta, sections }) {
  const requiredItems = () =>
    sections.flatMap((s) => s.recipes.flatMap((r) => [r.output, ...r.inputs.map(([it]) => it)]));

  const fetchPrices = (urlFor, init, fetchFn) => fetchGuidePrices(requiredItems(), urlFor, init, fetchFn);

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

  return { meta, requiredItems, fetchPrices, calculate };
}
