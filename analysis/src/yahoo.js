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

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const execFileP = promisify(execFile);

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

// Yahoo throttles anonymous clients hard (429). A session cookie from
// fc.yahoo.com lifts the limit considerably; fetched once, shared by all calls.
let cookiePromise = null;
function yahooCookie() {
  if (!cookiePromise) {
    cookiePromise = fetch("https://fc.yahoo.com", {
      headers: { "User-Agent": UA },
      redirect: "manual",
    })
      .then((r) => (r.headers.get("set-cookie") || "").split(";")[0] || null)
      .catch(() => null);
  }
  return cookiePromise;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Yahoo also fingerprints the TLS client and 429:ar scripted clients (curl,
// Node fetch) from some networks while letting real browsers through. Fallback:
// fetch the URL through headless Chrome, which passes the fingerprint check.
// Overrides: CHROME env var points at the binary.
const CHROME_PATHS = [
  process.env.CHROME,
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Chromium.app/Contents/MacOS/Chromium",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium-browser",
  "/usr/bin/chromium",
].filter(Boolean);

function findChrome() {
  return CHROME_PATHS.find((p) => existsSync(p)) || null;
}

async function fetchJsonViaChrome(url) {
  const chrome = findChrome();
  if (!chrome) throw new Error("ingen Chrome/Chromium hittad (sätt CHROME=<sökväg>)");
  // --headless=old: the new headless mode hangs on plain JSON responses.
  const { stdout } = await execFileP(
    chrome,
    [
      "--headless=old", "--disable-gpu", "--no-first-run",
      // Per-process profil: en delad katalog ger SingletonLock-krockar så
      // fort två hämtare (t.ex. export + validate) råkar köra samtidigt.
      `--user-data-dir=${join(tmpdir(), `utdelningsapp-chrome-${process.pid}`)}`,
      "--timeout=20000", "--dump-dom", url,
    ],
    { maxBuffer: 64 * 1024 * 1024, timeout: 60000 }
  );
  const m = stdout.match(/<pre[^>]*>([\s\S]*?)<\/pre>/);
  if (!m) throw new Error("Chrome gav inget JSON-svar");
  // dump-dom HTML-escapes the body; &amp; must be decoded last.
  const text = m[1]
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&");
  return JSON.parse(text);
}

let useChrome = false; // sticky once direct fetch has been 429-blocked

/**
 * Fetch daily bars + dividends for a symbol from Yahoo.
 * Direct fetch first; on 429 falls back to headless Chrome (sticky), else
 * retries with backoff.
 * @param {string} symbol  e.g. "INVE-B.ST", "^OMX"
 * @param {{from?:string|Date, to?:string|Date}} range
 */
export async function fetchChart(symbol, { from, to } = {}) {
  const p1 = from ? unix(from) : 0;
  const p2 = to ? unix(to) : Math.floor(Date.now() / 1000);
  const url =
    `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}` +
    `?period1=${p1}&period2=${p2}&interval=1d&events=div`;

  if (useChrome) return parseChart(await fetchJsonViaChrome(url));

  const cookie = await yahooCookie();
  const headers = {
    // Yahoo rejects requests without a browser-like UA.
    "User-Agent": UA,
    Accept: "application/json",
    ...(cookie ? { Cookie: cookie } : {}),
  };

  const backoff = [2000, 8000];
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url, { headers });
    if (res.ok) return parseChart(await res.json());
    if (res.status === 429 && findChrome()) {
      console.warn("Yahoo blockerar direktanrop (429) – växlar till headless Chrome som hämtare.");
      useChrome = true;
      return parseChart(await fetchJsonViaChrome(url));
    }
    if (res.status !== 429 || attempt >= backoff.length) {
      throw new Error(`Yahoo svarade ${res.status} för ${symbol}`);
    }
    const retryAfter = Number(res.headers.get("retry-after")) * 1000;
    await sleep(retryAfter > 0 ? retryAfter : backoff[attempt]);
  }
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
