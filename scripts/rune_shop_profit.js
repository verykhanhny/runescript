/** RS3 profit from buying runes at shops (fixed price) and selling them on the Grand Exchange. */
import { GE_TAX, fetchGuidePrices, fetchGuidePricesBatch, item } from "./lib/profit.js";

// Margin thresholds for the colour coding, in gp of total profit on a full shop stock.
const GOOD_PROFIT = 10_000;

// [rune, shop price]. Shop prices are fixed in RS3 (they do not move with stock).
const RUNES = [
  [item("Air rune", 556), 17],
  [item("Water rune", 555), 17],
  [item("Earth rune", 557), 17],
  [item("Fire rune", 554), 17],
  [item("Mind rune", 558), 17],
  [item("Body rune", 559), 16],
  [item("Chaos rune", 562), 140],
  [item("Death rune", 560), 310],
  [item("Nature rune", 561), 372],
  [item("Law rune", 563), 378],
  [item("Cosmic rune", 564), 232],
  [item("Astral rune", 9075), 220],
  [item("Blood rune", 565), 550],
  [item("Soul rune", 566), 410],
];

// Stock is per player per shop, so every shop can be bought out separately.
// [shop, { rune id: stock }] from the RuneScape Wiki shop pages.
const SHOPS = [
  ["Aubury's Rune Shop", { 556: 2100, 555: 2100, 557: 2100, 554: 2100, 558: 700, 559: 700, 562: 210, 560: 70 }],
  ["Carwen Essencebinder's shop", { 556: 2100, 555: 2100, 557: 2100, 554: 2100, 558: 700, 559: 700, 562: 210, 560: 70 }],
  ["Betty's Magic Emporium", { 556: 2100, 555: 2100, 557: 2100, 554: 2100, 558: 700, 559: 700, 562: 210, 560: 70 }],
  ["Rune Shop (Anachronia)", { 556: 2100, 555: 2100, 557: 2100, 554: 2100, 558: 700, 559: 700, 562: 210, 560: 70 }],
  ["Lundail's Arena-side Rune Shop", { 556: 7000, 555: 7000, 557: 7000, 554: 7000, 558: 7000, 559: 7000, 561: 2100, 562: 2100, 563: 700, 564: 700, 560: 2100 }],
  ["Void Knight Magic Store", { 556: 7000, 555: 7000, 557: 7000, 554: 7000, 558: 7000, 559: 7000, 562: 2100, 560: 700 }],
  ["Magic Guild Store", { 556: 7000, 555: 7000, 557: 7000, 554: 7000, 558: 7000, 559: 7000, 562: 2100, 561: 2100, 560: 7000, 563: 700, 565: 700, 566: 700 }],
  ["Battle Runes (after Enter the Abyss)", { 556: 7000, 555: 7000, 557: 7000, 554: 7000, 558: 7000, 562: 2100, 560: 700, 565: 700 }],
  ["Baba Yaga's Magic Shop", { 556: 7000, 555: 7000, 557: 7000, 554: 7000, 558: 7000, 559: 7000, 562: 2100, 561: 2100, 560: 2100, 563: 700, 565: 700, 566: 700, 9075: 700 }],
  ["Ali's Discount Wares", { 556: 2100, 555: 2100, 557: 2100, 554: 2100, 558: 2100, 559: 2100, 561: 2100, 563: 2100, 562: 2100, 560: 700, 565: 2100, 564: 2100, 566: 700 }],
  ["Tutab's Magical Market", { 556: 7000, 555: 7000, 557: 7000, 554: 7000, 563: 700 }],
];

