import { test } from "node:test";
import assert from "node:assert/strict";
import { analyzeEvents, median, mean } from "../src/gapfill.js";
import { parseChart } from "../src/yahoo.js";

// A single ex-dividend event that recovers on the 3rd trading day after ex.
const recoverBars = [
  { date: "2023-05-02", open: 100, high: 101, low: 99, close: 100 }, // cum day
  { date: "2023-05-03", open: 95, high: 97, low: 94, close: 96 },    // EX, div 5
  { date: "2023-05-04", open: 96, high: 98, low: 95, close: 97 },
  { date: "2023-05-05", open: 97, high: 100, low: 97, close: 99 },
  { date: "2023-05-08", open: 99, high: 102, low: 99, close: 101 },  // back >= 100
  { date: "2023-05-09", open: 101, high: 103, low: 100, close: 102 },
];
const recoverDivs = [{ exDate: "2023-05-03", amount: 5 }];

// Same shape but the price never returns to the pre-ex level.
const failBars = [
  { date: "2024-05-02", open: 100, high: 101, low: 99, close: 100 },
  { date: "2024-05-03", open: 92, high: 94, low: 91, close: 93 }, // EX, div 5
  { date: "2024-05-06", open: 93, high: 95, low: 92, close: 94 },
  { date: "2024-05-07", open: 94, high: 96, low: 93, close: 95 },
  { date: "2024-05-08", open: 95, high: 97, low: 94, close: 96 },
  { date: "2024-05-09", open: 96, high: 98, low: 95, close: 97 },
  { date: "2024-05-10", open: 97, high: 98, low: 96, close: 98 },
];
const failDivs = [{ exDate: "2024-05-03", amount: 5 }];

test("drop@open: fell computed against the dividend, recovery in trading days", () => {
  const { events, summary } = analyzeEvents(recoverBars, recoverDivs, null, { window: 40, dropAt: "open", basis: "nominal" });
  assert.equal(events.length, 1);
  assert.equal(events[0].drop, 5);          // 100 - 95
  assert.equal(events[0].fell, true);       // 5 >= 5
  assert.equal(events[0].recovery, 3);      // ex 05-03 → 05-08
  assert.equal(events[0].recovered, true);
  assert.equal(summary.fillRate, 100);
  assert.equal(summary.medianRec, 3);
});

test("drop@close changes the drop and the fell flag, not the recovery", () => {
  const { events } = analyzeEvents(recoverBars, recoverDivs, null, { window: 40, dropAt: "close", basis: "nominal" });
  assert.equal(events[0].drop, 4);      // 100 - 96
  assert.equal(events[0].fell, false);  // 4 < 5
  assert.equal(events[0].recovery, 3);  // recovery still on close vs pBefore
});

test("no recovery within the data → recovered false, fillRate 0", () => {
  const { events, summary } = analyzeEvents(failBars, failDivs, null, { window: 40, dropAt: "open", basis: "nominal" });
  assert.equal(events[0].recovered, false);
  assert.equal(events[0].recovery, null);
  assert.equal(summary.fillRate, 0);
  assert.equal(summary.fellRate, 100); // 8 >= 5
});

test("shorter window can turn a recovery into a miss", () => {
  const { events } = analyzeEvents(recoverBars, recoverDivs, null, { window: 2, dropAt: "open", basis: "nominal" });
  assert.equal(events[0].recovered, false); // recovery needs day 3, window only covers 2
});

test("index basis raises the bar: a nominal fill can miss when the index rose", () => {
  const indexBars = [
    { date: "2023-05-02", close: 1000 }, // base
    { date: "2023-05-03", close: 1005 },
    { date: "2023-05-04", close: 1010 },
    { date: "2023-05-05", close: 1020 },
    { date: "2023-05-08", close: 1035 }, // +3.5% → threshold 103.5 > close 101
    { date: "2023-05-09", close: 1040 },
  ];
  const nominal = analyzeEvents(recoverBars, recoverDivs, indexBars, { window: 40, dropAt: "open", basis: "nominal" });
  const index = analyzeEvents(recoverBars, recoverDivs, indexBars, { window: 40, dropAt: "open", basis: "index" });
  assert.equal(nominal.events[0].recovered, true);
  assert.equal(index.events[0].recovered, false);
});

