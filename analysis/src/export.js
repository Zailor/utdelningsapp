#!/usr/bin/env node
// Export real data for the prototype web app (roadmap step 2).
//
// Writes two files that prototype/index.html picks up automatically (it falls
// back to demo data when they are missing, e.g. when opened via file://):
//
//   prototype/data/analysis.json  Gap-fill stats per stock, precomputed for
//                                 every UI combo (window × dropAt × basis) so
//                                 the tab stays fully interactive offline.
//   prototype/data/series.json    Daily closes + dividends for ALL analysed
//                                 stocks + index, on the index trading calendar.
//                                 The UI picks the strategy basket from these
//                                 via the Analysis-tab filters.
//
//   node src/export.js                          # large-cap, 8 år
//   node src/export.js --years 10
//   node src/export.js --universe demo
//   node src/export.js --refresh                # ignorera data/history-cachen

import { writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { fetchChartCached, loadHistory } from "./history.js";
import { analyzeEvents } from "./gapfill.js";
import { trailingDividendYield } from "./metrics.js";
import { INDEX } from "./stocks.js";
import { resolveUniverse } from "./universe.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT_DIR = join(ROOT, "..", "prototype", "data");

// Same combos as the UI's config buttons — keep in sync with index.html.
const WINDOWS = [20, 40, 60, 90];
const DROP_ATS = ["open", "close"];
const BASES = ["nominal", "index"];

const RANK_KEY = "w40_open_nominal";

function parseArgs(argv) {
  const a = {
    years: 8, universe: "large-cap", list: null, symbol: null,
    delay: 300, refresh: false, minEvents: 1,
    maxAge: 0, cachedOnly: false,
  };
  for (let i = 2; i < argv.length; i++) {
    const k = argv[i], v = argv[i + 1];
    const num = (x) => { i++; return Number(x); };
    if (k === "--years") a.years = num(v);
    else if (k === "--universe") { a.universe = v; i++; }
    else if (k === "--list") { a.list = v; i++; }
    else if (k === "--symbol") { a.symbol = v; i++; }
    else if (k === "--delay") a.delay = num(v);
    else if (k === "--minEvents") a.minEvents = num(v);
    else if (k === "--refresh") a.refresh = true;
    else if (k === "--maxAge") a.maxAge = num(v);
    else if (k === "--cachedOnly") a.cachedOnly = true;
  }
  return a;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const r2 = (x) => (x == null ? null : Math.round(x * 100) / 100);

function fromDate(years) {
  const d = new Date();
  d.setFullYear(d.getFullYear() - years);
  return d.toISOString().slice(0, 10);
}

function comboSummary(bars, dividends, indexBars, cfg) {
  const { events, summary } = analyzeEvents(bars, dividends, indexBars, cfg);
  return {
    n: summary.n,
    fillRate: r2(summary.fillRate),
    medianRec: summary.medianRec,
    fellRate: r2(summary.fellRate),
    avgRatio: r2(summary.avgRatio),
    maxRec: summary.maxRec,
    recentFill: r2(summary.recentFill),
    years: summary.years,
    gain1000: r2(summary.avgGainPct == null ? null : summary.avgGainPct * 1000),
    // Per x-dag, för detaljvyn: utdelning, kurs före, fall, exit och utfall
    // per 1 000 kr (gain, i kr). rec = handelsdagar till fyllt gap (null = ej).
    events: events.map((e) => ({
      date: e.exDate, rec: e.recovery,
      amount: r2(e.amount), pre: r2(e.pBefore), drop: r2(e.drop),
      exit: r2(e.exitClose), gain: r2(e.gainPct == null ? null : e.gainPct * 1000),
    })),
  };
}

function buildSeries(charts, symbols, indexBars, from) {
  const picked = symbols
    .map((sym) => charts.get(sym))
    .filter(Boolean);
  // Kalender = indexets alla handelsdagar. Aktier noterade senare får null
  // fram till första egna handelsdag — UI:t klipper kalendern per vald korg.
  const dates = indexBars.map((b) => b.date);
  const dateSet = new Set(dates);

  const stocks = picked.map((c) => {
    const closeByDate = new Map(c.bars.map((b) => [b.date, b.close]));
    let last = null; // senaste kursen före kalenderstart, om första dagen saknar avslut
    for (const b of c.bars) {
      if (b.date > dates[0]) break;
      last = b.close;
    }
    const closes = dates.map((d) => {
      const v = closeByDate.get(d);
      if (v != null) last = v;
      return r2(last); // luckor (ej handlad dag) fylls med senaste kurs
    });
    const dividends = c.dividends
      .filter((dv) => dv.exDate >= dates[0])
      .map((dv) => {
        let ex = dv.exDate; // snäpp till nästa kalenderdag om datumet saknas
        if (!dateSet.has(ex)) ex = dates.find((d) => d > dv.exDate) ?? null;
        return ex ? { exDate: ex, amount: dv.amount } : null;
      })
      .filter(Boolean);
    return { symbol: c.symbol, name: c.name, closes, dividends };
  });

  const idxByDate = new Map(indexBars.map((b) => [b.date, b.close]));
  let lastIdx = null;
  const indexCloses = dates.map((d) => {
    const v = idxByDate.get(d);
    if (v != null) lastIdx = v;
    return r2(lastIdx);
  });

  return { dates, stocks, indexCloses };
}

async function run() {
  const cfg = parseArgs(process.argv);
  const from = fromDate(cfg.years);
  let universe = resolveUniverse(cfg);
  // --cachedOnly: kör helt offline på det som redan finns i data/history/
  // (kombinera med --maxAge så att inte heller svansar hämtas).
  if (cfg.cachedOnly) {
    const all = universe.length;
    universe = universe.filter((s) => loadHistory(s.symbol));
    console.log(`--cachedOnly: ${universe.length} av ${all} aktier finns i cachen.`);
  }
  console.log(`Export: ${universe.length} aktier · ${cfg.years} år · index ${INDEX.symbol}`);

  const indexBars = (await fetchChartCached(INDEX.symbol, { from, refresh: cfg.refresh, maxAgeH: cfg.maxAge })).bars;

  const charts = new Map(); // symbol -> {symbol, name, bars, dividends}
  const rows = [];
  let skippedNoDiv = 0, failed = 0;
  for (const [i, s] of universe.entries()) {
    process.stderr.write(`\r  hämtar ${i + 1}/${universe.length} ${s.symbol}${" ".repeat(16)}`);
    if (i > 0 && cfg.delay > 0) await sleep(cfg.delay);
    try {
      const { bars, dividends } = await fetchChartCached(s.symbol, { from, refresh: cfg.refresh, maxAgeH: cfg.maxAge });
      if (!dividends.length) { skippedNoDiv++; continue; }
      charts.set(s.symbol, { symbol: s.symbol, name: s.name, bars, dividends });
      const combos = {};
      for (const w of WINDOWS)
        for (const dropAt of DROP_ATS)
          for (const basis of BASES)
            combos[`w${w}_${dropAt}_${basis}`] =
              comboSummary(bars, dividends, indexBars, { window: w, dropAt, basis });
      if (combos[RANK_KEY].n < cfg.minEvents) continue;
      const yld = trailingDividendYield(bars, dividends);
      rows.push({
        symbol: s.symbol, name: s.name,
        yield: r2(yld.yield),
        lastPrice: r2(yld.price),
        ttmDiv: r2(yld.ttm),
        combos,
      });
    } catch (e) {
      failed++;
      console.warn(`\n  ${s.name} (${s.symbol}): ${e.message}`);
    }
  }
  process.stderr.write(`\r${" ".repeat(48)}\r`);

  rows.sort((a, b) => {
    const A = a.combos[RANK_KEY], B = b.combos[RANK_KEY];
    if (Math.abs(B.fillRate - A.fillRate) > 0.01) return B.fillRate - A.fillRate;
    return (A.medianRec ?? 1e9) - (B.medianRec ?? 1e9);
  });

  mkdirSync(OUT_DIR, { recursive: true });
  const generated = new Date().toISOString();

  const analysisOut = {
    generated, source: "Yahoo Finance (dagliga, ojusterade kurser)",
    years: cfg.years, universe: cfg.symbol ?? cfg.list ?? cfg.universe,
    universeSize: universe.length,
    skipped: { noDividend: skippedNoDiv, failed },
    index: INDEX.symbol,
    rows,
  };
  const analysisPath = join(OUT_DIR, "analysis.json");
  writeFileSync(analysisPath, JSON.stringify(analysisOut));
  console.log(`Skrev ${analysisPath} (${rows.length} aktier, ${skippedNoDiv} utan utdelning, ${failed} fel).`);

  // Serier för ALLA analyserade aktier — korgen väljs i UI:t via Analys-filtren.
  const { dates, stocks, indexCloses } = buildSeries(charts, rows.map((r) => r.symbol), indexBars, from);
  const seriesOut = {
    generated, source: "Yahoo Finance",
    from: dates[0], to: dates[dates.length - 1],
    index: { symbol: INDEX.symbol, name: "OMX", closes: indexCloses },
    dates, stocks,
  };
  const seriesPath = join(OUT_DIR, "series.json");
  writeFileSync(seriesPath, JSON.stringify(seriesOut));
  console.log(`Skrev ${seriesPath} (${stocks.length} aktier · ${dates.length} dagar).`);
}

run().catch((e) => { console.error(e); process.exit(1); });
