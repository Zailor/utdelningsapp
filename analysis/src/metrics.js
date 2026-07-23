// Small metrics used to pre-filter the universe before the full gap-fill run.

/**
 * Trailing dividend yield: dividends paid over the last `months` months divided
 * by the latest close. Lets you drop low/no-dividend stocks up front.
 * @param {{date:string, close:number}[]} bars
 * @param {{exDate:string, amount:number}[]} dividends
 * @param {number} months
 * @returns {{yield:number, ttm:number, price:number|null}}
 */
export function trailingDividendYield(bars, dividends, months = 12) {
  if (!bars.length) return { yield: 0, ttm: 0, price: null };
  const price = bars[bars.length - 1].close;
  const cutoff = shiftMonths(bars[bars.length - 1].date, -months);
  const ttm = dividends
    .filter((d) => d.exDate > cutoff)
    .reduce((sum, d) => sum + (d.amount || 0), 0);
  return { yield: price > 0 ? (ttm / price) * 100 : 0, ttm, price };
}

function shiftMonths(iso, delta) {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCMonth(d.getUTCMonth() + delta);
  return d.toISOString().slice(0, 10);
}
