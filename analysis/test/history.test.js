import { test } from "node:test";
import assert from "node:assert/strict";
import { mergeSeries } from "../src/history.js";

const bar = (date, close) => ({ date, open: close, high: close, low: close, close });

const cached = {
  bars: [bar("2026-07-01", 100), bar("2026-07-02", 101), bar("2026-07-03", 102)],
  dividends: [{ exDate: "2026-03-10", amount: 4 }],
};

test("tail merge appends new bars and replaces the overlap by date", () => {
  const fresh = {
    bars: [bar("2026-07-03", 102.5), bar("2026-07-04", 103)], // 07-03 corrected within tolerance
    dividends: [],
  };
  const m = mergeSeries(cached, fresh);
  assert.equal(m.ok, true);
  assert.deepEqual(m.bars.map((b) => b.date), ["2026-07-01", "2026-07-02", "2026-07-03", "2026-07-04"]);
  assert.equal(m.bars[2].close, 102.5); // fresh value wins in the overlap
});

test("dividends are unioned by exDate, fresh wins", () => {
  const fresh = {
    bars: [bar("2026-07-04", 103)],
    dividends: [
      { exDate: "2026-03-10", amount: 4.5 }, // restated amount
      { exDate: "2026-09-01", amount: 2 },
    ],
  };
  const m = mergeSeries(cached, fresh);
  assert.equal(m.ok, true);
  assert.deepEqual(m.dividends, [
    { exDate: "2026-03-10", amount: 4.5 },
    { exDate: "2026-09-01", amount: 2 },
  ]);
});

test("overlap price mismatch (split) → not ok, caller refetches full history", () => {
  const fresh = { bars: [bar("2026-07-03", 51), bar("2026-07-04", 51.5)], dividends: [] }; // 2:1 split
  assert.equal(mergeSeries(cached, fresh).ok, false);
});

test("empty fresh fetch leaves the cache untouched", () => {
  const m = mergeSeries(cached, { bars: [], dividends: [] });
  assert.equal(m.ok, true);
  assert.deepEqual(m.bars, cached.bars);
  assert.deepEqual(m.dividends, cached.dividends);
});
