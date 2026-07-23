// Dividend gap-fill analysis engine (pure, no I/O).
//
// For each historical ex-dividend date it measures:
//   1. how far the price dropped on the ex-day vs the dividend, and
//   2. how many trading days until the (unadjusted) close is back at the
//      pre-ex level ("the gap is filled").
//
// Everything is computed from a plain daily bar series, so the same engine
// runs over real Yahoo data or over test fixtures without change.

/** @typedef {{date:string, open:number, high:number, low:number, close:number}} Bar */
/** @typedef {{exDate:string, amount:number}} Dividend */

/**
 * @param {Bar[]} bars               daily bars, ascending by date, unadjusted prices
 * @param {Dividend[]} dividends     ex-dates + amounts, ascending by date
 * @param {Bar[]|null} indexBars     benchmark index bars (e.g. ^OMX) for index-relative recovery, or null
 * @param {{window?:number, dropAt?:'open'|'close', basis?:'nominal'|'index'}} cfg
 */
export function analyzeEvents(bars, dividends, indexBars, cfg = {}) {
  const window = cfg.window ?? 40;
  const dropAt = cfg.dropAt === "close" ? "close" : "open";
  const basis = cfg.basis === "index" ? "index" : "nominal";
  const idxByDate = indexBars ? new Map(indexBars.map((b) => [b.date, b.close])) : null;

  const sortedDivs = [...dividends].sort((a, b) => (a.exDate < b.exDate ? -1 : 1));
  const events = [];

  for (let d = 0; d < sortedDivs.length; d++) {
    const div = sortedDivs[d];
    const exIndex = findExIndex(bars, div.exDate);
    if (exIndex <= 0) continue; // need at least one prior trading day

    const base = bars[exIndex - 1]; // last cum-dividend day
    const exBar = bars[exIndex];
    const pBefore = base.close;
    if (!(pBefore > 0)) continue;

    const dropOpen = round(pBefore - exBar.open);
    const dropClose = round(pBefore - exBar.close);
    const drop = dropAt === "open" ? dropOpen : dropClose;

    // Recovery scan is capped at the window and never crosses into the next
    // dividend cycle (a fill after the next ex-day is a different event).
    const nextDiv = sortedDivs[d + 1];
    const nextExIndex = nextDiv ? findExIndex(bars, nextDiv.exDate) : -1;
    const hardCap = nextExIndex > exIndex ? nextExIndex - 1 : bars.length - 1;
    const last = Math.min(exIndex + window, hardCap);

    const idxBase = basis === "index" && idxByDate ? idxByDate.get(base.date) ?? null : null;

    let recovery = null;
    for (let j = exIndex; j <= last; j++) {
      let threshold = pBefore;
      if (basis === "index" && idxBase) {
        const idxJ = idxByDate.get(bars[j].date);
        if (idxJ) threshold = pBefore * (idxJ / idxBase);
      }
      if (bars[j].close >= threshold - 1e-9) {
        recovery = j - exIndex; // trading days after the ex-day
        break;
      }
    }

    // Outcome of "buy at pBefore, collect the dividend, sell when the gap
    // fills — or at the scan end if it never does": exit close + dividend vs
    // entry. Excludes courtage; the Strategy tab does the full backtest.
    const exitClose = bars[recovery !== null ? exIndex + recovery : last].close;
    const gainPct = (div.amount + exitClose - pBefore) / pBefore;

    events.push({
      exDate: div.exDate,
      amount: div.amount,
      pBefore,
      exOpen: exBar.open,
      exClose: exBar.close,
      dropOpen,
      dropClose,
      drop,
      ratio: div.amount ? drop / div.amount : null,
      fell: drop >= div.amount,
      recovery,
      recovered: recovery !== null,
      exitClose,
      gainPct,
    });
  }

  return { events, summary: summarize(events, window) };
}

function findExIndex(bars, exDate) {
  for (let i = 0; i < bars.length; i++) if (bars[i].date === exDate) return i;
  for (let i = 0; i < bars.length; i++) if (bars[i].date > exDate) return i; // ex-date not a trading day → next session
  return -1;
}

function summarize(events, window) {
  const n = events.length;
  const recovered = events.filter((e) => e.recovered);
  const recDays = recovered.map((e) => e.recovery);
  const years = events.map((e) => +e.exDate.slice(0, 4));
  const maxYear = years.length ? Math.max(...years) : null;
  const recent = maxYear === null ? [] : events.filter((e) => +e.exDate.slice(0, 4) >= maxYear - 2);
  return {
    window,
    n,
    fillRate: n ? (recovered.length / n) * 100 : 0,
    medianRec: median(recDays),
    fellRate: n ? (events.filter((e) => e.fell).length / n) * 100 : 0,
    avgRatio: mean(events.map((e) => e.ratio).filter((x) => x != null)),
    maxRec: recDays.length ? Math.max(...recDays) : null,
    recentFill: recent.length ? (recent.filter((e) => e.recovered).length / recent.length) * 100 : null,
    years: years.length ? [Math.min(...years), maxYear] : null,
    avgGainPct: mean(events.map((e) => e.gainPct).filter((x) => x != null)),
  };
}

export function median(arr) {
  if (!arr.length) return null;
  const s = [...arr].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
export function mean(arr) {
  return arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null;
}
function round(x) {
  return Math.round(x * 1e6) / 1e6;
}
