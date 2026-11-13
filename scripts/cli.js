#!/usr/bin/env node
// Usage: node scripts/cli.js <script-id>   (no id lists the scripts)
import { scripts } from "./index.js";
import { cachedFetch, flushPriceCache } from "./lib/ge-cache.js";
import { GE_TAX, OFFICIAL_API_URL, USER_AGENT } from "./lib/profit.js";

const gpFormat = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
const fmtGp = (value) => `${gpFormat.format(value)} gp`;

function printTable(headers, rows) {
  const widths = headers.map((header) => header.length);
  for (const row of rows) row.forEach((cell, i) => (widths[i] = Math.max(widths[i], String(cell).length)));
  const line = (cells) => cells.map((cell, i) => String(cell).padEnd(widths[i])).join("  ");
  console.log(line(headers));
  console.log(widths.map((w) => "-".repeat(w)).join("  "));
  for (const row of rows) console.log(line(row));
}

const script = scripts.find((s) => s.meta.id === process.argv[2]);
if (!script) {
  console.error("Usage: node scripts/cli.js <script-id>\nAvailable:");
  for (const s of scripts) console.error(`  ${s.meta.id}  ${s.meta.title}`);
  process.exit(2);
}

let prices;
try {
  prices = await script.fetchPrices(OFFICIAL_API_URL, {
    headers: { "User-Agent": USER_AGENT },
    signal: AbortSignal.timeout(20_000),
  }, cachedFetch);
} catch (error) {
  console.error(`Could not fetch RuneScape prices: ${error.message}`);
  process.exit(1);
}

await flushPriceCache();

console.log(script.meta.title);
for (const note of script.meta.notes) console.log(note);
console.log(`GE sale tax: ${(GE_TAX * 100).toFixed(0)}%\n`);

const headers = ["Item", "Time", "Input cost", "Net sale", "Profit", "Profit/hr", "ROI"];
for (const section of script.calculate(prices).sections) {
  console.log(section.title);
  if (section.checklist) {
    for (const shop of section.checklist) {
      console.log(`[ ] ${shop.title}  (${fmtGp(shop.total)})`);
      for (const i of shop.items) console.log(`      ${i.label}: ${gpFormat.format(i.qty)} x  (${fmtGp(i.profit)})`);
    }
    console.log();
    continue;
  }
  printTable(
    headers,
    section.rows.map((r) => [
      r.name, r.detail, fmtGp(r.cost), fmtGp(r.net), fmtGp(r.profit), (r.hourlyProfit == null ? "-" : fmtGp(r.hourlyProfit)),
      `${(r.roi * 100).toFixed(2)}%`,
    ]),
  );
  console.log();
}
