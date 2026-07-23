#!/usr/bin/env node
// Fetch real Swedish data from Yahoo, run the gap-fill analysis, print a ranked
// table. Requires outbound network access to Yahoo (run where egress is open).
//
//   node src/cli.js                                  # large-cap, 40d, drop@open, nominal
//   node src/cli.js --universe demo --basis index
//   node src/cli.js --list mylist.txt --minYield 3   # only stocks yielding >= 3%
//   node src/cli.js --minEvents 4 --years 10         # need >= 4 ex-days to be ranked
//   node src/cli.js --symbol INVE-B.ST
//
// Universe resolution order: --symbol > --list <file> > data/universe.json[name] > built-in name.

import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { fetchChart } from "./yahoo.js";
import { analyzeEvents } from "./gapfill.js";
import { trailingDividendYield } from "./metrics.js";
import { builtinUniverse, INDEX } from "./stocks.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

function parseArgs(argv) {
  const a = {
    window: 40, dropAt: "open", basis: "nominal", years: 8,
    universe: "large-cap", list: null, minYield: 0, minEvents: 1, symbol: null,
  };
  for (let i = 2; i < argv.length; i++) {
    const k = argv[i], v = argv[i + 1];
    const num = (x) => { i++; return Number(x); };
    if (k === "--window") a.window = num(v);
    else if (k === "--dropAt") { a.dropAt = v === "close" ? "close" : "open"; i++; }
    else if (k === "--basis") { a.basis = v === "index" ? "index" : "nominal"; i++; }
    else if (k === "--years") a.years = num(v);
    else if (k === "--universe") { a.universe = v; i++; }
    else if (k === "--list") { a.list = v; i++; }
    else if (k === "--minYield") a.minYield = num(v);
    else if (k === "--minEvents") a.minEvents = num(v);
    else if (k === "--symbol") { a.symbol = v; i++; }
  }
  return a;
}

function fromDate(years) {
  const d = new Date();
  d.setFullYear(d.getFullYear() - years);
  return d.toISOString().slice(0, 10);
}

// Read a plain-text ticker list: one per line, "SYMBOL Optional Name",
// blank lines and lines starting with # ignored.
function readListFile(path) {
  return readFileSync(path, "utf8")
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#"))
    .map((l) => {
      const [symbol, ...rest] = l.split(/\s+/);
      return { symbol, name: rest.join(" ") || symbol };
    });
}

function resolveUniverse(cfg) {
  if (cfg.symbol) return [{ symbol: cfg.symbol, name: cfg.symbol }];
  if (cfg.list) return readListFile(cfg.list);
  const dataFile = join(ROOT, "data", "universe.json");
  if (existsSync(dataFile)) {
    const data = JSON.parse(readFileSync(dataFile, "utf8"));
    if (Array.isArray(data[cfg.universe]) && data[cfg.universe].length) return data[cfg.universe];
  }
  const built = builtinUniverse(cfg.universe);
  if (!built) throw new Error(`Okänt universum: "${cfg.universe}" (bygg in eller använd --list / data/universe.json)`);
  return built;
}

async function run() {
  const cfg = parseArgs(process.argv);
  const from = fromDate(cfg.years);
  const universe = resolveUniverse(cfg);

  const filterBits = [
    `${universe.length} aktier`,
    cfg.minYield > 0 ? `dir.avk ≥ ${cfg.minYield}%` : null,
    cfg.minEvents > 1 ? `≥ ${cfg.minEvents} x-dagar` : null,
  ].filter(Boolean).join(" · ");
  console.log(`\nUtdelningsanalys · fönster ${cfg.window}d · fall@${cfg.dropAt} · ${cfg.basis === "index" ? "mot index" : "nominellt"} · ${cfg.years} år`);
  console.log(`Urval: ${filterBits}\n`);

  let indexBars = null;
  if (cfg.basis === "index") {
    try {
      indexBars = (await fetchChart(INDEX.symbol, { from })).bars;
    } catch (e) {
      console.warn(`Kunde inte hämta index (${INDEX.symbol}): ${e.message}. Faller tillbaka på nominellt.`);
      cfg.basis = "nominal";
    }
  }

  const rows = [];
  let skippedYield = 0, skippedEvents = 0, skippedNoDiv = 0;
  for (const s of universe) {
    try {
      const { bars, dividends } = await fetchChart(s.symbol, { from });
      if (!dividends.length) { skippedNoDiv++; continue; }
      const yld = trailingDividendYield(bars, dividends);
      if (yld.yield < cfg.minYield) { skippedYield++; continue; }
      const { summary } = analyzeEvents(bars, dividends, indexBars, cfg);
      if (summary.n < cfg.minEvents) { skippedEvents++; continue; }
      rows.push({ name: s.name, yield: yld.yield, ...summary });
    } catch (e) {
      console.warn(`  ${s.name} (${s.symbol}): ${e.message}`);
    }
  }

  rows.sort((a, b) => {
    if (Math.abs(b.fillRate - a.fillRate) > 0.01) return b.fillRate - a.fillRate;
    const am = a.medianRec ?? 1e9, bm = b.medianRec ?? 1e9;
    return am - bm;
  });

  printTable(rows);
  const skips = [
    skippedNoDiv ? `${skippedNoDiv} utan utdelning` : null,
    skippedYield ? `${skippedYield} under dir.avk-gräns` : null,
    skippedEvents ? `${skippedEvents} med för få x-dagar` : null,
  ].filter(Boolean).join(", ");
  if (skips) console.log(`Bortfiltrerade: ${skips}.\n`);
}

function printTable(rows) {
  if (!rows.length) { console.log("(inga aktier klarade filtren)\n"); return; }
  const pad = (s, n) => String(s).padEnd(n);
  const padL = (s, n) => String(s).padStart(n);
  console.log(pad("Aktie", 18) + padL("Dir.avk", 8) + padL("Fyllt%", 8) + padL("Median", 8) + padL("Föll≥utd", 10) + padL("Snitt×", 8) + padL("Sen.3år", 9) + padL("n", 4));
  console.log("─".repeat(73));
  for (const r of rows) {
    console.log(
      pad(r.name, 18) +
      padL(r.yield.toFixed(1) + "%", 8) +
      padL(Math.round(r.fillRate) + "%", 8) +
      padL(r.medianRec == null ? "–" : r.medianRec + "d", 8) +
      padL(Math.round(r.fellRate) + "%", 10) +
      padL(r.avgRatio == null ? "–" : r.avgRatio.toFixed(2), 8) +
      padL(r.recentFill == null ? "–" : Math.round(r.recentFill) + "%", 9) +
      padL(r.n, 4)
    );
  }
  console.log("");
}

run().catch((e) => { console.error(e); process.exit(1); });
