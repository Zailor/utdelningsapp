// Yahoo Finance data client for Swedish stocks.
//
// Yahoo's public chart endpoint returns daily OHLC bars (unadjusted) plus
// dividend events in one call. It is unofficial and unauthenticated — great
// for a hobby/prototype, but it can change or rate-limit, and browsers can't
// call it directly (CORS), so this runs server-side.
//
// parseChart() is kept separate from fetchChart() so the parser is unit-tested
// without network access.

/**
 * Turn a raw Yahoo chart JSON payload into { bars, dividends }.
 * @param {any} json
 */
export function parseChart(json) {
  const r = json?.chart?.result?.[0];
  if (!r) {
    const msg = json?.chart?.error?.description || "okänt fel";
    throw new Error(`Yahoo: ingen data (${msg})`);
  }
  const ts = r.timestamp || [];
  const q = (r.indicators?.quote && r.indicators.quote[0]) || {};

  const bars = ts
    .map((t, i) => ({
      date: isoDate(t),
      open: num(q.open?.[i]),
      high: num(q.high?.[i]),
      low: num(q.low?.[i]),
      close: num(q.close?.[i]),
    }))
    .filter((b) => b.date && b.open != null && b.close != null);

  const divObj = r.events?.dividends || {};
  const dividends = Object.values(divObj)
    .map((d) => ({ exDate: isoDate(d.date), amount: d.amount }))
    .filter((d) => d.exDate && d.amount != null)
    .sort((a, b) => (a.exDate < b.exDate ? -1 : 1));

  return {
    symbol: r.meta?.symbol ?? null,
    currency: r.meta?.currency ?? null,
    bars,
    dividends,
  };
}

/**
 * Fetch daily bars + dividends for a symbol from Yahoo.
 * @param {string} symbol  e.g. "INVE-B.ST", "^OMX"
 * @param {{from?:string|Date, to?:string|Date}} range
 */
export async function fetchChart(symbol, { from, to } = {}) {
  const p1 = from ? unix(from) : 0;
  const p2 = to ? unix(to) : Math.floor(Date.now() / 1000);
  const url =
    `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}` +
    `?period1=${p1}&period2=${p2}&interval=1d&events=div`;

  const res = await fetch(url, {
    headers: {
      // Yahoo rejects requests without a browser-like UA.
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36",
      Accept: "application/json",
    },
  });
  if (!res.ok) throw new Error(`Yahoo svarade ${res.status} för ${symbol}`);
  return parseChart(await res.json());
}

function isoDate(t) {
  if (typeof t !== "number") return null;
  // Daily bars are stamped at market open; for Stockholm (UTC+1/+2) the UTC
  // calendar day matches the trading day.
  return new Date(t * 1000).toISOString().slice(0, 10);
}
function num(x) {
  return typeof x === "number" && isFinite(x) ? x : null;
}
function unix(d) {
  return Math.floor(new Date(d).getTime() / 1000);
}
