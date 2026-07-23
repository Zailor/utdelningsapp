// Local raw-data cache: one JSON file per stock under data/history/ with the
// full fetched series { bars, dividends }. First run fetches full history;
// later runs fetch only the tail (with overlap) and merge — so daily updates
// are cheap and re-running with other flags costs no network at all.
//
// Split safety: Yahoo prices are unadjusted, so a split rescales the whole
// series. If the fresh tail disagrees with the cached overlap the cache is
// thrown away and the full history refetched.
//
// mergeSeries() is pure and unit-tested; the I/O lives in fetchChartCached().

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { fetchChart } from "./yahoo.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const HISTORY_DIR = join(ROOT, "data", "history");

// Trading days can get corrected after the fact (and the newest bar is partial
// while the market is open) — refetch this many calendar days of overlap.
const OVERLAP_DAYS = 10;
// Overlap closes differing more than this ⇒ split/restatement ⇒ full refetch.
const MISMATCH_TOL = 0.005;

function fileFor(symbol) {
  return join(HISTORY_DIR, `${symbol.replace(/[^\w.-]/g, "_")}.json`);
}

export function loadHistory(symbol) {
  const f = fileFor(symbol);
  if (!existsSync(f)) return null;
  try {
    return JSON.parse(readFileSync(f, "utf8"));
  } catch {
    return null; // trasig fil ⇒ behandla som ocachad
  }
}

export function saveHistory(symbol, hist) {
  mkdirSync(HISTORY_DIR, { recursive: true });
  writeFileSync(fileFor(symbol), JSON.stringify(hist));
}

/**
 * Merge a freshly fetched tail into a cached series. Pure.
 * Bars are replaced by date where they overlap; dividends unioned by exDate
 * (fresh wins). Returns { ok:false } when overlapping closes disagree —
 * the sign of a split or restated history.
 */
export function mergeSeries(cached, fresh) {
  if (!fresh.bars.length) return { ok: true, bars: cached.bars, dividends: cached.dividends };

  const freshStart = fresh.bars[0].date;
  for (const b of cached.bars) {
    if (b.date < freshStart) continue;
    const f = fresh.bars.find((x) => x.date === b.date);
    if (f && Math.abs(f.close - b.close) / b.close > MISMATCH_TOL) return { ok: false };
  }

  const bars = cached.bars.filter((b) => b.date < freshStart).concat(fresh.bars);
  const div = new Map(cached.dividends.map((d) => [d.exDate, d]));
  for (const d of fresh.dividends) div.set(d.exDate, d);
  const dividends = [...div.values()].sort((a, b) => (a.exDate < b.exDate ? -1 : 1));
  return { ok: true, bars, dividends };
}

const isoDaysBefore = (iso, days) =>
  new Date(new Date(iso).getTime() - days * 864e5).toISOString().slice(0, 10);

const clip = (hist, from) => ({
  bars: hist.bars.filter((b) => b.date >= from),
  dividends: hist.dividends.filter((d) => d.exDate >= from),
});

/**
 * Like fetchChart, but backed by the local cache. Full fetch when the cache is
 * missing, doesn't reach back to `from`, or disagrees with fresh data; a small
 * tail fetch + merge otherwise. Returns { bars, dividends } clipped to `from`.
 * @param {string} symbol
 * @param {{from:string, refresh?:boolean, maxAgeH?:number}} opts
 *   refresh ⇒ ignore cache · maxAgeH > 0 ⇒ skip the network entirely when the
 *   cache was updated within that many hours (makes interrupted runs resumable)
 */
export async function fetchChartCached(symbol, { from, refresh = false, maxAgeH = 0 } = {}) {
  const cached = refresh ? null : loadHistory(symbol);

  if (
    cached && cached.from <= from && cached.bars.length && maxAgeH > 0 &&
    cached.updated && Date.now() - new Date(cached.updated).getTime() < maxAgeH * 36e5
  ) {
    return clip(cached, from);
  }

  let hist = null;
  if (cached && cached.from <= from && cached.bars.length) {
    const tailFrom = isoDaysBefore(cached.bars[cached.bars.length - 1].date, OVERLAP_DAYS);
    const fresh = await fetchChart(symbol, { from: tailFrom });
    const merged = mergeSeries(cached, fresh);
    if (merged.ok) {
      hist = { ...cached, currency: fresh.currency ?? cached.currency, bars: merged.bars, dividends: merged.dividends };
    } else {
      console.warn(`  ${symbol}: cache stämmer inte med färsk data (split?) – hämtar om hela historiken`);
    }
  }

  if (!hist) {
    const full = await fetchChart(symbol, { from });
    hist = { symbol, currency: full.currency, from, bars: full.bars, dividends: full.dividends };
  }

  hist.updated = new Date().toISOString();
  saveHistory(symbol, hist);

  return clip(hist, from);
}