test("recovery does not leak across the next dividend cycle", () => {
  // Two ex-dates back to back; the first never fills before the second ex-day.
  const bars = [
    { date: "2023-01-02", open: 100, high: 100, low: 99, close: 100 },
    { date: "2023-01-03", open: 90, high: 91, low: 89, close: 90 },  // EX #1, div 10
    { date: "2023-01-04", open: 90, high: 92, low: 90, close: 91 },
    { date: "2023-01-05", open: 91, high: 93, low: 90, close: 92 },  // day before EX #2
    { date: "2023-01-09", open: 101, high: 102, low: 100, close: 101 }, // EX #2 day (would exceed 100)
  ];
  const divs = [{ exDate: "2023-01-03", amount: 10 }, { exDate: "2023-01-09", amount: 3 }];
  const { events } = analyzeEvents(bars, divs, null, { window: 40, dropAt: "open", basis: "nominal" });
  assert.equal(events[0].recovered, false); // capped before EX #2, never reached 100
});

test("ex-date that is not a trading day falls through to the next session", () => {
  const bars = [
    { date: "2023-06-01", open: 50, high: 51, low: 49, close: 50 },
    { date: "2023-06-05", open: 48, high: 49, low: 47, close: 48 }, // next session after a weekend/holiday ex-date
    { date: "2023-06-06", open: 49, high: 51, low: 49, close: 50 },
  ];
  const divs = [{ exDate: "2023-06-02", amount: 2 }]; // 06-02 not present
  const { events } = analyzeEvents(bars, divs, null, { window: 40, dropAt: "open", basis: "nominal" });
  assert.equal(events.length, 1);
  assert.equal(events[0].pBefore, 50);   // 06-01 close
  assert.equal(events[0].drop, 2);       // 50 - 48
  assert.equal(events[0].recovery, 1);   // 06-06 close 50
});

test("median and mean helpers", () => {
  assert.equal(median([3]), 3);
  assert.equal(median([1, 2, 3, 4]), 2.5);
  assert.equal(median([]), null);
  assert.equal(mean([1, 2, 3]), 2);
});

test("parseChart turns a Yahoo payload into bars + dividends", () => {
  const payload = {
    chart: {
      result: [
        {
          meta: { symbol: "INVE-B.ST", currency: "SEK" },
          timestamp: [1683010800, 1683097200], // 2023-05-02, 2023-05-03 (07:00 UTC)
          indicators: { quote: [{ open: [100, 95], high: [101, 97], low: [99, 94], close: [100, 96] }] },
          events: { dividends: { "1683097200": { amount: 5, date: 1683097200 } } },
        },
      ],
    },
  };
  const { symbol, currency, bars, dividends } = parseChart(payload);
  assert.equal(symbol, "INVE-B.ST");
  assert.equal(currency, "SEK");
  assert.equal(bars.length, 2);
  assert.equal(bars[0].date, "2023-05-02");
  assert.equal(bars[1].close, 96);
  assert.equal(dividends.length, 1);
  assert.equal(dividends[0].exDate, "2023-05-03");
  assert.equal(dividends[0].amount, 5);
});

test("parseChart throws a clear error on an empty result", () => {
  assert.throws(() => parseChart({ chart: { result: [] } }), /ingen data/);
});

test("gainPct: recovered event exits at the recovery close, dividend included", () => {
  const { events, summary } = analyzeEvents(recoverBars, recoverDivs, null, { window: 40, dropAt: "open", basis: "nominal" });
  // Buy at 100, dividend 5, sell at recovery close 101 → (5 + 101 - 100) / 100
  assert.equal(events[0].exitClose, 101);
  assert.ok(Math.abs(events[0].gainPct - 0.06) < 1e-9);
  assert.ok(Math.abs(summary.avgGainPct - 0.06) < 1e-9);
});

test("gainPct: unrecovered event exits at the scan end and can be negative net of the dividend", () => {
  const { events } = analyzeEvents(failBars, failDivs, null, { window: 40, dropAt: "open", basis: "nominal" });
  // Buy at 100, dividend 5, stuck at 98 at the end → (5 + 98 - 100) / 100
  assert.equal(events[0].recovered, false);
  assert.equal(events[0].exitClose, 98);
  assert.ok(Math.abs(events[0].gainPct - 0.03) < 1e-9);
});
