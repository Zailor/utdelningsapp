#!/usr/bin/env node
// Verify that every ticker in a universe resolves on Yahoo — run after adding
// stocks to data/universe.json or a --list file, so typos and delistings
// surface before an analysis run. Requires network access.
//
//   node src/validate.js                        # large-cap (data/universe.json)
//   node src/validate.js --universe mid-cap
//   node src/validate.js --list mina-aktier.txt

import { fetchChart } from "./yahoo.js";
import { resolveUniverse } from "./universe.js";

function parseArgs(argv) {
  const a = { universe: "large-cap", list: null, symbol: null, delay: 300 };
  for (let i = 2; i < argv.length; i++) {
    const k = argv[i], v = argv[i + 1];
    if (k === "--universe") { a.universe = v; i++; }
    else if (k === "--list") { a.list = v; i++; }
    else if (k === "--delay") { a.delay = Number(v); i++; }
  }
  return a;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const cfg = parseArgs(process.argv);
const universe = resolveUniverse(cfg);
const from = new Date(Date.now() - 90 * 864e5).toISOString().slice(0, 10);

console.log(`Validerar ${universe.length} tickers mot Yahoo...\n`);
const failed = [];
for (const [i, s] of universe.entries()) {
  if (i > 0 && cfg.delay > 0) await sleep(cfg.delay);
  try {
    const { bars, dividends, currency } = await fetchChart(s.symbol, { from });
    if (!bars.length) throw new Error("inga kursstaplar");
    console.log(`  ✓ ${s.symbol.padEnd(14)} ${s.name.padEnd(28)} ${currency ?? "?"} · ${bars.length} dagar · ${dividends.length} utd (90d)`);
  } catch (e) {
    failed.push(s);
    console.log(`  ✗ ${s.symbol.padEnd(14)} ${s.name.padEnd(28)} ${e.message}`);
  }
}

console.log(`\n${universe.length - failed.length}/${universe.length} OK`);
if (failed.length) {
  console.log(`Fixa eller ta bort: ${failed.map((s) => s.symbol).join(", ")}`);
  process.exit(1);
}
