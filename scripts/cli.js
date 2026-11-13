#!/usr/bin/env node
// Usage: node scripts/cli.js <script-id>   (no id lists the scripts)
import { scripts } from "./index.js";
import { priceStore } from "./lib/ge-cache.js";
import { MAX_IDS, getPrices } from "./lib/prices.js";
import { GE_TAX } from "./lib/profit.js";

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

// Same lookup as the Worker, with the disk cache standing in for KV.
const items = new Map(script.requiredItems().map((it) => [String(it.id), it]));
const ids = [...items.keys()];
const prices = new Map();
for (let i = 0; i < ids.length; i += MAX_IDS) {
  const result = await getPrices(ids.slice(i, i + MAX_IDS), priceStore);
  for (const [id, price] of Object.entries(result.prices)) prices.set(Number(id), price);
  for (const [id, message] of Object.entries(result.errors)) {
    console.error(`Could not get a price for ${items.get(id).name}: ${message}`);
  }
  if (result.stale) console.warn("Price API unavailable; some prices are older than 6 hours.");
}
await priceStore.flush();
if (prices.size < ids.length) process.exit(1);

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