export const meta = {
  id: "rune-shop-profit",
  title: "Rune shop flipping",
  description: "Buy runes from shops at their fixed price, sell them on the Grand Exchange.",
  notes: [
    "Prices: official Grand Exchange guide prices",
    "Each row is a full stock bought out of every shop that sells the rune (stock is per player per shop)",
    "Profit is for the whole stock; GE tax is 2% per rune, rounded down",
    "Battle Runes (Wilderness) uses its stock after the Enter the Abyss miniquest; Baba Yaga's astral runes need Lunar Diplomacy",
    "Left out: shops that don't take gp: Magic Training Arena (pizazz points), TzHaar-Mej-Roh (tokkul) and Aubury's (New Varrock)",
    "Not included: selling price drift while you sell, travel time",
  ],
};

export const requiredItems = () => RUNES.map(([rune]) => rune);
export const fetchPrices = (urlFor, init, fetchFn) => fetchGuidePrices(requiredItems(), urlFor, init, fetchFn);
export const fetchPricesBatch = (endpoint, init, fetchFn) => fetchGuidePricesBatch(requiredItems(), endpoint, init, fetchFn);

const status = (profit) => (profit > GOOD_PROFIT ? "good" : profit > 0 ? "warn" : "bad");
const nf = new Intl.NumberFormat("en-US");

export function calculate(prices) {
  const rows = RUNES.map(([rune, shopPrice]) => {
    const stocks = SHOPS.map(([shop, stock]) => [shop, stock[rune.id] ?? 0]).filter(([, qty]) => qty > 0);
    const qty = stocks.reduce((sum, [, n]) => sum + n, 0);

    const gePrice = prices.get(rune.id);
    const taxEach = Math.floor(gePrice * GE_TAX);
    const cost = shopPrice * qty;
    const price = gePrice * qty;
    const tax = taxEach * qty;
    const net = price - tax;
    const profit = net - cost;

    return {
      name: rune.name,
      detail: `${nf.format(qty)} runes · margin ${gePrice - taxEach - shopPrice} gp each`,
      shops: stocks.map(([name, n]) => ({ name, stock: n })).sort((a, b) => b.stock - a.stock),
      inputs: [{ name: `${rune.name} from shops`, qty, unit: shopPrice, total: cost }],
      cost,
      price,
      tax,
      net,
      profit,
      hourlyProfit: null,
      roi: cost ? profit / cost : 0,
      status: status(profit),
    };
  }).sort((a, b) => b.profit - a.profit);

  const green = rows.filter((r) => r.status === "good");
  const marginEach = new Map(RUNES.map(([rune, shopPrice]) => {
    const gePrice = prices.get(rune.id);
    return [rune.id, gePrice - Math.floor(gePrice * GE_TAX) - shopPrice];
  }));
  const greenIds = new Set(RUNES.filter(([rune]) => green.some((r) => r.name === rune.name)).map(([rune]) => rune.id));

  // Shop-by-shop run: only the green runes, grouped by shop, best shop first.
  const route = SHOPS.map(([name, stock]) => {
    const items = RUNES.filter(([rune]) => greenIds.has(rune.id) && stock[rune.id])
      .map(([rune]) => ({
        label: rune.name,
        qty: stock[rune.id],
        profit: stock[rune.id] * marginEach.get(rune.id),
      }))
      .sort((a, b) => b.profit - a.profit);
    return { id: name, title: name, items, total: items.reduce((sum, i) => sum + i.profit, 0) };
  }).filter((shop) => shop.items.length).sort((a, b) => b.total - a.total);
  const greenTotal = green.reduce((sum, r) => sum + r.profit, 0);

  return {
    settings: { geTax: GE_TAX },
    sections: [
      {
        title: "Runes",
        legend: `<span class="dot good"></span>profit over ${nf.format(GOOD_PROFIT)} gp<span class="dot warn"></span>profit up to ${nf.format(GOOD_PROFIT)} gp<span class="dot bad"></span>not profitable`,
        summary: { label: `Total profit from green runes (${green.length})`, value: greenTotal },
        rows,
      },
      {
        title: "Shop run (green runes only)",
        legend: "Tick a shop off as you finish buying there. Ticks are saved in this browser.",
        checklist: route,
      },
    ],
  };
}
